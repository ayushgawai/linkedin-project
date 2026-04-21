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
: "${AWS_ECR_STACK_NAME:=linkedinclone-backend-ecr}"

"${AWS_BIN}" cloudformation deploy \
  --region "${AWS_REGION}" \
  --stack-name "${AWS_ECR_STACK_NAME}" \
  --template-file "${ROOT_DIR}/infra/aws/backend-ecr.yaml" \
  --no-fail-on-empty-changeset

"${AWS_BIN}" cloudformation describe-stacks \
  --region "${AWS_REGION}" \
  --stack-name "${AWS_ECR_STACK_NAME}" \
  --query 'Stacks[0].Outputs[*].[OutputKey,OutputValue]' \
  --output table
