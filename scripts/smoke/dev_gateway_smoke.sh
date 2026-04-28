#!/usr/bin/env bash
set -euo pipefail

base="${1:-http://127.0.0.1:8000}"

post() {
  local path="$1"
  local body="$2"
  curl -sS -X POST "$base$path" -H 'content-type: application/json' -d "$body"
}

echo "[smoke] gateway health"
curl -sS "$base/health" >/dev/null

echo "[smoke] signup member"
uniq="$(date +%s)"
member=$(post "/members/create" "{\"email\":\"member1+$uniq@example.com\",\"password\":\"dev\",\"full_name\":\"Member One\",\"location\":\"San Jose, CA\",\"headline\":\"Backend Engineer\",\"role\":\"member\"}")
member_id=$(node -e "console.log(JSON.parse(process.argv[1]).user?.member_id || JSON.parse(process.argv[1]).member_id || '')" "$member")
echo "  member_id=$member_id"

echo "[smoke] signup recruiter"
rec=$(post "/recruiters/create" "{\"email\":\"recruiter1+$uniq@example.com\",\"password\":\"dev\",\"full_name\":\"Recruiter One\",\"location\":\"San Jose, CA\",\"headline\":\"Recruiter\",\"role\":\"recruiter\"}")
recruiter_id=$(node -e "console.log(JSON.parse(process.argv[1]).user.recruiter_id || JSON.parse(process.argv[1]).user.member_id)" "$rec")
echo "  recruiter_id=$recruiter_id"

echo "[smoke] create job (frontend shape)"
job=$(post "/jobs/create" "$(cat <<JSON
{"recruiter_id":"$recruiter_id","title":"Backend Engineer","description":"Own APIs","location":"San Jose, CA","work_mode":"hybrid","employment_type":"full_time","industry":"Software","skills_required":["Node.js","Kafka"]}
JSON
)")
job_id=$(node -e "console.log(JSON.parse(process.argv[1]).job_id)" "$job")
echo "  job_id=$job_id"

echo "[smoke] list jobs"
post "/jobs/search" '{"keyword":"Backend","location":"San Jose","page":1,"pageSize":5}' >/dev/null

echo "[smoke] get job"
post "/jobs/get" "$(printf '{"job_id":"%s"}' "$job_id")" >/dev/null

echo "[smoke] increment views"
post "/jobs/incrementViews" "$(printf '{"job_id":"%s"}' "$job_id")" >/dev/null

echo "[smoke] submit application (frontend shape)"
app=$(post "/applications/submit" "$(cat <<JSON
{"job_id":"$job_id","member_id":"$member_id","resume_url":"https://example.com/resume.pdf","contact_email":"member1@example.com","contact_phone":"+1-555-0101","answers":{"visa":"yes"}}
JSON
)")
app_id=$(node -e "console.log(JSON.parse(process.argv[1]).application_id)" "$app")
echo "  application_id=$app_id"

echo "[smoke] recruiter list applicants"
post "/applications/byJob" "$(printf '{"job_id":"%s","page":1,"page_size":10}' "$job_id")" >/dev/null

echo "[smoke] update status"
post "/applications/updateStatus" "$(printf '{"application_id":"%s","status":"reviewing"}' "$app_id")" >/dev/null

echo "[smoke] add note (frontend shape)"
post "/applications/addNote" "$(printf '{"application_id":"%s","note":"Looks good"}' "$app_id")" >/dev/null

echo "[smoke] done"

