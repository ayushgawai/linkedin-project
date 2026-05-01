"""Career Coach skill.

Given a ``member_id`` and a ``target_job_id``, produce structured coaching
feedback: the skill gap vs the job, a reshaped headline suggestion, and a
set of concrete resume improvements.

This is deterministic and backend-only — no LLM call — so it is cheap,
predictable, and testable. It reuses the service clients already built
for the shortlist workflow, which keeps the contract with the upstream
services consistent across skills.
"""
from __future__ import annotations

from loguru import logger

from ..models import CoachResponse
from ..service_clients import get_job, get_member_profile


def _normalize(skills: list[str] | None) -> list[str]:
    """Lower-case, strip, drop empties/duplicates, preserve order."""
    seen: set[str] = set()
    out: list[str] = []
    for s in skills or []:
        if not isinstance(s, str):
            continue
        key = s.strip().lower()
        if key and key not in seen:
            seen.add(key)
            out.append(key)
    return out


def _build_headline(existing: str, job_title: str, top_missing: str | None) -> str:
    """Compose a headline that signals intent toward the target role.

    Keeps it short; prefers existing headline content when meaningful.
    """
    existing = (existing or "").strip()
    base = existing if existing else "Software Engineer"
    target = (job_title or "").strip()
    if top_missing:
        return f"{base} | Building toward {target} — focused on {top_missing.title()}".strip(" —")
    if target:
        return f"{base} | Targeting {target}".strip(" |")
    return base


def _resume_improvements(
    missing_skills: list[str],
    member_summary: str,
    job_title: str,
    job_description: str,
) -> list[str]:
    """Concrete, actionable bullets the candidate can apply today."""
    improvements: list[str] = []

    if missing_skills:
        top = missing_skills[:3]
        improvements.append(
            "Add concrete bullet points that demonstrate "
            f"{', '.join(top)} — tie each to a measurable outcome "
            "(e.g. latency reduction, throughput, revenue)."
        )

    if len(missing_skills) >= 4:
        improvements.append(
            "Create a dedicated \"Relevant Skills\" block near the top so "
            f"{len(missing_skills)} missing keywords surface in recruiter "
            "and ATS screens."
        )

    # Summary/about assessment: empty or very short → suggest rewriting.
    summary = (member_summary or "").strip()
    if len(summary) < 80:
        improvements.append(
            "Rewrite the profile summary to be 3–4 sentences that frame "
            f"your experience against a {job_title or 'target'} role — "
            "lead with impact, not responsibilities."
        )

    # Experience-bullet style tip — independent of content.
    improvements.append(
        "Rework experience bullets to start with a strong verb + artifact + "
        "metric (e.g. \"Shipped X serving Y QPS, cutting p95 by Z ms\")."
    )

    if job_description:
        improvements.append(
            "Mirror two or three phrases from the target job description "
            "verbatim (where truthful) so keyword matching is robust."
        )

    return improvements


async def generate_coaching(
    member_id: str,
    target_job_id: str,
    trace_id: str,
) -> CoachResponse:
    """Produce coaching feedback for *member_id* against *target_job_id*.

    Errors fetching either dependency are logged and surfaced as a
    minimally populated response rather than crashing the task; the
    supervisor decides how to mark the task.
    """
    profile: dict = {}
    job: dict = {}

    try:
        profile = await get_member_profile(member_id)
    except Exception as exc:  # noqa: BLE001
        logger.error("coach: get_member_profile failed member={} trace={}: {}",
                     member_id, trace_id, exc)

    try:
        job = await get_job(target_job_id)
    except Exception as exc:  # noqa: BLE001
        logger.error("coach: get_job failed job={} trace={}: {}",
                     target_job_id, trace_id, exc)

    member_skills = _normalize(profile.get("skills"))
    job_skills = _normalize(job.get("skills_required") or job.get("skills"))

    member_set = set(member_skills)
    # Preserve job's declared ordering for missing/matching lists.
    missing_skills = [s for s in job_skills if s not in member_set]
    matching_skills = [s for s in job_skills if s in member_set]

    # match_score: integer 0-100 representing how much of the job's required
    # skill set the member already covers. Frontend contract requires this
    # to ALWAYS be a number (never null/undefined) and bounded to [0, 100].
    if job_skills:
        match_score = round(100 * len(matching_skills) / len(job_skills))
    else:
        # No declared job skills → we cannot score skill coverage. Return 0
        # so the field is always a numeric value the UI can render.
        match_score = 0
    # Hard clamp as a safety net.
    match_score = max(0, min(100, int(match_score)))

    job_title = (job.get("title") or "").strip()
    job_description = (job.get("description") or "").strip()
    top_missing = missing_skills[0] if missing_skills else None

    headline_suggestion = _build_headline(
        profile.get("headline", ""), job_title, top_missing
    )
    # Defensive: contract says headline must never be blank/null/'undefined'.
    if not headline_suggestion or not headline_suggestion.strip():
        headline_suggestion = "Software Engineer | Open to new opportunities"

    resume_improvements = _resume_improvements(
        missing_skills, profile.get("about", ""), job_title, job_description
    )
    # Defensive: contract says resume_improvements must have ≥ 1 actionable item.
    if not resume_improvements:
        resume_improvements = [
            "Rework experience bullets to start with a strong verb + artifact + "
            "metric (e.g. \"Shipped X serving Y QPS, cutting p95 by Z ms\")."
        ]

    if job_skills:
        coverage = len(matching_skills)
        total = len(job_skills)
        if missing_skills:
            rationale = (
                f"Candidate covers {coverage}/{total} ({match_score}%) of the "
                f"required skills for \"{job_title or target_job_id}\". "
                f"Biggest gaps: {', '.join(missing_skills[:3])}."
            )
        else:
            rationale = (
                f"Candidate already covers all {total} required skills for "
                f"\"{job_title or target_job_id}\" — focus on impact/metrics "
                "rather than adding more skills."
            )
    else:
        rationale = (
            "Target job has no declared required skills, so this coaching "
            "focuses on presentation quality rather than skill gaps."
        )

    return CoachResponse(
        member_id=member_id,
        match_score=match_score,
        matching_skills=matching_skills,
        missing_skills=missing_skills,
        headline_suggestion=headline_suggestion,
        resume_improvements=resume_improvements,
        rationale=rationale,
        # Backwards-compatible alias kept for older callers / Mongo readers.
        skills_to_add=missing_skills,
    )
