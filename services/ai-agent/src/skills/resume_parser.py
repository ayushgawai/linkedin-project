"""Resume Parser Skill.

Extracts structured information from raw resume text.

Strategy:
- Default: deterministic keyword extraction (no external API needed).
- If OPENAI_API_KEY is set, delegates to the OpenAI chat completion API for
  richer extraction (pluggable via the LLM_BACKEND toggle).

Results are persisted to MongoDB ``ai_traces``.
"""
from __future__ import annotations

import asyncio
import re
import uuid
from datetime import datetime
from typing import Any

from loguru import logger

from ..config import get_settings
from ..db import get_ai_traces
from ..models import ParsedEducation, ParseResumeResponse

# ---------------------------------------------------------------------------
# Common skill lists used for keyword extraction
# ---------------------------------------------------------------------------

# Canonical skill → pattern list. Each pattern is matched with word boundaries
# (regex \b) to avoid false positives like "r" matching inside "react" or
# "go" matching inside "google".
# The key is the canonical name that gets returned; synonyms are extra patterns.
_SKILL_PATTERNS: dict[str, list[str]] = {
    # Languages
    "python":     ["python"],
    "java":       ["java"],  # \b prevents matching "javascript"
    "javascript": ["javascript", "js", "ecmascript"],
    "typescript": ["typescript", "ts"],
    "go":         ["golang", "go"],
    "rust":       ["rust"],
    "c++":        [r"c\+\+", "cpp"],
    "c#":         [r"c\#", "csharp"],
    "ruby":       ["ruby"],
    "swift":      ["swift"],
    "kotlin":     ["kotlin"],
    "scala":      ["scala"],
    "r":          [r"\br\b"],  # extra-strict for single-letter
    "matlab":     ["matlab"],
    "sql":        ["sql"],
    "nosql":      ["nosql"],
    # Frameworks / frontend
    "react":      ["react", "react.js", "reactjs"],
    "angular":    ["angular", "angularjs"],
    "vue":        ["vue", "vue.js", "vuejs"],
    "nextjs":     ["next.js", "nextjs"],
    "node.js":    ["node.js", "nodejs", "node"],
    "django":     ["django"],
    "flask":      ["flask"],
    "fastapi":    ["fastapi"],
    "spring":     ["spring", "spring boot", "springboot"],
    "express":    ["express", "express.js"],
    "rails":      ["rails", "ruby on rails"],
    "laravel":    ["laravel"],
    # Cloud / infra
    "aws":        ["aws", "amazon web services"],
    "gcp":        ["gcp", "google cloud"],
    "azure":      ["azure"],
    "docker":     ["docker"],
    "kubernetes": ["kubernetes", "k8s"],
    "terraform":  ["terraform"],
    "ansible":    ["ansible"],
    # Data / messaging
    "kafka":      ["kafka"],
    "rabbitmq":   ["rabbitmq"],
    "redis":      ["redis"],
    "mongodb":    ["mongodb", "mongo"],
    "postgresql": ["postgresql", "postgres"],
    "mysql":      ["mysql"],
    "elasticsearch": ["elasticsearch", "elastic search"],
    "spark":      ["spark", "apache spark"],
    "hadoop":     ["hadoop"],
    "airflow":    ["airflow"],
    "dbt":        ["dbt"],
    # ML / AI
    "machine learning": ["machine learning", "ml"],
    "deep learning":    ["deep learning"],
    "nlp":        ["nlp", "natural language processing"],
    "computer vision": ["computer vision", "cv"],
    "pytorch":    ["pytorch"],
    "tensorflow": ["tensorflow"],
    "sklearn":    ["sklearn", "scikit-learn", "scikit learn"],
    "pandas":     ["pandas"],
    "numpy":      ["numpy"],
    # Misc
    "git":        ["git"],
    "ci/cd":      [r"ci\s*/\s*cd", "cicd"],
    "agile":      ["agile"],
    "scrum":      ["scrum"],
    "rest":       ["rest", "restful"],
    "graphql":    ["graphql"],
    "grpc":       ["grpc"],
    "linux":      ["linux"],
    "bash":       ["bash"],
    "powershell": ["powershell"],
}

