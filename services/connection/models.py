"""
Database Models — Connection Service
"""

from sqlalchemy import Column, String, DateTime, Enum, UniqueConstraint
from sqlalchemy.sql import func
from database import Base


class Connection(Base):
    __tablename__ = "connections"

    connection_id = Column(String(36), primary_key=True)
    user_a = Column(String(36), nullable=False)        # Always min(a,b)
    user_b = Column(String(36), nullable=False)        # Always max(a,b)
    status = Column(Enum("pending", "accepted", "rejected"), default="pending")
    requested_by = Column(String(36), nullable=False)
    created_at = Column(DateTime, server_default=func.now())

    __table_args__ = (
        UniqueConstraint("user_a", "user_b", name="uk_connection_pair"),
    )


class ProcessedEvent(Base):
    """Idempotency table for connection service consumers."""
    __tablename__ = "processed_events_connection"

    idempotency_key = Column(String(255), primary_key=True)
    processed_at = Column(DateTime, server_default=func.now())
