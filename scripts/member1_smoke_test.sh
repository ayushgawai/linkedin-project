#!/usr/bin/env bash

set -euo pipefail

BASE_URL="${1:-http://localhost}"

echo "Using base URL: ${BASE_URL}"

echo
echo "== Health checks =="
curl -fsS "${BASE_URL}:8001/health" | python3 -m json.tool
curl -fsS "${BASE_URL}:8002/health" | python3 -m json.tool
curl -fsS "${BASE_URL}:8003/health" | python3 -m json.tool

echo
echo "== Profile search =="
curl -fsS "${BASE_URL}:8001/members/search" \
  -H 'content-type: application/json' \
  -d '{"page":1,"page_size":5}' | python3 -m json.tool

echo
echo "== Job search =="
curl -fsS "${BASE_URL}:8002/jobs/search" \
  -H 'content-type: application/json' \
  -d '{"page":1,"page_size":5}' | python3 -m json.tool

echo
echo "== Application list by member =="
curl -fsS "${BASE_URL}:8003/applications/byMember" \
  -H 'content-type: application/json' \
  -d '{"member_id":"22222222-2222-2222-2222-222222222222","page":1,"page_size":5}' | python3 -m json.tool

echo
echo "Member 1 smoke test completed."
