"""
Outbox Poller — Messaging Service
Runs as a background thread. Every 5s, retries unsent outbox_events.
Ensures no Kafka message is ever permanently lost.

Run alongside main app: python outbox_poller.py
Or integrate as a background task in main.py for production.
"""

import json
import time
import logging
import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from models import OutboxEvent
from kafka_client import KafkaProducerClient

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "3306")
DB_USER = os.getenv("DB_USER", "root")
DB_PASS = os.getenv("DB_PASS", "password")
DB_NAME = os.getenv("DB_NAME", "linkedinclone")

DATABASE_URL = f"mysql+pymysql://{DB_USER}:{DB_PASS}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine)

POLL_INTERVAL = 5  # seconds


def poll():
    producer = KafkaProducerClient()
    import asyncio
    asyncio.run(producer.start())

    log.info("Outbox poller started. Polling every 5s...")

    while True:
        try:
            db = SessionLocal()
            unsent = db.query(OutboxEvent).filter(OutboxEvent.sent == "false").limit(50).all()

            if unsent:
                log.info(f"Found {len(unsent)} unsent outbox events. Retrying...")

            for event in unsent:
                envelope = json.loads(event.envelope)
                ok = producer.produce(event.topic, envelope)
                if ok:
                    event.sent = "true"
                    db.commit()
                    log.info(f"Outbox event {event.id} delivered to {event.topic}.")
                else:
                    log.warning(f"Outbox event {event.id} still failing. Will retry.")

            db.close()
        except Exception as e:
            log.error(f"Outbox poller error: {e}")

        time.sleep(POLL_INTERVAL)


if __name__ == "__main__":
    poll()
