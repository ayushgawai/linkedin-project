from fastapi import FastAPI

app = FastAPI(title="LinkedInClone AI Agent")


@app.get('/health')
def health():
    return {"status": "ok", "service": "ai-agent", "db": "unknown", "kafka": "unknown"}
