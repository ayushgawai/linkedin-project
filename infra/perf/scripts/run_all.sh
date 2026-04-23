#!/usr/bin/env bash
# =============================================================================
# Phase 5 benchmark runner.
#
# Flow per scenario:
#   1. Ensure services are up with the desired cache mode (ON / OFF).
#   2. POST /benchmark/cache/flush to start cold.
#   3. Sleep 3s (JIT + pool warm-up).
#   4. Run JMeter in non-GUI mode → write .jtl + JMeter HTML report.
#   5. Move on to next mode / scenario.
#
# After all runs complete, invoke summarize.js + compare_chart.py for charts.
#
# Usage:
#   bash infra/perf/scripts/run_all.sh
#   bash infra/perf/scripts/run_all.sh --only=A         # A only, both modes
#   bash infra/perf/scripts/run_all.sh --only=B --mode=on
#   BENCH_JMETER_DURATION=30 bash infra/perf/scripts/run_all.sh
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PERF_DIR="$( cd "$SCRIPT_DIR/.." && pwd )"
REPO_ROOT="$( cd "$PERF_DIR/../.." && pwd )"
PLANS_DIR="$PERF_DIR/plans"
DATA_DIR="$PERF_DIR/data"
RESULTS_DIR="$PERF_DIR/results"
mkdir -p "$RESULTS_DIR"

HOST="${BENCH_HOST:-localhost}"
THREADS="${BENCH_JMETER_THREADS:-50}"
RAMP="${BENCH_JMETER_RAMP:-10}"
DURATION="${BENCH_JMETER_DURATION:-120}"
BENCH_TOKEN="${BENCH_ADMIN_TOKEN:-dev-only}"
COMPOSE_FILE="${COMPOSE_FILE:-$REPO_ROOT/infra/docker-compose.yml}"

ONLY=""
MODE_FILTER=""
for arg in "$@"; do
  case "$arg" in
    --only=*) ONLY="${arg#--only=}" ;;
    --mode=*) MODE_FILTER="${arg#--mode=}" ;;
    -h|--help)
      grep '^#' "$0" | sed 's/^# \?//'; exit 0 ;;
    *) echo "unknown arg: $arg"; exit 2 ;;
  esac
done

command -v jmeter >/dev/null 2>&1 || {
  echo "ERROR: jmeter not on PATH. On macOS: brew install jmeter" >&2; exit 1;
}

# Scenario table: id|name|jmx|port
SCENARIOS=(
  "A|job_search_detail|scenario_a_job_search_detail.jmx|8002"
  "B|analytics_dashboard|scenario_b_analytics_dashboard.jmx|8006"
  "C|profile_read_update|scenario_c_profile_read_update.jmx|8001"
)

MODES=(on off)
[[ -n "$MODE_FILTER" ]] && MODES=("$MODE_FILTER")

echo "[run_all] host=$HOST threads=$THREADS duration=${DURATION}s results=$RESULTS_DIR"

flip_redis() {
  local mode="$1"
  local value
  if [[ "$mode" == "on" ]]; then value="true"; else value="false"; fi
  echo "[run_all] flipping REDIS_ENABLED=$value — recreating profile/job/analytics"
  (
    cd "$REPO_ROOT"
    REDIS_ENABLED="$value" docker compose -f "$COMPOSE_FILE" \
      up -d --no-deps --force-recreate profile job analytics >/dev/null
  )
  # Wait for services to report healthy.
  # NOTE: use `hp` (not `port`) because bash uses dynamic scoping — naming
  # this loop variable `port` clobbers the caller's `port` and every scenario
  # ends up invoked with the last healthcheck port (8006). That bug silently
  # made scenarios A and C hit the analytics service, producing 404s.
  local hp
  for hp in 8001 8002 8006; do
    for i in {1..30}; do
      if curl -sf "http://${HOST}:${hp}/health" >/dev/null 2>&1; then
        break
      fi
      sleep 1
    done
  done
}

flush_cache() {
  curl -sf -X POST "http://${HOST}:8006/benchmark/cache/flush" \
       -H "X-Bench-Token: $BENCH_TOKEN" \
       -H 'Content-Type: application/json' >/dev/null || true
}

run_one() {
  local scenario_id="$1" scenario_name="$2" jmx="$3" port="$4" mode="$5"
  local ts; ts="$(date +%Y%m%d-%H%M%S)"
  local tag="${scenario_id}_${mode}_${ts}"
  local jtl="$RESULTS_DIR/${tag}.jtl"
  local report_dir="$RESULTS_DIR/${tag}"
  mkdir -p "$report_dir"

  echo ""
  echo "[run_all] ==== Scenario $scenario_id ($scenario_name) — mode=$mode ===="
  flip_redis "$mode"
  flush_cache
  sleep 3

  jmeter -n -t "$PLANS_DIR/$jmx" -l "$jtl" -e -o "$report_dir" \
    -Jhost="$HOST" -Jport="$port" \
    -Jthreads="$THREADS" -Jrampup="$RAMP" -Jduration="$DURATION" \
    -Jdata_dir="$DATA_DIR" \
    -j "$RESULTS_DIR/${tag}.jmeter.log" \
    >/dev/null

  echo "[run_all]   JTL:    $jtl"
  echo "[run_all]   report: $report_dir/index.html"
}

for entry in "${SCENARIOS[@]}"; do
  IFS='|' read -r id name jmx port <<< "$entry"
  [[ -n "$ONLY" && "$ONLY" != "$id" ]] && continue
  for mode in "${MODES[@]}"; do
    run_one "$id" "$name" "$jmx" "$port" "$mode"
  done
done

# Restore Redis ON at end so the stack is left in the default config
flip_redis on

echo ""
echo "[run_all] summarising..."
node "$PERF_DIR/scripts/summarize.js" "$RESULTS_DIR" || {
  echo "[run_all] summarize.js failed (non-fatal)"; }

if command -v python3 >/dev/null 2>&1; then
  python3 "$PERF_DIR/scripts/compare_chart.py" "$RESULTS_DIR" || {
    echo "[run_all] compare_chart.py failed (non-fatal, probably matplotlib missing)"; }
else
  echo "[run_all] skipping compare_chart.py — python3 not on PATH"
fi

echo "[run_all] done. Charts: $RESULTS_DIR/charts/  Summary: $RESULTS_DIR/summary.csv"
