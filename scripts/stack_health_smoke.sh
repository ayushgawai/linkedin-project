#!/usr/bin/env bash
# Smoke test: GET /health on every service exposed in docker-compose (host ports 8001–8007).
# Usage: ./scripts/stack_health_smoke.sh [BASE_URL]
# Default BASE_URL is http://127.0.0.1 (override if services bind elsewhere).

set -euo pipefail

BASE_URL="${1:-http://127.0.0.1}"
BASE_URL="${BASE_URL%/}"

echo "Stack health (expect HTTP 200 JSON from each service)"
echo "Base: ${BASE_URL}"
echo

for port in 8001 8002 8003 8004 8005 8006 8007; do
  name=""
  case "${port}" in
    8001) name="profile" ;;
    8002) name="job" ;;
    8003) name="application" ;;
    8004) name="messaging" ;;
    8005) name="connection" ;;
    8006) name="analytics" ;;
    8007) name="ai-agent" ;;
  esac
  url="${BASE_URL}:${port}/health"
  echo "== ${name} (${url}) =="
  curl -fsS "${url}" | python3 -m json.tool
  echo
done

echo "All health checks completed."