# Precompile regex per canonical skill (word-bounded, case-insensitive)
_SKILL_REGEX: dict[str, "re.Pattern[str]"] = {
    canonical: re.compile(
        r"(?:^|[^a-zA-Z0-9+#.])(" + "|".join(patterns) + r")(?=$|[^a-zA-Z0-9+#])",
        re.IGNORECASE,
    )
    for canonical, patterns in _SKILL_PATTERNS.items()
}

_DEGREE_PATTERNS = [
    r"(?i)(b\.?s\.?|bachelor['\s]?s?)\s+(?:of\s+)?(\w[\w\s,]+)",
    r"(?i)(m\.?s\.?|master['\s]?s?)\s+(?:of\s+)?(\w[\w\s,]+)",
    r"(?i)(ph\.?d\.?|doctor(?:ate)?)\s+(?:of\s+)?(\w[\w\s,]+)",
    r"(?i)(m\.?b\.?a\.?)\b",
    r"(?i)(associate['\s]?s?)\s+(?:of\s+)?(\w[\w\s,]+)",
]

_YEAR_RANGE_RE = re.compile(
    r"(\d{4})\s*[-–—to]+\s*(\d{4}|present|current)", re.IGNORECASE
)

_INSTITUTION_KEYWORDS = {
    "university", "college", "institute", "school", "academy",
}

# ---------------------------------------------------------------------------
# Deterministic extraction helpers
# ---------------------------------------------------------------------------


def _extract_skills(text: str) -> list[str]:
    """
    Return a sorted list of canonical skill names found in *text*.

    Uses word-boundary-aware regex per skill (see ``_SKILL_REGEX``) to avoid
    false positives like "r" matching inside "react" or "go" inside "google".
    """
    found: set[str] = set()
    for canonical, pattern in _SKILL_REGEX.items():
        if pattern.search(text):
            found.add(canonical)
    return sorted(found)


def _extract_years_experience(text: str) -> int:
    """
    Heuristically compute total years of experience from date ranges.

    Collects all ``YYYY-YYYY`` (or ``YYYY-present``) ranges, then merges
    overlapping intervals before summing so concurrent jobs don't double-count.
    """
    intervals: list[tuple[int, int]] = []
    current_year = datetime.utcnow().year
    for match in _YEAR_RANGE_RE.finditer(text):
        start = int(match.group(1))
        end_raw = match.group(2).lower()
        end = current_year if end_raw in {"present", "current"} else int(end_raw)
        if end >= start and (current_year - 50) <= start <= current_year:
            intervals.append((start, end))

    if not intervals:
        return 0

    # Merge overlapping intervals
    intervals.sort()
    merged: list[tuple[int, int]] = [intervals[0]]
    for s, e in intervals[1:]:
        last_s, last_e = merged[-1]
        if s <= last_e:
            merged[-1] = (last_s, max(last_e, e))
        else:
            merged.append((s, e))

    total = sum(e - s for s, e in merged)
    return min(total, 50)


def _extract_education(text: str) -> list[ParsedEducation]:
    """Extract education entries from *text* using simple regex heuristics."""
    entries: list[ParsedEducation] = []
    lines = text.split("\n")

    for line in lines:
        line_lower = line.lower()
        institution = ""
        degree = ""

        # Try to find an institution
        for word in _INSTITUTION_KEYWORDS:
            if word in line_lower:
                institution = line.strip()
                break

        # Try to find a degree
        for pattern in _DEGREE_PATTERNS:
            m = re.search(pattern, line)
            if m:
                degree = m.group(0).strip()
                break

        if institution or degree:
            year_m = re.search(r"\b(19|20)\d{2}\b", line)
            year = int(year_m.group(0)) if year_m else None
            entries.append(ParsedEducation(
                institution=institution or "Unknown Institution",
                degree=degree,
                year=year,
            ))

    return entries[:5]  # cap at 5 entries


def _build_summary(skills: list[str], years: int, education: list[ParsedEducation]) -> str:
    """Compose a brief summary string from extracted data."""
    parts: list[str] = []
    if years:
        parts.append(f"{years} year{'s' if years != 1 else ''} of experience")
    if skills:
        top = ", ".join(skills[:5])
        parts.append(f"skills in {top}")
    if education:
        parts.append(f"education at {education[0].institution}")
    return "; ".join(parts).capitalize() + "." if parts else "No summary available."


# ---------------------------------------------------------------------------
# LLM-backed extraction (optional, pluggable)
# ---------------------------------------------------------------------------


