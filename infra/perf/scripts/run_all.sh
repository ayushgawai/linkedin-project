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
#   bash infra/perf/scripts/clean_perf_results.sh   # optional: wipe old .jtl / reports
#   bash infra/perf/scripts/run_all.sh
#   bash infra/perf/scripts/run_all.sh b
#   bash infra/perf/scripts/run_all.sh bs --only=A
#   bash infra/perf/scripts/run_all.sh bsk
#   bash infra/perf/scripts/run_all.sh bsk_other
#   bash infra/perf/scripts/run_all.sh full
#   BENCH_JMETER_DURATION=30 bash infra/perf/scripts/run_all.sh
#
# JTL names include thread count: {scenario}_{mode}_{threads}u_{timestamp}.jtl
# so charts can filter apples-to-apples (see BENCH_CHART_THREADS / compare_chart.py).
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
THREADS="${BENCH_JMETER_THREADS:-100}"
RAMP="${BENCH_JMETER_RAMP:-10}"
DURATION="${BENCH_JMETER_DURATION:-60}"
BENCH_TOKEN="${BENCH_ADMIN_TOKEN:-dev-only}"
COMPOSE_FILE="${COMPOSE_FILE:-$REPO_ROOT/infra/docker-compose.yml}"

POSITIONAL_MODE=""
if [[ $# -gt 0 ]]; then
  case "$1" in
    b|bs|bsk|bsk_other|full)
      POSITIONAL_MODE="$1"
      shift
      ;;
  esac
fi

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
  "B|apply_submit|scenario_b_apply_submit.jmx|8003"
  "C|profile_read_update|scenario_c_profile_read_update.jmx|8001"
  "D|analytics_dashboard|scenario_d_analytics_dashboard.jmx|8006"
)

map_mode_to_flags() {
  local mode="$1"
  case "$mode" in
    b)
      MODE_LABEL="b"
      FLAG_REDIS="false"
      FLAG_KAFKA="false"
      FLAG_OTHER="false"
      ;;
    bs)
      MODE_LABEL="bs"
      FLAG_REDIS="true"
      FLAG_KAFKA="false"
      FLAG_OTHER="false"
      ;;
    bsk)
      MODE_LABEL="bsk"
      FLAG_REDIS="true"
      FLAG_KAFKA="true"
      FLAG_OTHER="false"
      ;;
    bsk_other)
      MODE_LABEL="bsk_other"
      FLAG_REDIS="true"
      FLAG_KAFKA="true"
      FLAG_OTHER="true"
      ;;
    on)
      MODE_LABEL="on"
      FLAG_REDIS="true"
      FLAG_KAFKA="${KAFKA_ENABLED:-true}"
      FLAG_OTHER="${OTHER_TECHNIQUES_ENABLED:-true}"
      ;;
    off)
      MODE_LABEL="off"
      FLAG_REDIS="false"
      FLAG_KAFKA="${KAFKA_ENABLED:-true}"
      FLAG_OTHER="${OTHER_TECHNIQUES_ENABLED:-true}"
      ;;
    *)
      echo "unknown mode: $mode" >&2
      exit 2
      ;;
  esac
}

MODES=()
if [[ -n "$POSITIONAL_MODE" ]]; then
  if [[ "$POSITIONAL_MODE" == "full" ]]; then
    MODES=(b bs bsk bsk_other)
  else
    MODES=("$POSITIONAL_MODE")
  fi
elif [[ -n "$MODE_FILTER" ]]; then
  MODES=("$MODE_FILTER")
else
  # Backward-compatible default behavior.
  MODES=(on off)
fi

echo "[run_all] host=$HOST threads=$THREADS duration=${DURATION}s results=$RESULTS_DIR"

apply_mode() {
  local mode="$1"
  map_mode_to_flags "$mode"
  echo "[run_all] applying mode=$mode (REDIS_ENABLED=$FLAG_REDIS KAFKA_ENABLED=$FLAG_KAFKA OTHER_TECHNIQUES_ENABLED=$FLAG_OTHER)"
  (
    cd "$REPO_ROOT"
    REDIS_ENABLED="$FLAG_REDIS" \
    KAFKA_ENABLED="$FLAG_KAFKA" \
    OTHER_TECHNIQUES_ENABLED="$FLAG_OTHER" \
      docker compose -f "$COMPOSE_FILE" \
      up -d --no-deps --force-recreate profile job application analytics >/dev/null
  )
  # Wait for services to report healthy.
  # NOTE: use `hp` (not `port`) because bash uses dynamic scoping — naming
  # this loop variable `port` clobbers the caller's `port` and every scenario
  # ends up invoked with the last healthcheck port (8006). That bug silently
  # made scenarios A and C hit the analytics service, producing 404s.
  local hp
  for hp in 8001 8002 8003 8006; do
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
  apply_mode "$mode"
  local ts; ts="$(date +%Y%m%d-%H%M%S)"
  local tag="${scenario_id}_${MODE_LABEL}_${THREADS}u_${ts}"
  local jtl="$RESULTS_DIR/${tag}.jtl"
  local report_dir="$RESULTS_DIR/${tag}"
  mkdir -p "$report_dir"

  echo ""
  echo "[run_all] ==== Scenario $scenario_id ($scenario_name) — mode=$mode ===="
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
apply_mode on

echo ""
echo "[run_all] summarising..."
node "$PERF_DIR/scripts/summarize.js" "$RESULTS_DIR" || {
  echo "[run_all] summarize.js failed (non-fatal)"; }

if command -v python3 >/dev/null 2>&1; then
  BENCH_CHART_THREADS="${BENCH_CHART_THREADS:-$THREADS}" \
    python3 "$PERF_DIR/scripts/compare_chart.py" "$RESULTS_DIR" || {
    echo "[run_all] compare_chart.py failed (non-fatal, probably matplotlib missing)"; }
else
  echo "[run_all] skipping compare_chart.py — python3 not on PATH"
fi

echo "[run_all] done. Charts: $RESULTS_DIR/charts/  Summary: $RESULTS_DIR/summary.csv"
