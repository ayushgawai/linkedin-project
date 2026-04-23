"""
Messaging Consumer — Member 4 (Khushi)
Consumer group: messaging-consumer-group
Topic: message.sent

Responsibilities:
- Check idempotency (skip already-processed events)
- Update thread.last_message_at metadata
- Route to DLQ after 3 failed retries

Run: python messaging_consumer.py
"""

import json
import logging
import os
import time
from confluent_kafka import Consumer, Producer, KafkaException
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from models import ProcessedEvent

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

KAFKA_BROKERS = os.getenv("KAFKA_BROKERS", "localhost:9092")
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "3306")
DB_USER = os.getenv("DB_USER", "root")
DB_PASS = os.getenv("DB_PASS", "password")
DB_NAME = os.getenv("DB_NAME", "linkedinclone")

DATABASE_URL = f"mysql+pymysql://{DB_USER}:{DB_PASS}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine)

MAX_RETRIES = 3
DLQ_TOPIC = "message.sent.dlq"


def get_consumer() -> Consumer:
    return Consumer({
        "bootstrap.servers": KAFKA_BROKERS,
        "group.id": "messaging-consumer-group",
        "auto.offset.reset": "earliest",
        "enable.auto.commit": False,   # Manual commit AFTER successful DB write
    })


def get_dlq_producer() -> Producer:
    return Producer({"bootstrap.servers": KAFKA_BROKERS})


def is_already_processed(db, idempotency_key: str) -> bool:
    result = db.query(ProcessedEvent).filter(
        ProcessedEvent.idempotency_key == idempotency_key
    ).first()
    return result is not None


def mark_processed(db, idempotency_key: str):
    db.add(ProcessedEvent(idempotency_key=idempotency_key))
    db.commit()


def process_message(envelope: dict, db) -> None:
    """
    Process a message.sent event:
    - Check idempotency
    - Update thread metadata (last message time)
    """
    idempotency_key = envelope.get("idempotency_key")
    if not idempotency_key:
        log.warning("Event missing idempotency_key — skipping.")
        return

    if is_already_processed(db, idempotency_key):
        log.info(f"Duplicate event {idempotency_key} — skipping.")
        return

    thread_id = envelope.get("entity", {}).get("entity_id")
    timestamp = envelope.get("timestamp")

    if thread_id and timestamp:
        db.execute(
            text("UPDATE threads SET updated_at = :ts WHERE thread_id = :tid"),
            {"ts": timestamp, "tid": thread_id}
        )

    mark_processed(db, idempotency_key)
    log.info(f"Processed message.sent event for thread {thread_id}")


def send_to_dlq(producer: Producer, raw_value: bytes, reason: str):
    try:
        producer.produce(DLQ_TOPIC, value=raw_value, headers={"failure_reason": reason})
        producer.flush(timeout=5)
        log.warning(f"Sent event to DLQ ({DLQ_TOPIC}). Reason: {reason}")
    except Exception as e:
        log.error(f"Failed to send to DLQ: {e}")


def run():
    consumer = get_consumer()
    dlq_producer = get_dlq_producer()
    consumer.subscribe(["message.sent"])
    log.info("Messaging consumer started. Listening to message.sent...")

    while True:
        msg = consumer.poll(timeout=1.0)
        if msg is None:
            continue
        if msg.error():
            log.error(f"Consumer error: {msg.error()}")
            continue

        raw_value = msg.value()
        retries = 0

        while retries < MAX_RETRIES:
            db = SessionLocal()
            try:
                envelope = json.loads(raw_value.decode("utf-8"))
                process_message(envelope, db)
                # Commit offset ONLY after successful DB write
                consumer.commit(message=msg)
                break
            except Exception as e:
                retries += 1
                log.warning(f"Processing failed (attempt {retries}/{MAX_RETRIES}): {e}")
                db.rollback()
                time.sleep(2 ** retries)
            finally:
                db.close()
        else:
            log.error(f"Max retries exceeded. Sending to DLQ.")
            send_to_dlq(dlq_producer, raw_value, "max_retries_exceeded")
            consumer.commit(message=msg)


if __name__ == "__main__":
    run()