async def _llm_parse(resume_text: str) -> dict[str, Any] | None:
    """Call OpenAI to parse the resume; return None if unavailable/errors."""
    settings = get_settings()
    if not settings.openai_api_key:
        return None

    try:
        from openai import AsyncOpenAI  # lazy import

        client = AsyncOpenAI(api_key=settings.openai_api_key)
        prompt = (
            "Extract structured information from the following resume text.\n"
            "Return a JSON object with keys: skills (list of strings), "
            "years_experience (integer), education (list of {institution, degree, year}), "
            "summary (string).\n\nResume:\n" + resume_text[:4000]
        )
        response = await asyncio.wait_for(
            client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[{"role": "user", "content": prompt}],
                response_format={"type": "json_object"},
                temperature=0.2,
            ),
            timeout=30,
        )
        import json
        return json.loads(response.choices[0].message.content)
    except asyncio.TimeoutError:
        logger.warning("OpenAI resume parse timed out — falling back to keyword extractor")
        return None
    except Exception as exc:  # noqa: BLE001
        logger.warning("OpenAI resume parse failed ({}). Falling back.", exc)
        return None


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


async def parse_resume(
    resume_text: str,
    member_id: str,
    task_id: str | None = None,
    trace_id: str | None = None,
) -> ParseResumeResponse:
    """
    Parse *resume_text* for *member_id*.

    Tries the LLM backend first; falls back to deterministic extraction.
    Persists result to MongoDB ai_traces.
    Retries once on failure before returning a partial result.
    """
    _task_id = task_id or str(uuid.uuid4())
    _trace_id = trace_id or str(uuid.uuid4())
    parse_error: str | None = None

    for attempt in range(1, 3):  # max 2 attempts
        try:
            # 1. Try LLM
            llm_result = await _llm_parse(resume_text)

            if llm_result:
                skills = llm_result.get("skills", [])
                years = int(llm_result.get("years_experience", 0))
                edu_raw = llm_result.get("education", [])
                education = [
                    ParsedEducation(
                        institution=e.get("institution", ""),
                        degree=e.get("degree", ""),
                        year=e.get("year"),
                    )
                    for e in edu_raw
                ]
                summary = llm_result.get("summary", "")
            else:
                # 2. Deterministic fallback
                skills = _extract_skills(resume_text)
                years = _extract_years_experience(resume_text)
                education = _extract_education(resume_text)
                summary = _build_summary(skills, years, education)

            result = ParseResumeResponse(
                member_id=member_id,
                skills=skills,
                years_experience=years,
                education=education,
                summary=summary,
            )
            parse_error = None
            break  # success

        except Exception as exc:  # noqa: BLE001
            parse_error = str(exc)
            logger.warning(
                "Resume parse attempt {}/2 failed for member {}: {}", attempt, member_id, exc
            )
            if attempt == 2:
                # Return partial result on second failure
                result = ParseResumeResponse(
                    member_id=member_id,
                    skills=[],
                    years_experience=0,
                    education=[],
                    summary="",
                    parse_error=parse_error,
                )

    # Persist to MongoDB — append as an embedded step record on the
    # existing task document (consistent with the supervisor's step model).
    # If no task document exists (e.g. skill was called directly via REST with
    # a synthetic task_id), do NOT insert a new top-level doc; just log and
    # return. Resume parse results are only authoritative when they belong
    # to a task.
    if task_id is not None:
        try:
            update = get_ai_traces().update_one(
                {"task_id": _task_id},
                {
                    "$push": {
                        "steps": {
                            "step": "resume_parse",
                            "status": "completed" if not parse_error else "partial",
                            "timestamp": datetime.utcnow(),
                            "partial_result": {
                                "member_id": member_id,
                                "parse_error": parse_error,
                            },
                            # Full parser output for audit; kept in step, not at task level
                            "skill_output": result.model_dump(),
                        }
                    },
                    "$set": {"updated_at": datetime.utcnow()},
                },
                upsert=False,
            )
            if update.matched_count == 0:
                logger.debug(
                    "resume_parse for task_id={} skipped persist (no task doc)", _task_id
                )
        except Exception as exc:  # noqa: BLE001
            logger.error("Failed to append resume parse step to MongoDB: {}", exc)

    return result
