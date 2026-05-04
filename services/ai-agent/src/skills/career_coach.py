"""Career Coach skill.

Given a ``member_id`` and a ``target_job_id``, produce structured coaching
feedback: skill gap vs the job, headline suggestion, and resume improvements.

- **Skill lists and match_score** are always computed deterministically from
  profile + job services (stable, testable, no hallucinated skills).
- When ``OPENAI_API_KEY`` is set and ``COACH_LLM_ENABLED`` is true, an LLM
  rewrites **rationale**, **headline_suggestion**, and **resume_improvements**
  into natural, ChatGPT-style prose; on failure or no key, template text is used.
"""
from __future__ import annotations

import asyncio
import json
from typing import Any

from loguru import logger

from ..config import get_settings
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


def _deterministic_rationale(
    job_skills: list[str],
    matching_skills: list[str],
    missing_skills: list[str],
    match_score: int,
    job_title: str,
    target_job_id: str,
) -> str:
    role_label = job_title or target_job_id
    if job_skills:
        coverage = len(matching_skills)
        total = len(job_skills)
        if missing_skills:
            top_gaps = _format_skills(missing_skills[:3])
            return (
                f"Candidate covers {coverage} of {total} required skills "
                f"for the {role_label} role, which is {match_score} percent. "
                f"The biggest gaps are {top_gaps}."
            )
        return (
            f"Candidate already covers all {total} required skills for "
            f"the {role_label} role. Focus on demonstrating impact and "
            "measurable outcomes rather than adding more skills."
        )
    return (
        "The target job does not list required skills, so this coaching "
        "focuses on resume presentation rather than skill gaps."
    )


def _clip(text: str, max_len: int) -> str:
    t = (text or "").strip()
    if len(t) <= max_len:
        return t
    return t[: max_len - 1] + "…"


async def _llm_coach_prose(
    *,
    member_id: str,
    trace_id: str,
    profile: dict[str, Any],
    job: dict[str, Any],
    matching_skills: list[str],
    missing_skills: list[str],
    match_score: int,
    deterministic_headline: str,
    deterministic_rationale: str,
    deterministic_improvements: list[str],
) -> dict[str, Any] | None:
    """Ask OpenAI for narrative fields only. Returns parsed dict or None."""
    settings = get_settings()
    if not (settings.openai_api_key or "").strip():
        return None
    if not settings.coach_llm_enabled:
        return None

    job_title = (job.get("title") or "").strip()
    company = (job.get("company_name") or "").strip()
    location = (job.get("location") or "").strip()
    job_desc = _clip(job.get("description") or "", 2800)
    req_skills = job.get("skills_required") or job.get("skills") or []

    member_headline = _clip(profile.get("headline") or "", 400)
    member_about = _clip(profile.get("about") or profile.get("bio") or "", 2000)
    member_skills = profile.get("skills") or []
    if not isinstance(member_skills, list):
        member_skills = []

    facts = (
        f"Member ID: {member_id}\n"
        f"Current headline: {member_headline or '(none)'}\n"
        f"About/summary:\n{member_about or '(empty)'}\n"
        f"Profile skills (as stored): {', '.join(str(s) for s in member_skills[:40])}\n\n"
        f"Target job: {job_title or '(unknown title)'}\n"
        f"Company: {company or '(unknown)'}\n"
        f"Location: {location or '(unknown)'}\n"
        f"Required skills for this job (authoritative): {', '.join(str(s) for s in req_skills)}\n"
        f"Skills the member already matches (authoritative): {', '.join(matching_skills)}\n"
        f"Skills the member is missing for this job (authoritative): {', '.join(missing_skills)}\n"
        f"Computed match score (authoritative, 0-100): {match_score}\n\n"
        f"Job description excerpt:\n{job_desc or '(none)'}\n"
    )

    system = (
        "You are an expert career coach writing for a LinkedIn-style product. "
        "Use second person (you/your). Be warm, specific, and concise—like ChatGPT "
        "helping a friend. Do not contradict the authoritative skill lists or score; "
        "you may interpret and explain them in natural language. "
        "Output a single JSON object with exactly these keys:\n"
        '- "rationale": string, 2–5 sentences\n'
        '- "headline_suggestion": string, one professional headline (max 220 characters)\n'
        '- "resume_improvements": array of 4–6 strings, each one concrete actionable tip\n'
        "No markdown, no code fences, no extra keys."
    )

    user = (
        facts
        + "\n---\n"
        + "Here is fallback template content you should improve upon (keep the same facts):\n"
        + f"Template rationale:\n{deterministic_rationale}\n\n"
        + f"Template headline:\n{deterministic_headline}\n\n"
        + "Template improvement bullets:\n"
        + "\n".join(f"- {b}" for b in deterministic_improvements[:8])
    )

    try:
        from openai import AsyncOpenAI

        client = AsyncOpenAI(api_key=settings.openai_api_key)
        response = await asyncio.wait_for(
            client.chat.completions.create(
                model=settings.coach_llm_model,
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
                response_format={"type": "json_object"},
                temperature=0.55,
            ),
            timeout=settings.coach_llm_timeout_sec,
        )
        raw = response.choices[0].message.content
        if not raw:
            return None
        data = json.loads(raw)
    except asyncio.TimeoutError:
        logger.warning("coach LLM timed out trace={} — using deterministic copy", trace_id)
        return None
    except Exception as exc:  # noqa: BLE001
        logger.warning("coach LLM failed trace={}: {} — using deterministic copy", trace_id, exc)
        return None

    if not isinstance(data, dict):
        return None
    rationale = data.get("rationale")
    headline = data.get("headline_suggestion")
    improvements = data.get("resume_improvements")
    if not isinstance(rationale, str) or len(rationale.strip()) < 12:
        return None
    if not isinstance(headline, str) or not headline.strip():
        return None
    if not isinstance(improvements, list) or len(improvements) < 1:
        return None
    cleaned_tips: list[str] = []
    for item in improvements:
        if isinstance(item, str) and item.strip():
            cleaned_tips.append(_clip(item.strip(), 600))
    if len(cleaned_tips) < 1:
        return None

    headline_clean = _clip(headline.strip(), 220)
    logger.info("coach LLM narrative ok trace={} member={}", trace_id, member_id)
    return {
        "rationale": rationale.strip(),
        "headline_suggestion": headline_clean,
        "resume_improvements": cleaned_tips[:8],
    }


