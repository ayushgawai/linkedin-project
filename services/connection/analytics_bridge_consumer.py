"""
Analytics Bridge Consumer — Member 4 (Khushi)
Consumer group: application-analytics-group
Topic: application.submitted

Forwards application.submitted Kafka events → POST /events/ingest (Analytics Service port 8006)
This bridges Kafka to MongoDB analytics for Member 5's dashboards.

Run: python analytics_bridge_consumer.py
"""

import json
import logging
import os
import time
import requests
from confluent_kafka import Consumer, Producer

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

KAFKA_BROKERS = os.getenv("KAFKA_BROKERS", "localhost:9092")
ANALYTICS_SERVICE_URL = os.getenv("ANALYTICS_SERVICE_URL", "http://localhost:8006")
MAX_RETRIES = 3


def get_consumer() -> Consumer:
    return Consumer({
        "bootstrap.servers": KAFKA_BROKERS,
        "group.id": "application-analytics-group",
        "auto.offset.reset": "earliest",
        "enable.auto.commit": False,
    })


def forward_to_analytics(envelope: dict) -> bool:
    """POST the Kafka envelope to the Analytics Service /events/ingest endpoint."""
    url = f"{ANALYTICS_SERVICE_URL}/events/ingest"
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            resp = requests.post(url, json=envelope, timeout=5)
            if resp.status_code in (200, 202):
                log.info(f"Forwarded event {envelope.get('idempotency_key')} to analytics.")
                return True
            else:
                log.warning(f"Analytics service returned {resp.status_code} (attempt {attempt}/{MAX_RETRIES})")
        except requests.RequestException as e:
            log.warning(f"HTTP error forwarding to analytics (attempt {attempt}/{MAX_RETRIES}): {e}")
        time.sleep(2 ** attempt)
    return False


def run():
    consumer = get_consumer()
    consumer.subscribe(["application.submitted"])
    log.info("Analytics bridge consumer started. Listening to application.submitted...")

    while True:
        msg = consumer.poll(timeout=1.0)
        if msg is None:
            continue
        if msg.error():
            log.error(f"Consumer error: {msg.error()}")
            continue

        try:
            envelope = json.loads(msg.value().decode("utf-8"))
            success = forward_to_analytics(envelope)
            if success:
                consumer.commit(message=msg)
            else:
                log.error(f"Failed to forward event after {MAX_RETRIES} retries. Skipping to avoid stuck consumer.")
                consumer.commit(message=msg)
        except Exception as e:
            log.error(f"Unexpected error processing message: {e}")
            consumer.commit(message=msg)


if __name__ == "__main__":
    run()
