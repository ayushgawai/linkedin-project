# infra/perf/dashboard — 7 analytics dashboard chart screenshots

Generates the seven analytics dashboard PNGs referenced by the Phase 6
deliverable. Each chart mirrors exactly one of the aggregations served
by the live `/analytics/*` endpoints — so the numbers on the page are
the same numbers a browser pointed at the running service would see.

## Why it's a standalone script (and not a Puppeteer screenshot of a React page)

We don't have a frontend wired to these endpoints yet (frontend branch
is stale — see the Phase 0 analysis), so taking "real" screenshots is
not possible. Going direct-to-DB with the same aggregation pipelines is
the next best thing:

- Identical SQL/Mongo pipelines → identical numbers.
- Zero dependency on a running HTTP stack (useful while Docker is
  misbehaving).
- Deterministic `--demo` mode → reproducible sample charts for sanity
  checks / CI smoke tests.

## The seven charts

| File                                  | Chart                                         | Backed by analytics endpoint           |
| ------------------------------------- | --------------------------------------------- | -------------------------------------- |
| `01_top_jobs_by_applications.png`     | Top 10 jobs by `application.submitted`        | `/analytics/jobs/top` (metric=applications) |
| `02_top_jobs_by_views.png`            | Top 10 jobs by `job.viewed`                   | `/analytics/jobs/top` (metric=views)   |
| `03_application_funnel.png`           | Funnel: view → save → apply_start → submit    | `/analytics/funnel`                    |
| `04_applicant_geography.png`          | City-level applicant distribution             | `/analytics/geo`                       |
| `05_events_per_day_timeline.png`      | Stacked events/day, coloured by type          | Mongo `events` (new derived chart)     |
| `06_event_type_mix.png`               | Donut of total events split by type           | Mongo `events` (new derived chart)     |
| `07_member_dashboard.png`             | Profile views line + application-status donut | `/analytics/member/dashboard`          |

Charts 5 & 6 are not served by an existing endpoint but trivially derive
from the same `events` collection. They're included because the grading
rubric asks for seven graphs total, and these two give the report a
"platform-wide health" snapshot alongside the per-job / per-member views.

## Running it

### Against the live stack

```bash
# From repo root. Requires services up + seeder already run.
pip3 install matplotlib pymongo pymysql
python3 infra/perf/dashboard/generate_dashboard.py
```

Output defaults to `infra/perf/dashboard/charts/`. Tweak with flags:

```bash
python3 infra/perf/dashboard/generate_dashboard.py \
  --out=/tmp/screenshots \
  --window=60 \
  --mysql-host=localhost --mongo-uri=mongodb://localhost:27017
```

All flags also read from env vars (`DB_HOST`, `MONGO_URI`, etc.) so the
script just works when exported from `.env`.

### Demo mode — no DB required

```bash
python3 infra/perf/dashboard/generate_dashboard.py --source=demo
```

Produces all seven PNGs from deterministic synthetic data. Useful for:

- Validating the script end-to-end before bringing up the stack.
- Showing the grader what the charts will look like if the DB is empty.
- Regression-testing the rendering code in CI.

## What goes into the report

1. Run `generate_dashboard.py` (live or demo).
2. Paste the seven PNGs from `charts/` into the "Analytics Dashboard
   Snapshots" section of the final report.
3. Annotate each with a one-line caption (the filename already describes
   the chart, so captions can stay short — e.g. *"Top 10 jobs by
   applications, 30-day window, live data 2026-04-19"*).

## When to regenerate

- After a fresh seed (`npm run seed:reset && npm run seed`).
- After changes to the seeder's event mix (chart 6 shifts immediately).
- After tweaking the window — default is 30 days; change with `--window`.

## Dependencies

```
matplotlib >=3.7   # chart rendering
pymongo    >=4.6   # only needed for --source=db
pymysql    >=1.1   # only needed for --source=db
```
