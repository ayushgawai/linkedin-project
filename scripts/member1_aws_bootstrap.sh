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
: "${AWS_ECR_STACK_NAME:?AWS_ECR_STACK_NAME is required}"

aws cloudformation deploy \
  --region "${AWS_REGION}" \
  --stack-name "${AWS_ECR_STACK_NAME}" \
  --template-file "${ROOT_DIR}/infra/aws/member1-ecr.yaml"

aws cloudformation describe-stacks \
  --region "${AWS_REGION}" \
  --stack-name "${AWS_ECR_STACK_NAME}" \
  --query 'Stacks[0].Outputs[*].[OutputKey,OutputValue]' \
  --output table