async def generate_coaching(
    member_id: str,
    target_job_id: str,
    trace_id: str,
) -> CoachResponse:
    """Produce coaching feedback for *member_id* against *target_job_id*."""
    profile: dict[str, Any] = {}
    job: dict[str, Any] = {}

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
    missing_skills = [s for s in job_skills if s not in member_set]
    matching_skills = [s for s in job_skills if s in member_set]

    if job_skills:
        match_score = round(100 * len(matching_skills) / len(job_skills))
    else:
        match_score = 0
    match_score = max(0, min(100, int(match_score)))

    job_title = (job.get("title") or "").strip()
    job_description = (job.get("description") or "").strip()
    top_missing = missing_skills[0] if missing_skills else None

    headline_suggestion = _build_headline(
        profile.get("headline", ""), job_title, top_missing
    )
    if not headline_suggestion or not headline_suggestion.strip():
        headline_suggestion = "Software Engineer | Open to new opportunities"

    member_summary = (profile.get("about") or profile.get("bio") or "") or ""
    resume_improvements = _resume_improvements(
        missing_skills, member_summary, job_title, job_description
    )
    if not resume_improvements:
        resume_improvements = [
            "Start each experience bullet with a strong action verb followed by "
            "what you built and the result you measured."
        ]

    rationale = _deterministic_rationale(
        job_skills, matching_skills, missing_skills, match_score, job_title, target_job_id
    )

    llm = await _llm_coach_prose(
        member_id=member_id,
        trace_id=trace_id,
        profile=profile,
        job=job,
        matching_skills=matching_skills,
        missing_skills=missing_skills,
        match_score=match_score,
        deterministic_headline=headline_suggestion,
        deterministic_rationale=rationale,
        deterministic_improvements=resume_improvements,
    )
    if llm:
        headline_suggestion = llm["headline_suggestion"]
        resume_improvements = llm["resume_improvements"]
        rationale = llm["rationale"]

    return CoachResponse(
        member_id=member_id,
        match_score=match_score,
        matching_skills=matching_skills,
        missing_skills=missing_skills,
        headline_suggestion=headline_suggestion,
        resume_improvements=resume_improvements,
        rationale=rationale,
        skills_to_add=missing_skills,
    )
