#!/usr/bin/env bash
# Remove JMeter outputs under infra/perf/results so you can start a clean sweep.
# Deletes: *.jtl, paired *.jmeter.log, HTML report dirs, summary.csv, charts/
#
# Usage:
#   bash infra/perf/scripts/clean_perf_results.sh
#   bash infra/perf/scripts/clean_perf_results.sh --dry-run

set -euo pipefail

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PERF_DIR="$( cd "$SCRIPT_DIR/.." && pwd )"
RESULTS_DIR="$PERF_DIR/results"

DRY_RUN=false
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true ;;
    -h|--help)
      grep '^#' "$0" | sed 's/^# \?//'; exit 0 ;;
    *)
      echo "unknown arg: $arg (use --dry-run)" >&2; exit 2 ;;
  esac
done

rm_path() {
  if $DRY_RUN; then
    echo "[clean] would remove: $1"
  else
    rm -rf "$1"
  fi
}

shopt -s nullglob
count=0
for jtl in "$RESULTS_DIR"/*.jtl; do
  base="$RESULTS_DIR/$(basename "$jtl" .jtl)"
  rm_path "$jtl"
  rm_path "${base}.jmeter.log"
  rm_path "${base}"
  count=$((count + 1))
done

rm_path "$RESULTS_DIR/summary.csv"
rm_path "$RESULTS_DIR/charts"

for d in "$RESULTS_DIR"/*/; do
  [[ -d "$d" ]] || continue
  base="$(basename "$d")"
  [[ "$base" == "charts" ]] && continue
  rm_path "$d"
done

if $DRY_RUN; then
  echo "[clean] dry-run finished ($count .jtl files listed)"
else
  echo "[clean] removed JMeter artifacts under $RESULTS_DIR (${count} runs)"
fi
