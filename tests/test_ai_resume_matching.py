from __future__ import annotations

import asyncio
import base64
import sys
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[1]
AI_SRC = ROOT / "services" / "ai-agent"
if str(AI_SRC) not in sys.path:
    sys.path.insert(0, str(AI_SRC))

from src.models import CandidateProfile, ParseResumeResponse
from src.skills.job_matcher import match_candidates
from src.skills.resume_parser import _decode_resume_data_url


def test_decode_resume_data_url_plain_text() -> None:
    payload = base64.b64encode(b"Python Kafka SQL").decode("ascii")

    decoded = _decode_resume_data_url(f"data:text/plain;base64,{payload}")

    assert decoded == "Python Kafka SQL"


def test_match_candidates_returns_real_overlap(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_embed(texts: list[str]) -> list[list[float]]:
        # Deterministic vectors: one job vector and one candidate vector.
        return [[1.0, 0.0] for _ in texts]

    monkeypatch.setattr("src.skills.job_matcher._embed", fake_embed)

    candidate = CandidateProfile(
        member_id="member-1",
        skills=["Python", "Linux"],
        parsed_resume=ParseResumeResponse(
            member_id="member-1",
            skills=["SQL", "Docker"],
            summary="Built Python services and worked with SQL data stores.",
        ),
    )

    result = asyncio.run(
        match_candidates(
            job_id="job-1",
            job_description="Looking for Python, SQL, and Kafka experience.",
            job_skills=["Python", "SQL", "Kafka"],
            candidate_profiles=[candidate],
        )
    )

    assert result.matches[0].member_id == "member-1"
    assert result.matches[0].matched_skills == ["python", "sql"]
    assert result.matches[0].score > 0
    assert "Matched 2/3 required skills" in result.matches[0].rationale