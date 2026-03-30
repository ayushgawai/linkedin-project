#!/usr/bin/env bash
set -euo pipefail

doc="docs/submission/LinkedInClone_API_Documentation.md"
docx="docs/submission/LinkedInClone_API_Documentation.docx"

contains_fixed() {
  local needle="$1"
  local file="$2"
  if command -v rg >/dev/null 2>&1; then
    rg -F -q "$needle" "$file"
  else
    grep -F -q "$needle" "$file"
  fi
}

required_endpoints=(
  "/members/create" "/members/get" "/members/update" "/members/delete" "/members/search"
  "/jobs/create" "/jobs/get" "/jobs/update" "/jobs/search" "/jobs/close" "/jobs/byRecruiter"
  "/applications/submit" "/applications/get" "/applications/byJob" "/applications/byMember" "/applications/updateStatus" "/applications/addNote"
  "/threads/open" "/threads/get" "/messages/list" "/messages/send" "/threads/byUser"
  "/connections/request" "/connections/accept" "/connections/reject" "/connections/list" "/connections/mutual"
  "/events/ingest" "/analytics/jobs/top" "/analytics/funnel" "/analytics/geo" "/analytics/member/dashboard"
  "/ai/request" "/ai/status" "/ai/approve" "/ai/stream/{task_id}"
)

required_topics=(
  "job.viewed" "job.saved" "application.submitted" "message.sent" "connection.requested" "ai.requests" "ai.results"
)

required_envelope_fields=(
  '"event_type"' '"trace_id"' '"timestamp"' '"actor_id"' '"entity"' '"payload"' '"idempotency_key"'
)

for e in "${required_endpoints[@]}"; do
  contains_fixed "$e" "$doc" || { echo "Missing endpoint: $e"; exit 1; }
done

for t in "${required_topics[@]}"; do
  contains_fixed "$t" "$doc" || { echo "Missing topic: $t"; exit 1; }
done

for f in "${required_envelope_fields[@]}"; do
  contains_fixed "$f" "$doc" || { echo "Missing envelope field: $f"; exit 1; }
done

contains_fixed "Professor:** Simon Shim" "$doc" || { echo "Missing professor name"; exit 1; }

[[ -s "$docx" ]] || { echo "DOCX output missing or empty: $docx"; exit 1; }

echo "Submission API documentation check passed."
