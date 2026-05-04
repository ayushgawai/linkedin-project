"""Application configuration — reads from environment variables."""
from functools import lru_cache
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """All service configuration sourced from environment variables."""

    # MongoDB
    mongo_uri: str = "mongodb://localhost:27017"
    mongo_db: str = "linkedinclone"

    # Kafka
    kafka_brokers: str = "localhost:9092"
    kafka_consumer_group: str = "ai-supervisor-group"
    kafka_topic_requests: str = "ai.requests"
    kafka_topic_results: str = "ai.results"

    # Dependent service URLs
    profile_service_url: str = "http://localhost:8001"
    job_service_url: str = "http://localhost:8002"
    application_service_url: str = "http://localhost:8003"
    messaging_service_url: str = "http://localhost:8004"

    # Feature flags
    use_mock_services: bool = True

    # OpenAI (optional). When openai_api_key is set and coach_llm_enabled is True,
    # career coach uses an LLM for rationale / headline / improvement tips.
    openai_api_key: str = ""
    coach_llm_enabled: bool = True
    coach_llm_model: str = "gpt-4o-mini"
    coach_llm_timeout_sec: float = 45.0

    # Server
    service_port: int = 8007
    log_level: str = "INFO"

    # CORS
    cors_origins: str = "http://localhost:3000"

    model_config = {"env_file": ".env", "case_sensitive": False}


@lru_cache
def get_settings() -> Settings:
    """Return cached settings singleton."""
    return Settings()
