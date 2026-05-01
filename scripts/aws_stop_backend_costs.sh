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

CLUSTER_NAME="linkedinclone-backend-cluster"

mapfile -t SERVICES < <(
  "${AWS_BIN}" cloudformation describe-stack-resources \
    --region "${AWS_REGION}" \
    --stack-name "${AWS_APP_STACK_NAME}" \
    --query 'StackResources[?ResourceType==`AWS::ECS::Service`].PhysicalResourceId' \
    --output text | tr '\t' '\n' | sed '/^$/d'
)

for service in "${SERVICES[@]}"; do
  echo "Scaling ${service} to desired count 0"
  "${AWS_BIN}" ecs update-service \
    --region "${AWS_REGION}" \
    --cluster "${CLUSTER_NAME}" \
    --service "${service}" \
    --desired-count 0 >/dev/null
done

DB_INSTANCE_ID="$(
  "${AWS_BIN}" cloudformation describe-stack-resources \
    --region "${AWS_REGION}" \
    --stack-name "${AWS_APP_STACK_NAME}" \
    --query 'StackResources[?LogicalResourceId==`Database`].PhysicalResourceId' \
    --output text
)"

if [[ -n "${DB_INSTANCE_ID}" && "${DB_INSTANCE_ID}" != "None" ]]; then
  DB_STATUS="$("${AWS_BIN}" rds describe-db-instances \
    --region "${AWS_REGION}" \
    --db-instance-identifier "${DB_INSTANCE_ID}" \
    --query 'DBInstances[0].DBInstanceStatus' \
    --output text)"

  if [[ "${DB_STATUS}" == "available" ]]; then
    echo "Stopping RDS instance ${DB_INSTANCE_ID}"
    "${AWS_BIN}" rds stop-db-instance \
      --region "${AWS_REGION}" \
      --db-instance-identifier "${DB_INSTANCE_ID}" >/dev/null
  else
    echo "RDS instance ${DB_INSTANCE_ID} is ${DB_STATUS}; leaving it unchanged."
  fi
fi

echo "ECS services scaled to zero. RDS stop has been requested when supported."
