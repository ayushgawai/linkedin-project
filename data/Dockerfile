FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY data/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY data/bootstrap_pipeline.py ./bootstrap_pipeline.py
COPY data/schema.sql ./schema.sql
COPY data/transform.py ./transform.py
COPY data/seed_loader.py ./seed_loader.py

CMD ["python", "/app/bootstrap_pipeline.py"]
