# infra/perf — JMeter Performance Suite

End-to-end load / benchmark suite for Member 5's Phase 5 deliverable.
Scenarios can be run in base (`b`), SQL cache (`bs`), Kafka (`bsk`), and
Kafka + additional techniques (`bsk_other`) modes for side-by-side comparison.

## Scenarios

| ID  | Name                        | Target endpoints                                                                                                 | Users / duration | What it proves                                                            |
| --- | --------------------------- | ---------------------------------------------------------------------------------------------------------------- | ---------------- | ------------------------------------------------------------------------- |
| A   | Job search + detail         | `POST /jobs/search`, `POST /jobs/get`                                                                            | 100 / 60 s       | Read-path cache-aside win on a realistic "browse + drill-down" flow      |
| B   | Application submit          | `POST /applications/submit`                                                                                      | 100 / 60 s       | Write-path contention + Kafka emit cost under concurrent application load |
| C   | Profile read + invalidation | `POST /members/get` (90%), `POST /members/update` (10%)                                                          | 100 / 60 s       | Cache-aside with write-through invalidation (stale-read risk exposed)    |
| D   | Analytics dashboard         | `POST /analytics/jobs/top`, `POST /analytics/funnel`, `POST /analytics/geo`, `POST /analytics/member/dashboard` | 100 / 60 s       | Aggregation-heavy analytics endpoints and optional "Other" optimizations |

Each scenario writes a raw `.jtl` to `results/<scenario>_<mode>_<timestamp>.jtl`
plus a JMeter HTML report to `results/<scenario>_<mode>_<timestamp>/`.

## Prerequisites

1. **Apache JMeter 5.6+** on PATH. macOS: `brew install jmeter`.
2. Stack up: `docker compose -f infra/docker-compose.yml up -d --build`.
3. Seeded: `npm run seed` (once, from repo root).
4. Extract IDs into CSV fixtures: `node infra/perf/scripts/extract_ids.js`.
5. Python 3 + matplotlib (only if you want the comparison charts):
   `pip3 install matplotlib`. Without it you still get the per-scenario
   HTML reports and CSV summaries.

## Running

```bash
# From repo root — backward-compatible default (legacy on/off sequence).
bash infra/perf/scripts/run_all.sh

# Run one explicit mode.
bash infra/perf/scripts/run_all.sh b
bash infra/perf/scripts/run_all.sh bs
bash infra/perf/scripts/run_all.sh bsk
bash infra/perf/scripts/run_all.sh bsk_other

# Run all named modes in sequence (b, bs, bsk, bsk_other).
bash infra/perf/scripts/run_all.sh full

# Custom duration / user count via env vars:
BENCH_JMETER_DURATION=30 BENCH_JMETER_THREADS=10 bash infra/perf/scripts/run_all.sh bsk --only=A
```

Between runs the script:

1. `POST /benchmark/cache/flush` (Redis drop-all).
2. Waits 3 s for JIT warm-up.
3. Fires the JMX with non-GUI mode (`-n -t plan.jmx -l result.jtl -e -o html_out/`).

## Output

```
infra/perf/results/
├── A_on_20260419-154200.jtl              # raw samples (1 row per request)
├── A_on_20260419-154200/                 # JMeter's HTML dashboard
├── A_off_20260419-154210.jtl
├── A_off_20260419-154210/
├── B_on_...  B_off_...  C_on_...  C_off_...
├── summary.csv                           # per-scenario aggregated CSV
└── charts/
    ├── A_latency_comparison.png          # p50 / p95 / avg bar chart
    ├── B_latency_comparison.png
    ├── C_latency_comparison.png
    ├── all_throughput.png                # req/s side-by-side
    └── cache_hit_ratio_timeline.png
```

## Mode Flags

`run_all.sh` applies mode-specific env flags before each JMeter pass:

- `b`: `REDIS_ENABLED=false`, `KAFKA_ENABLED=false`
- `bs`: `REDIS_ENABLED=true`, `KAFKA_ENABLED=false`
- `bsk`: `REDIS_ENABLED=true`, `KAFKA_ENABLED=true`, `OTHER_TECHNIQUES_ENABLED=false`
- `bsk_other`: `REDIS_ENABLED=true`, `KAFKA_ENABLED=true`, `OTHER_TECHNIQUES_ENABLED=true`

## What "Other" Means

`OTHER_TECHNIQUES_ENABLED` is implemented in the analytics service and currently toggles:

1. **MySQL pool boost**: doubles analytics `DB_POOL_MAX` (`connectionLimit=DB_POOL_MAX*2`).
2. **Analytics endpoint caching**: enables Redis `getOrSet(..., 30s)` caching for:
   - `POST /analytics/jobs/top`
   - `POST /analytics/funnel`
   - `POST /analytics/geo`

When `OTHER_TECHNIQUES_ENABLED=false`, those endpoints bypass Redis and query MongoDB/MySQL directly.

## Toggling Redis off

`run_all.sh` does this for you. Manual flip:

```bash
REDIS_ENABLED=false KAFKA_ENABLED=false OTHER_TECHNIQUES_ENABLED=false \
  docker compose -f infra/docker-compose.yml \
  up -d --no-deps --force-recreate profile job application analytics
```

The services continue running — `cache.js` degrades gracefully, every
request hits MySQL/Mongo directly. Flip back with `REDIS_ENABLED=true`.

## Submission artifacts (Phase 6)

After a successful `run_all.sh`:

- `results/charts/*.png` → paste into the final report.
- `results/summary.csv` → append to the report's "raw numbers" appendix.
- `results/<scenario>_<mode>_<ts>/index.html` → zip and attach for graders
  who want to drill down (request percentile curves, throughput over time).
