"""Job-Candidate Matching Skill.

Two-stage scoring:
  1. Jaccard skill overlap  (weight 0.6)
  2. Sentence-transformer embedding cosine similarity (weight 0.4)

Combined: final_score = 0.6 * skill_overlap + 0.4 * embedding_similarity

Model: sentence-transformers/all-MiniLM-L6-v2 (loaded lazily to avoid
slowing down app startup).
"""
from __future__ import annotations

import asyncio
from concurrent.futures import ThreadPoolExecutor
from functools import lru_cache
from typing import Any

import numpy as np
from loguru import logger

from ..models import CandidateMatch, CandidateProfile, MatchResponse

# Executor for running CPU-bound embedding work off the event loop
_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="embedder")

SKILL_WEIGHT = 0.6
EMBED_WEIGHT = 0.4


# ---------------------------------------------------------------------------
# Embedding model (lazy-loaded singleton)
# ---------------------------------------------------------------------------


@lru_cache(maxsize=1)
def _get_model() -> Any:
    """Load and cache the sentence-transformers model."""
    try:
        from sentence_transformers import SentenceTransformer  # lazy import
        model = SentenceTransformer("all-MiniLM-L6-v2")
        logger.info("Loaded sentence-transformers model all-MiniLM-L6-v2")
        return model
    except Exception as exc:
        logger.error("Failed to load sentence-transformers model: {}. Embedding similarity will be 0.", exc)
        return None


def _cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    """Return cosine similarity between two 1-D vectors."""
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return float(np.dot(a, b) / (norm_a * norm_b))


def _jaccard(set_a: set[str], set_b: set[str]) -> float:
    """Jaccard similarity between two sets."""
    if not set_a and not set_b:
        return 0.0
    union = set_a | set_b
    intersection = set_a & set_b
    return len(intersection) / len(union)


def _compute_embeddings_sync(texts: list[str]) -> list[np.ndarray]:
    """Blocking embedding computation — call in executor."""
    model = _get_model()
    if model is None:
        return [np.zeros(384) for _ in texts]
    return [model.encode(t, convert_to_numpy=True) for t in texts]


async def _embed(texts: list[str]) -> list[np.ndarray]:
    """Compute embeddings asynchronously (off the event loop)."""
    loop = asyncio.get_event_loop()
    try:
        return await asyncio.wait_for(
            loop.run_in_executor(_executor, _compute_embeddings_sync, texts),
            timeout=30,
        )
    except asyncio.TimeoutError:
        logger.warning("Embedding computation timed out — using zero vectors")
        return [np.zeros(384) for _ in texts]


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


async def match_candidates(
    job_id: str,
    job_description: str,
    job_skills: list[str],
    candidate_profiles: list[CandidateProfile],
) -> MatchResponse:
    """
    Score each candidate against the job and return a ranked list.

    Edge case: candidate with no skills AND no resume summary → score = 0.0.
    """
    if not candidate_profiles:
        return MatchResponse(job_id=job_id, matches=[])

    job_skill_set = {s.lower() for s in job_skills}

    # Build candidate text summaries for embedding
    candidate_texts: list[str] = []
    for cp in candidate_profiles:
        summary = ""
        if cp.parsed_resume:
            summary = cp.parsed_resume.summary
        if not summary and cp.skills:
            summary = "Skills: " + ", ".join(cp.skills)
        candidate_texts.append(summary or "")

    job_text = job_description or " ".join(job_skills)

    # Compute embeddings asynchronously
    all_texts = [job_text] + candidate_texts
    embeddings = await _embed(all_texts)
    job_emb = embeddings[0]
    candidate_embs = embeddings[1:]

    matches: list[CandidateMatch] = []

    for idx, cp in enumerate(candidate_profiles):
        cand_skills = {s.lower() for s in (cp.skills or [])}
        resume_skills: set[str] = set()
        if cp.parsed_resume:
            resume_skills = {s.lower() for s in cp.parsed_resume.skills}
        all_cand_skills = cand_skills | resume_skills

        # Edge case: no skills and no resume text
        if not all_cand_skills and not candidate_texts[idx].strip():
            matches.append(CandidateMatch(
                member_id=cp.member_id,
                score=0.0,
                skill_overlap=0.0,
                embedding_similarity=0.0,
                rationale="Insufficient profile data",
            ))
            continue

        skill_overlap = _jaccard(job_skill_set, all_cand_skills)
        emb_sim = _cosine_similarity(job_emb, candidate_embs[idx])

        # Clamp similarities to [0, 1]
        skill_overlap = max(0.0, min(1.0, skill_overlap))
        emb_sim = max(0.0, min(1.0, emb_sim))

        final_score = SKILL_WEIGHT * skill_overlap + EMBED_WEIGHT * emb_sim
        final_score = round(final_score, 4)

        matching_skills = sorted(job_skill_set & all_cand_skills)
        rationale = (
            f"Skill overlap {skill_overlap:.0%} "
            f"(matched: {', '.join(matching_skills[:5]) or 'none'}); "
            f"semantic similarity {emb_sim:.0%}."
        )

        matches.append(CandidateMatch(
            member_id=cp.member_id,
            score=final_score,
            skill_overlap=round(skill_overlap, 4),
            embedding_similarity=round(emb_sim, 4),
            rationale=rationale,
        ))

    # Sort by descending score
    matches.sort(key=lambda m: m.score, reverse=True)
    logger.info(
        "Matched {} candidates for job {}: top_score={}",
        len(matches), job_id, matches[0].score if matches else 0,
    )
    return MatchResponse(job_id=job_id, matches=matches)
