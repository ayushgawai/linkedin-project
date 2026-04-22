"""
Database Models — Messaging Service
"""

from sqlalchemy import Column, String, Text, DateTime, BigInteger, Boolean, ForeignKey
from sqlalchemy.sql import func
from database import Base


class Thread(Base):
    __tablename__ = "threads"

    thread_id = Column(String(36), primary_key=True)
    created_at = Column(DateTime, server_default=func.now())


class ThreadParticipant(Base):
    __tablename__ = "thread_participants"

    thread_id = Column(String(36), ForeignKey("threads.thread_id"), primary_key=True)
    user_id = Column(String(36), primary_key=True)


class Message(Base):
    __tablename__ = "messages"

    message_id = Column(String(36), primary_key=True)
    thread_id = Column(String(36), ForeignKey("threads.thread_id"), nullable=False)
    sender_id = Column(String(36), nullable=False)
    message_text = Column(Text, nullable=False)
    sent_at = Column(DateTime, server_default=func.now())


class OutboxEvent(Base):
    """
    Outbox table for Kafka fallback.
    If Kafka is unavailable, events are stored here and retried by the outbox poller.
    """
    __tablename__ = "outbox_events"
    __table_args__ = {"extend_existing": True}

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    topic = Column(String(120), nullable=False)
    envelope = Column(Text, nullable=False)
    created_at = Column(DateTime, server_default=func.now())
    sent = Column(Boolean, default=False)


class ProcessedEvent(Base):
    """Idempotency table — tracks already-processed Kafka events."""
    __tablename__ = "processed_events_messaging"

    idempotency_key = Column(String(255), primary_key=True)
    processed_at = Column(DateTime, server_default=func.now())
