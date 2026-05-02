"""
Kafka Setup Script — Member 4 (Khushi)
Run this ONCE after Kafka broker is up to create all required topics.
Usage: python kafka_setup.py
"""

from confluent_kafka.admin import AdminClient, NewTopic
import logging
import sys
import time

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

KAFKA_BROKER = "localhost:9092"

# (topic_name, partitions, replication_factor)
TOPICS = [
    ("job.viewed",                    3, 1),
    ("job.saved",                     3, 1),
    ("job.created",                   3, 1),
    ("job.closed",                    3, 1),
    ("application.submitted",         6, 1),
    ("application.status.updated",    3, 1),
    ("message.sent",                  6, 1),
    ("connection.requested",        3, 1),
    ("connection.accepted",           3, 1),
    ("connection.rejected",         3, 1),
    ("member.created",               3, 1),
    ("member.updated",               3, 1),
    ("member.deleted",               3, 1),
    ("ai.requests",                   3, 1),
    ("ai.results",                    3, 1),
    # Dead Letter Queues
    ("message.sent.dlq",              1, 1),
    ("application.submitted.dlq",     1, 1),
]

# Consumer groups (documented here for reference — they self-register on first consume)
CONSUMER_GROUPS = {
    "analytics-consumer-group":   [
        "job.viewed",
        "job.saved",
        "job.created",
        "job.closed",
        "application.submitted",
        "application.status.updated",
        "connection.requested",
        "connection.accepted",
        "connection.rejected",
        "message.sent",
        "member.created",
        "member.updated",
        "member.deleted",
    ],
    "messaging-consumer-group":   ["message.sent"],
    "connection-consumer-group":  ["connection.requested", "connection.accepted", "connection.rejected"],
    "ai-supervisor-group":        ["ai.requests"],
    "ai-results-group":           ["ai.results"],
}


def wait_for_broker(broker: str, retries: int = 10, delay: int = 3) -> AdminClient:
    log.info(f"Connecting to Kafka broker at {broker} ...")
    for attempt in range(1, retries + 1):
        try:
            client = AdminClient({"bootstrap.servers": broker})
            # A lightweight call to verify connectivity
            client.list_topics(timeout=5)
            log.info("Broker is reachable.")
            return client
        except Exception as e:
            log.warning(f"Attempt {attempt}/{retries} failed: {e}")
            if attempt < retries:
                time.sleep(delay)
    log.error("Could not connect to Kafka broker. Is it running?")
    sys.exit(1)


def create_topics(client: AdminClient) -> None:
    existing = set(client.list_topics(timeout=10).topics.keys())
    to_create = []

    for name, partitions, replication in TOPICS:
        if name in existing:
            log.info(f"  [SKIP]   {name} — already exists")
        else:
            to_create.append(NewTopic(name, num_partitions=partitions, replication_factor=replication))

    if not to_create:
        log.info("All topics already exist. Nothing to create.")
        return

    results = client.create_topics(to_create)
    for topic, future in results.items():
        try:
            future.result()
            log.info(f"  [CREATED] {topic}")
        except Exception as e:
            log.error(f"  [ERROR]   {topic}: {e}")


def verify_topics(client: AdminClient) -> None:
    log.info("\n--- Topic Verification ---")
    existing = client.list_topics(timeout=10).topics
    all_ok = True
    for name, partitions, _ in TOPICS:
        if name in existing:
            actual_partitions = len(existing[name].partitions)
            log.info(f"  ✓ {name} ({actual_partitions} partition(s))")
        else:
            log.error(f"  ✗ {name} — MISSING")
            all_ok = False

    if all_ok:
        log.info("\nAll topics verified successfully!")
    else:
        log.error("\nSome topics are missing. Re-run this script.")
        sys.exit(1)


def print_consumer_groups() -> None:
    log.info("\n--- Consumer Groups (self-register on first consume) ---")
    for group, topics in CONSUMER_GROUPS.items():
        log.info(f"  {group}: {', '.join(topics)}")


if __name__ == "__main__":
    client = wait_for_broker(KAFKA_BROKER)
    create_topics(client)
    verify_topics(client)
    print_consumer_groups()
    log.info("\nKafka setup complete!")