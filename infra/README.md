# infra — local stack

Primary entrypoint: **repository root** +

```bash
docker compose -f infra/docker-compose.yml up -d --build
```

## Layout

- **`docker-compose.yml`**: full LinkedInClone stack (MySQL, MongoDB, Redis, MinIO, Zookeeper, Kafka, **`data-bootstrap`**, Profile, Job, Application, Messaging, Connection, Analytics, AI Agent, Posts, API Gateway, init helpers).
- **`aws/`**: CloudFormation and ECS-related templates (see `infra/aws/README.md`).
- **`perf/`**: JMeter / dashboard tooling for benchmarks.

## Data bootstrap

**`data-bootstrap`** is a **one-shot** image built from `data/Dockerfile`. It runs **`data/bootstrap_pipeline.py`** after MySQL and MongoDB are healthy: prepare raw job/resume inputs, run **`data/transform.py`**, then **`data/seed_loader.py`**.

Application services declare a **`depends_on`** relationship to **`data-bootstrap`** so they do not serve traffic until seeding finishes (or the bootstrap container has exited).

For Kaggle downloads inside the container, put **`KAGGLE_USERNAME`** and **`KAGGLE_KEY`** in the **repository root** `.env`. That file is attached to **`data-bootstrap`** via **`env_file: ../.env`** so credentials are not lost when Compose treats **`infra/`** as the project directory. You can instead mount pre-downloaded files under repo-root **`Data_2/`** (see `data/README.md`).

Verify success:

```bash
docker inspect linkedinclone-data-bootstrap --format '{{.State.ExitCode}}'
```

Expect **`0`**. Status **`Exited`** in `docker compose ps` is normal for this service.

## Networking and ports

Services share the **`backend`** bridge network and reach each other by DNS name (`mysql`, `mongodb`, `redis`, `kafka`, …).

Host-published ports are driven from the **repository root** `.env` (for example `DB_PORT_HOST`, `KAFKA_PORT_HOST`, gateway **`8011`**). Defaults match the root **`README.md`** host port table.

## Quick checks (with stack up)

```bash
curl -s http://127.0.0.1:8011/health
curl -s http://127.0.0.1:8001/health
curl -s http://127.0.0.1:8006/health
```

## Start-up order (high level)

- **Zookeeper → Kafka → `kafka-init`** (topics).
- **MySQL / MongoDB** (healthchecks).
- **`data-bootstrap`** (runs to completion).
- **Redis, MinIO**, then application services and **API Gateway** (each wired with `depends_on` as in `docker-compose.yml`).

## Toggling Redis / Kafka off (benchmarks)

```bash
REDIS_ENABLED=false docker compose -f infra/docker-compose.yml up -d profile job analytics
```

```bash
KAFKA_ENABLED=false docker compose -f infra/docker-compose.yml up -d analytics
```

Services degrade to direct DB usage where the code supports it.

## Host port conflicts

Override in **repository root** `.env`, for example:

```
DB_PORT_HOST=3307
KAFKA_PORT_HOST=9093
```

Use `localhost:<port>` in the same `.env` for any tooling running on the host.

## Tear-down

```bash
docker compose -f infra/docker-compose.yml down          # keeps volumes
docker compose -f infra/docker-compose.yml down -v       # removes volumes
```
