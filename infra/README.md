# infra — local stack

`docker-compose.yml` brings up everything the Analytics / Redis / JMeter
benchmark suite needs:

| Service       | Host port | Image / build                  | Purpose                                   |
| ------------- | --------- | ------------------------------ | ----------------------------------------- |
| `mysql`       | 3306      | `mysql:8.4`                    | Relational store (`data/schema.sql`)      |
| `mongodb`     | 27017     | `mongo:7`                      | Event + profile_view store                |
| `redis`       | 6379      | `redis:7-alpine` (LRU, 256 MB) | Cache-aside layer                         |
| `zookeeper`   | 2181      | Confluent 7.6                  | Kafka coordination                        |
| `kafka`       | 9092      | Confluent 7.6                  | Event bus (INSIDE 29092 / OUTSIDE 9092)   |
| `kafka-init`  | —         | Confluent 7.6 (one-shot)       | Creates required topics then exits        |
| `profile`     | 8001      | `services/profile/Dockerfile`  | Minimal members CRUD (cache-aside)        |
| `job`         | 8002      | `services/job/Dockerfile`      | Minimal jobs CRUD + search (cache-aside)  |
| `analytics`   | 8006      | `services/analytics/Dockerfile`| Event ingest + 4 analytics endpoints      |

All services share a single bridge network `linkedinclone-backend`, so they
reach each other by service name (`mysql`, `redis`, `kafka:29092`, etc.).

## Quickstart

```bash
cp .env.example .env                  # from repo root
docker compose -f infra/docker-compose.yml up -d --build
docker compose -f infra/docker-compose.yml ps   # wait for all healthy
curl http://localhost:8006/health     # analytics
curl http://localhost:8001/health     # profile
curl http://localhost:8002/health     # job
```

`/health` on each service returns:

```json
{
  "status": "ok",
  "service": "analytics",
  "db": "connected",
  "mongo": "connected",
  "redis": "connected",
  "kafka": "connected",
  "trace_id": "…"
}
```

## Start-up order & readiness

docker-compose handles this for us via `depends_on.condition`:

```
zookeeper (healthy)  ──►  kafka (healthy)  ──►  kafka-init (completed)  ──►  analytics
mysql / mongodb / redis (all healthy)       ──►  profile / job / analytics
```

A cold `up -d --build` typically takes ~60 s on first run (Kafka startup is
the bottleneck); subsequent runs are ~15 s.

## Toggling Redis / Kafka off (baseline benchmarks)

To measure the cache-off baseline for Phase 5 charts:

```bash
REDIS_ENABLED=false docker compose -f infra/docker-compose.yml up -d profile job analytics
```

Services keep running against MySQL / Mongo directly — no code change needed,
`cache.js` degrades gracefully.

Same trick for Kafka:

```bash
KAFKA_ENABLED=false docker compose -f infra/docker-compose.yml up -d analytics
```

The analytics HTTP `POST /events/ingest` path still works; only the Kafka
consumer is skipped.

## Host-port conflicts

Every published port is overridable via env (`DB_PORT_HOST`,
`REDIS_PORT_HOST`, `PROFILE_PORT_HOST`, …). If port 3306 or 9092 is already
in use on your Mac, bump them in `.env`:

```
DB_PORT_HOST=3307
KAFKA_PORT_HOST=9093
```

…and point `DB_HOST` / `KAFKA_BROKERS` in `.env` to `localhost:<new-port>`
for any host-side tooling (JMeter, seed script, mysql CLI).

## Tear-down

```bash
docker compose -f infra/docker-compose.yml down          # keeps data volumes
docker compose -f infra/docker-compose.yml down -v       # nuke volumes too
```
