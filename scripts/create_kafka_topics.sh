#!/usr/bin/env bash
# Creates all required Kafka topics for the LinkedInClone project.
# Run from repo root: bash scripts/create_kafka_topics.sh

KAFKA_CONTAINER="${KAFKA_CONTAINER:-linkedinclone-kafka}"
BOOTSTRAP="localhost:9092"

TOPICS=(
  job.viewed
  job.saved
  application.submitted
  application.status.updated
  message.sent
  connection.requested
  connection.accepted
  ai.requests
  ai.results
  message.sent.dlq
  application.submitted.dlq
)

echo "Creating Kafka topics on $KAFKA_CONTAINER ..."
for t in "${TOPICS[@]}"; do
  docker exec "$KAFKA_CONTAINER" kafka-topics \
    --create --if-not-exists \
    --bootstrap-server "$BOOTSTRAP" \
    --replication-factor 1 --partitions 3 \
    --topic "$t" 2>&1 \
  && echo "  ✓ $t" \
  || echo "  ✗ $t (may already exist)"
done

echo ""
echo "Current topics:"
docker exec "$KAFKA_CONTAINER" kafka-topics --list --bootstrap-server "$BOOTSTRAP"
