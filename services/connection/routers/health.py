"""
Health Check — Connection Service
GET /health
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text
from database import get_db
from kafka_client import kafka_producer

router = APIRouter()


@router.get("/health")
def health(db: Session = Depends(get_db)):
    db_status = "connected"
    try:
        db.execute(text("SELECT 1"))
    except Exception:
        db_status = "error"

    kafka_status = "connected" if kafka_producer.is_connected else "unavailable"

    return {
        "status": "ok",
        "service": "connection",
        "db": db_status,
        "kafka": kafka_status,
    }
