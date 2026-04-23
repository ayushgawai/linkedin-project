"""
Connection Service — Member 4 (Khushi)
Port: 8005
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import logging

from routers import connections, health
from database import engine, Base
from kafka_client import kafka_producer

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("Starting Connection Service...")
    Base.metadata.create_all(bind=engine)
    await kafka_producer.start()
    log.info("Connection Service ready on port 8005")
    yield
    await kafka_producer.stop()
    log.info("Connection Service shut down.")


app = FastAPI(title="Connection Service", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(connections.router, prefix="/connections")
