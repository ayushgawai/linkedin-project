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


def _format_skills(skills: list[str]) -> str:
    """Format a list of skills as a clean comma-and-and string.

    ['python']                     -> 'Python'
    ['python', 'kafka']            -> 'Python and Kafka'
    ['python', 'kafka', 'docker']  -> 'Python, Kafka, and Docker'
    """
    titled = [s.title() for s in skills]
    if not titled:
        return ""
    if len(titled) == 1:
        return titled[0]
    if len(titled) == 2:
        return f"{titled[0]} and {titled[1]}"
    return ", ".join(titled[:-1]) + f", and {titled[-1]}"


def _build_headline(existing: str, job_title: str, top_missing: str | None) -> str:
    """Compose a clean LinkedIn-style headline that signals intent toward
    the target role.

    Format: "<Base> | Targeting <Role> | Focus: <Skill>"
    Uses pipes as the only separator. No em dashes, no parentheses.
    """
    existing = (existing or "").strip()
    base = existing if existing else "Software Engineer"
    target = (job_title or "").strip()
    parts = [base]
    if target:
        parts.append(f"Targeting {target}")
    if top_missing:
        parts.append(f"Focus: {top_missing.title()}")
    return " | ".join(parts)


def _resume_improvements(
    missing_skills: list[str],
    member_summary: str,
    job_title: str,
    job_description: str,
) -> list[str]:
    """Clean, structured resume tips.

    Each item is a short standalone sentence that reads well as a bullet
    point in the UI. No em dashes, no parenthetical examples, no
    multi-clause run-ons.
    """
    improvements: list[str] = []

    if missing_skills:
        top = _format_skills(missing_skills[:3])
        improvements.append(
            f"Add resume bullet points that show hands-on experience with {top}."
        )
        improvements.append(
            "Pair each bullet with a measurable outcome such as latency, "
            "throughput, cost savings, or revenue impact."
        )

    if len(missing_skills) >= 4:
        improvements.append(
            f"Add a Relevant Skills section at the top of your resume so all "
            f"{len(missing_skills)} missing keywords are picked up by "
            "recruiters and ATS scans."
        )

    summary = (member_summary or "").strip()
    if len(summary) < 80:
        target = job_title or "your target"
        improvements.append(
            f"Rewrite your profile summary into 3 to 4 sentences that frame "
            f"your experience for a {target} role."
        )
        improvements.append(
            "Lead with the impact you have delivered, not your day-to-day "
            "responsibilities."
        )

    improvements.append(
        "Start each experience bullet with a strong action verb followed by "
        "what you built and the result you measured."
    )

    if job_description:
        improvements.append(
            "Mirror two or three phrases from the target job description in "
            "your resume wherever it is truthful."
        )
        improvements.append(
            "This makes keyword matching against the job posting more reliable."
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
            "Start each experience bullet with a strong action verb followed by "
            "what you built and the result you measured."
        ]

    role_label = job_title or target_job_id
    if job_skills:
        coverage = len(matching_skills)
        total = len(job_skills)
        if missing_skills:
            top_gaps = _format_skills(missing_skills[:3])
            rationale = (
                f"Candidate covers {coverage} of {total} required skills "
                f"for the {role_label} role, which is {match_score} percent. "
                f"The biggest gaps are {top_gaps}."
            )
        else:
            rationale = (
                f"Candidate already covers all {total} required skills for "
                f"the {role_label} role. Focus on demonstrating impact and "
                "measurable outcomes rather than adding more skills."
            )
    else:
        rationale = (
            "The target job does not list required skills, so this coaching "
            "focuses on resume presentation rather than skill gaps."
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
