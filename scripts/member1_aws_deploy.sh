#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${1:-${ROOT_DIR}/.env.aws}"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Missing env file: ${ENV_FILE}" >&2
  exit 1
fi

set -a
source "${ENV_FILE}"
set +a

: "${AWS_REGION:?AWS_REGION is required}"
: "${AWS_ACCOUNT_ID:?AWS_ACCOUNT_ID is required}"
: "${AWS_ECR_REGISTRY:?AWS_ECR_REGISTRY is required}"
: "${AWS_PROFILE_REPOSITORY:?AWS_PROFILE_REPOSITORY is required}"
: "${AWS_JOB_REPOSITORY:?AWS_JOB_REPOSITORY is required}"
: "${AWS_APPLICATION_REPOSITORY:?AWS_APPLICATION_REPOSITORY is required}"
: "${AWS_IMAGE_TAG:?AWS_IMAGE_TAG is required}"
: "${AWS_APP_STACK_NAME:?AWS_APP_STACK_NAME is required}"
: "${AWS_DB_PASSWORD:?AWS_DB_PASSWORD is required}"
: "${AWS_DB_NAME:?AWS_DB_NAME is required}"
: "${AWS_DB_USER:?AWS_DB_USER is required}"

aws ecr get-login-password --region "${AWS_REGION}" \
  | docker login --username AWS --password-stdin "${AWS_ECR_REGISTRY}"

PROFILE_IMAGE_URI="${AWS_ECR_REGISTRY}/${AWS_PROFILE_REPOSITORY}:${AWS_IMAGE_TAG}"
JOB_IMAGE_URI="${AWS_ECR_REGISTRY}/${AWS_JOB_REPOSITORY}:${AWS_IMAGE_TAG}"
APPLICATION_IMAGE_URI="${AWS_ECR_REGISTRY}/${AWS_APPLICATION_REPOSITORY}:${AWS_IMAGE_TAG}"

docker build -f "${ROOT_DIR}/services/profile/Dockerfile" -t "${PROFILE_IMAGE_URI}" "${ROOT_DIR}"
docker build -f "${ROOT_DIR}/services/job/Dockerfile" -t "${JOB_IMAGE_URI}" "${ROOT_DIR}"
docker build -f "${ROOT_DIR}/services/application/Dockerfile" -t "${APPLICATION_IMAGE_URI}" "${ROOT_DIR}"

docker push "${PROFILE_IMAGE_URI}"
docker push "${JOB_IMAGE_URI}"
docker push "${APPLICATION_IMAGE_URI}"

aws cloudformation deploy \
  --region "${AWS_REGION}" \
  --stack-name "${AWS_APP_STACK_NAME}" \
  --template-file "${ROOT_DIR}/infra/aws/member1-ecs-rds.yaml" \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides \
    VpcCidr="${AWS_VPC_CIDR:-10.40.0.0/16}" \
    PublicSubnet1Cidr="${AWS_PUBLIC_SUBNET_1_CIDR:-10.40.1.0/24}" \
    PublicSubnet2Cidr="${AWS_PUBLIC_SUBNET_2_CIDR:-10.40.2.0/24}" \
    DbName="${AWS_DB_NAME}" \
    DbUser="${AWS_DB_USER}" \
    DbPassword="${AWS_DB_PASSWORD}" \
    DbInstanceClass="${AWS_DB_INSTANCE_CLASS:-db.t3.micro}" \
    ProfileImageUri="${PROFILE_IMAGE_URI}" \
    JobImageUri="${JOB_IMAGE_URI}" \
    ApplicationImageUri="${APPLICATION_IMAGE_URI}"

aws cloudformation describe-stacks \
  --region "${AWS_REGION}" \
  --stack-name "${AWS_APP_STACK_NAME}" \
  --query 'Stacks[0].Outputs[*].[OutputKey,OutputValue]' \
  --output table
