#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${1:-${ROOT_DIR}/.env}"
AWS_BIN="${AWS_BIN:-/opt/homebrew/bin/aws}"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Missing env file: ${ENV_FILE}" >&2
  exit 1
fi

if [[ ! -x "${AWS_BIN}" ]]; then
  echo "AWS CLI not found at ${AWS_BIN}" >&2
  exit 1
fi

set -a
source "${ENV_FILE}"
set +a

: "${AWS_REGION:?AWS_REGION is required}"
: "${AWS_APP_STACK_NAME:=linkedinclone-backend-platform}"
: "${AWS_ECR_STACK_NAME:=linkedinclone-backend-ecr}"
: "${AWS_PROFILE_REPOSITORY:=linkedinclone-profile-service}"
: "${AWS_JOB_REPOSITORY:=linkedinclone-job-service}"
: "${AWS_APPLICATION_REPOSITORY:=linkedinclone-application-service}"

echo "Deleting application stack: ${AWS_APP_STACK_NAME}"
"${AWS_BIN}" cloudformation delete-stack \
  --region "${AWS_REGION}" \
  --stack-name "${AWS_APP_STACK_NAME}"

echo "Waiting for application stack deletion to complete..."
"${AWS_BIN}" cloudformation wait stack-delete-complete \
  --region "${AWS_REGION}" \
  --stack-name "${AWS_APP_STACK_NAME}"

for repository in \
  "${AWS_PROFILE_REPOSITORY}" \
  "${AWS_JOB_REPOSITORY}" \
  "${AWS_APPLICATION_REPOSITORY}"; do
  IMAGE_IDS="$("${AWS_BIN}" ecr list-images \
    --region "${AWS_REGION}" \
    --repository-name "${repository}" \
    --query 'imageIds' \
    --output json 2>/dev/null || echo '[]')"

  if [[ "${IMAGE_IDS}" != "[]" ]]; then
    echo "Removing images from ECR repository: ${repository}"
    "${AWS_BIN}" ecr batch-delete-image \
      --region "${AWS_REGION}" \
      --repository-name "${repository}" \
      --image-ids "${IMAGE_IDS}" >/dev/null || true
  fi
done

echo "Deleting ECR stack: ${AWS_ECR_STACK_NAME}"
"${AWS_BIN}" cloudformation delete-stack \
  --region "${AWS_REGION}" \
  --stack-name "${AWS_ECR_STACK_NAME}"

echo "Waiting for ECR stack deletion to complete..."
"${AWS_BIN}" cloudformation wait stack-delete-complete \
  --region "${AWS_REGION}" \
  --stack-name "${AWS_ECR_STACK_NAME}"

echo "AWS backend stacks deleted."
