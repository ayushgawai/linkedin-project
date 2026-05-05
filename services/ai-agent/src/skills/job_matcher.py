"""Job-Candidate Matching Skill.

Two-stage scoring:
  1. Jaccard skill overlap  (weight 0.6)
  2. Embedding cosine similarity (weight 0.4)

Combined: final_score = 0.6 * skill_overlap + 0.4 * embedding_similarity

Embeddings backend:
- Preferred: OpenAI embeddings API (requires OPENAI_API_KEY). This keeps the
  service lightweight and avoids bundling PyTorch/CUDA-heavy deps in Docker.
- Fallback: if embeddings are unavailable, embedding similarity is 0.
"""
from __future__ import annotations

import asyncio
import math
import re

from loguru import logger

from ..config import get_settings
from ..models import CandidateMatch, CandidateProfile, MatchResponse

SKILL_WEIGHT = 0.6
EMBED_WEIGHT = 0.4


def _cosine_similarity(a: list[float], b: list[float]) -> float:
    """Return cosine similarity between two vectors."""
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = 0.0
    norm_a = 0.0
    norm_b = 0.0
    for x, y in zip(a, b):
        dot += x * y
        norm_a += x * x
        norm_b += y * y
    if norm_a == 0.0 or norm_b == 0.0:
        return 0.0
    return dot / (math.sqrt(norm_a) * math.sqrt(norm_b))


def _jaccard(set_a: set[str], set_b: set[str]) -> float:
    """Jaccard similarity between two sets."""
    if not set_a and not set_b:
        return 0.0
    union = set_a | set_b
    intersection = set_a & set_b
    return len(intersection) / len(union)


async def _embed(texts: list[str]) -> list[list[float]]:
    """Compute embeddings via OpenAI API; fallback to lightweight local embeddings."""
    settings = get_settings()
    if not (settings.openai_api_key or "").strip():
        return _embed_local(texts)

    try:
        from openai import AsyncOpenAI  # lazy import

        client = AsyncOpenAI(api_key=settings.openai_api_key)
        # Use a small, cheap embedding model. Any embedding model satisfies
        # the "embeddings + rules" requirement; we only need stable vectors.
        resp = await asyncio.wait_for(
            client.embeddings.create(
                model="text-embedding-3-small",
                input=[t if t is not None else "" for t in texts],
            ),
            timeout=30,
        )
        # Keep ordering stable by sorting on index.
        data = sorted(resp.data, key=lambda d: d.index)
        return [list(d.embedding) for d in data]
    except asyncio.TimeoutError:
        logger.warning("OpenAI embeddings timed out — using local embeddings")
        return _embed_local(texts)
    except Exception as exc:  # noqa: BLE001
        logger.warning("OpenAI embeddings failed ({}); using local embeddings", exc)
        return _embed_local(texts)


_TOKEN_RE = re.compile(r"[a-z0-9]+", re.IGNORECASE)


def _embed_local(texts: list[str], dim: int = 256) -> list[list[float]]:
    """
    Lightweight local text embeddings (no heavy ML deps).

    Uses feature-hashed bag-of-words into a fixed-size vector; good enough to
    satisfy the "embeddings + rules" requirement and keep local builds fast.
    """
    out: list[list[float]] = []
    for t in texts:
        vec = [0.0] * dim
        for tok in _TOKEN_RE.findall((t or "").lower()):
            idx = (hash(tok) % dim + dim) % dim
            vec[idx] += 1.0
        out.append(vec)
    return out


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def _explode_skill_tokens(skills: list[str] | None) -> set[str]:
    """Split comma/pipe/slash/semicolon-glued skill entries into atomic tokens.

    Handles UI inputs where a recruiter typed all skills into one box
    (e.g. "SQS, SNS, Lambda, DynamoDB") so the skill-set used for Jaccard
    is the actual set of skills, not a single multi-comma string.
    """
    out: set[str] = set()
    for entry in (skills or []):
        if not isinstance(entry, str):
            continue
        # Split on common separators recruiters might use.
        for piece in re.split(r"[,;|/\n]+", entry):
            tok = piece.strip().lower()
            if tok:
                out.add(tok)
    return out


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

    job_skill_set = _explode_skill_tokens(job_skills)

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
        cand_skills = _explode_skill_tokens(cp.skills)
        resume_skills: set[str] = set()
        if cp.parsed_resume:
            resume_skills = _explode_skill_tokens(cp.parsed_resume.skills)
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
        emb_sim_raw = _cosine_similarity(job_emb, candidate_embs[idx])
        # Map cosine [-1, 1] -> [0, 1] by clipping negatives.
        emb_sim = max(0.0, min(1.0, emb_sim_raw))

        # Clamp similarities to [0, 1]
        skill_overlap = max(0.0, min(1.0, skill_overlap))

        final_score = SKILL_WEIGHT * skill_overlap + EMBED_WEIGHT * emb_sim
        final_score = round(final_score, 4)

        matching_skills = sorted(job_skill_set & all_cand_skills)
        missing = sorted(job_skill_set - all_cand_skills)[:5]
        if matching_skills:
            why = (
                f"Matched {len(matching_skills)}/{len(job_skill_set)} required skills "
                f"({', '.join(matching_skills[:6])})."
            )
            if missing:
                why += f" Missing: {', '.join(missing)}."
            why += f" Resume relevance to JD: {emb_sim:.0%}."
        else:
            why = (
                f"No required skills matched (job needs {', '.join(sorted(job_skill_set)[:6]) or 'unspecified'}). "
                f"Resume topic similarity {emb_sim:.0%} only — weak fit."
            )
        rationale = why

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
