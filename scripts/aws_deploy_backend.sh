#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${1:-${ROOT_DIR}/.env}"
AWS_BIN="${AWS_BIN:-/opt/homebrew/bin/aws}"
DOCKER_BIN="${DOCKER_BIN:-/Applications/Docker.app/Contents/Resources/bin/docker}"
DOCKER_BIN_DIR="$(dirname "${DOCKER_BIN}")"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Missing env file: ${ENV_FILE}" >&2
  exit 1
fi

if [[ ! -x "${AWS_BIN}" ]]; then
  echo "AWS CLI not found at ${AWS_BIN}" >&2
  exit 1
fi

if [[ ! -x "${DOCKER_BIN}" ]]; then
  echo "Docker CLI not found at ${DOCKER_BIN}" >&2
  exit 1
fi

export PATH="${DOCKER_BIN_DIR}:/opt/homebrew/bin:${PATH}"

set -a
source "${ENV_FILE}"
set +a

: "${AWS_REGION:?AWS_REGION is required}"
: "${AWS_ACCOUNT_ID:?AWS_ACCOUNT_ID is required}"
: "${AWS_PROFILE_REPOSITORY:=linkedinclone-profile-service}"
: "${AWS_JOB_REPOSITORY:=linkedinclone-job-service}"
: "${AWS_APPLICATION_REPOSITORY:=linkedinclone-application-service}"
: "${AWS_IMAGE_TAG:=backend-latest}"
: "${AWS_APP_STACK_NAME:=linkedinclone-backend-platform}"
: "${AWS_DB_PASSWORD:?AWS_DB_PASSWORD is required}"
: "${AWS_DB_NAME:=linkedinclone}"
: "${AWS_DB_USER:=admin}"

AWS_ECR_REGISTRY="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
AWS_ADMIN_CIDR="${AWS_ADMIN_CIDR:-$(curl -fsS https://checkip.amazonaws.com | tr -d '\n')/32}"

"${AWS_BIN}" ecr get-login-password --region "${AWS_REGION}" \
  | "${DOCKER_BIN}" login --username AWS --password-stdin "${AWS_ECR_REGISTRY}"

PROFILE_IMAGE_URI="${AWS_ECR_REGISTRY}/${AWS_PROFILE_REPOSITORY}:${AWS_IMAGE_TAG}"
JOB_IMAGE_URI="${AWS_ECR_REGISTRY}/${AWS_JOB_REPOSITORY}:${AWS_IMAGE_TAG}"
APPLICATION_IMAGE_URI="${AWS_ECR_REGISTRY}/${AWS_APPLICATION_REPOSITORY}:${AWS_IMAGE_TAG}"

"${DOCKER_BIN}" buildx build --platform linux/amd64 -f "${ROOT_DIR}/services/profile/Dockerfile" -t "${PROFILE_IMAGE_URI}" "${ROOT_DIR}" --push
"${DOCKER_BIN}" buildx build --platform linux/amd64 -f "${ROOT_DIR}/services/job/Dockerfile" -t "${JOB_IMAGE_URI}" "${ROOT_DIR}" --push
"${DOCKER_BIN}" buildx build --platform linux/amd64 -f "${ROOT_DIR}/services/application/Dockerfile" -t "${APPLICATION_IMAGE_URI}" "${ROOT_DIR}" --push

"${AWS_BIN}" cloudformation deploy \
  --region "${AWS_REGION}" \
  --stack-name "${AWS_APP_STACK_NAME}" \
  --template-file "${ROOT_DIR}/infra/aws/backend-platform.yaml" \
  --capabilities CAPABILITY_NAMED_IAM \
  --no-fail-on-empty-changeset \
  --parameter-overrides \
    VpcCidr="${AWS_VPC_CIDR:-10.40.0.0/16}" \
    PublicSubnet1Cidr="${AWS_PUBLIC_SUBNET_1_CIDR:-10.40.1.0/24}" \
    PublicSubnet2Cidr="${AWS_PUBLIC_SUBNET_2_CIDR:-10.40.2.0/24}" \
    AdminCidr="${AWS_ADMIN_CIDR}" \
    DbName="${AWS_DB_NAME}" \
    DbUser="${AWS_DB_USER}" \
    DbPassword="${AWS_DB_PASSWORD}" \
    DbInstanceClass="${AWS_DB_INSTANCE_CLASS:-db.t3.micro}" \
    ProfileImageUri="${PROFILE_IMAGE_URI}" \
    JobImageUri="${JOB_IMAGE_URI}" \
    ApplicationImageUri="${APPLICATION_IMAGE_URI}"

mapfile -t SERVICES < <(
  "${AWS_BIN}" cloudformation describe-stack-resources \
    --region "${AWS_REGION}" \
    --stack-name "${AWS_APP_STACK_NAME}" \
    --query 'StackResources[?ResourceType==`AWS::ECS::Service`].PhysicalResourceId' \
    --output text | tr '\t' '\n' | sed '/^$/d'
)

for service in "${SERVICES[@]}"; do
  "${AWS_BIN}" ecs update-service \
    --region "${AWS_REGION}" \
    --cluster "linkedinclone-backend-cluster" \
    --service "${service}" \
    --force-new-deployment >/dev/null
done

"${AWS_BIN}" cloudformation describe-stacks \
  --region "${AWS_REGION}" \
  --stack-name "${AWS_APP_STACK_NAME}" \
  --query 'Stacks[0].Outputs[*].[OutputKey,OutputValue]' \
  --output table
