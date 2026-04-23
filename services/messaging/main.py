"""
Messaging Service — Member 4 (Khushi)
Port: 8004
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import logging

from routers import threads, messages, health
from database import engine, Base
from kafka_client import kafka_producer

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    log.info("Starting Messaging Service...")
    Base.metadata.create_all(bind=engine)
    await kafka_producer.start()
    log.info("Messaging Service ready on port 8004")
    yield
    # Shutdown
    await kafka_producer.stop()
    log.info("Messaging Service shut down.")


app = FastAPI(title="Messaging Service", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(threads.router, prefix="/threads")
app.include_router(messages.router, prefix="/messages")
