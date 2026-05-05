"""Career Coach skill.

Given a ``member_id`` and ``target_job_id``, produce structured coaching
feedback: skill gap vs the job, headline suggestion, and resume improvements.

- **Skill lists and match_score** are always computed deterministically from
  profile + job services (stable, testable, no hallucinated skills).
- When ``resume_text`` is supplied, the LLM receives the FULL resume and is
  instructed to give hyper-specific, line-by-line feedback tied to the JD.
- When an OpenAI key is set, the LLM rewrites all narrative fields; on
  failure or no key, template text is used.
- Previous suggestions for the same (member_id, target_job_id) pair are
  retrieved from MongoDB and passed to the LLM to prevent repetition.
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
    titled = [s.title() for s in skills]
    if not titled:
        return ""
    if len(titled) == 1:
        return titled[0]
    if len(titled) == 2:
        return f"{titled[0]} and {titled[1]}"
    return ", ".join(titled[:-1]) + f", and {titled[-1]}"


def _build_headline(existing: str, job_title: str, top_missing: str | None) -> str:
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
    company: str,
) -> list[str]:
    """JD-specific resume tips for the no-LLM fallback path."""
    improvements: list[str] = []
    role = job_title or "this role"
    org = f" at {company}" if company else ""

    if missing_skills:
        for skill in missing_skills[:3]:
            improvements.append(
                f"The {role}{org} requires {skill.title()}. Add a bullet in your most recent "
                f"role that demonstrates hands-on use of {skill.title()} with a concrete outcome "
                f"(e.g., reduced latency by X%, processed Y records/sec, cut deploy time by Z%)."
            )

    if len(missing_skills) >= 4:
        kw_list = ", ".join(s.title() for s in missing_skills[:6])
        improvements.append(
            f"Add a 'Technical Skills' section near the top listing {kw_list} "
            f"so recruiters and ATS scans for the {role} posting can immediately confirm coverage."
        )

    summary = (member_summary or "").strip()
    if len(summary) < 80:
        improvements.append(
            f"Your profile summary is too short for a {role} application. "
            f"Expand it to 3-4 sentences: what you build, your stack, and why "
            f"you're a strong fit for {role}{org}."
        )

    if job_description:
        improvements.append(
            f"Mirror 2-3 phrases from the {role} job description verbatim in your resume "
            f"(e.g., exact tool names, methodology terms) to improve ATS keyword matching."
        )

    improvements.append(
        "Rewrite experience bullets using the formula: Action verb + what you built/owned + "
        "measurable result. Avoid passive phrases like 'Responsible for' or 'Helped with'."
    )

    return improvements


def _deterministic_rationale(
    job_skills: list[str],
    matching_skills: list[str],
    missing_skills: list[str],
    match_score: int,
    job_title: str,
    target_job_id: str,
    company: str,
) -> str:
    role_label = job_title or target_job_id
    org = f" at {company}" if company else ""
    if job_skills:
        coverage = len(matching_skills)
        total = len(job_skills)
        if missing_skills:
            top_gaps = _format_skills(missing_skills[:3])
            return (
                f"Your profile covers {coverage} of {total} required skills for the "
                f"{role_label}{org} role ({match_score}%). "
                f"The biggest gaps are {top_gaps}. "
                f"Adding these to your resume and demonstrating them with metrics will "
                f"significantly improve your match for this position."
            )
        return (
            f"You already cover all {total} required skills for the {role_label}{org} role. "
            f"Focus your resume on demonstrating the scale and business impact of that experience "
            f"rather than adding more skills."
        )
    return (
        f"The {role_label}{org} job posting doesn't list specific required skills, "
        f"so focus your resume on clearly articulating your domain expertise and "
        f"matching the language used in the job description."
    )


def _clip(text: str, max_len: int) -> str:
    t = (text or "").strip()
    if len(t) <= max_len:
        return t
    return t[: max_len - 1] + "…"


def _skills_from_resume(resume_text: str, job_skills: list[str]) -> list[str]:
    """Return the subset of *job_skills* that appear (case-insensitive) in the resume text.

    Uses a simple but reliable substring match so that e.g. 'aws' matches 'AWS',
    'mysql' matches 'MySQL', 'node.js' matches 'Node.js', etc.
    We also check a few common long-form aliases so 'aws' matches
    'amazon web services' and 'k8s' matches 'kubernetes'.
    """
    _ALIASES: dict[str, list[str]] = {
        "aws": ["amazon web services", "amazon aws"],
        "gcp": ["google cloud platform", "google cloud"],
        "k8s": ["kubernetes"],
        "kubernetes": ["k8s"],
        "postgres": ["postgresql"],
        "postgresql": ["postgres"],
        "js": ["javascript"],
        "javascript": [" js "],
        "ts": ["typescript"],
        "typescript": [" ts "],
    }
    resume_lower = resume_text.lower()
    found: list[str] = []
    for skill in job_skills:
        skill_lower = skill.lower()
        # Direct substring match
        if skill_lower in resume_lower:
            found.append(skill)
            continue
        # Check aliases
        for alias in _ALIASES.get(skill_lower, []):
            if alias in resume_lower:
                found.append(skill)
                break
    return found


def _get_previous_suggestions(member_id: str, target_job_id: str) -> list[str]:
    """Fetch resume improvement suggestions already given for this member+job pair."""
    try:
        from ..db import get_ai_traces
        cursor = get_ai_traces().find(
            {
                "member_id": member_id,
                "target_job_id": target_job_id,
                "task_type": "coach",
                "status": "completed",
            },
            {"result.resume_improvements": 1, "created_at": 1},
        ).sort("created_at", -1).limit(5)

        seen: set[str] = set()
        out: list[str] = []
        for doc in cursor:
            for tip in (doc.get("result") or {}).get("resume_improvements") or []:
                if isinstance(tip, str) and tip.strip() and tip not in seen:
                    seen.add(tip)
                    out.append(tip)
        return out
    except Exception as exc:  # noqa: BLE001
        logger.warning("Could not fetch previous suggestions: {}", exc)
        return []


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
    resume_text: str | None,
    previous_suggestions: list[str],
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
    job_desc = _clip(job.get("description") or "", 3000)
    req_skills = job.get("skills_required") or job.get("skills") or []

    member_headline = _clip(profile.get("headline") or "", 400)
    member_about = _clip(profile.get("about") or profile.get("bio") or "", 1500)
    member_skills = profile.get("skills") or []
    if not isinstance(member_skills, list):
        member_skills = []

    prev_section = ""
    if previous_suggestions:
        prev_lines = "\n".join(f"- {s}" for s in previous_suggestions[:10])
        prev_section = (
            f"\n## PREVIOUSLY GIVEN SUGGESTIONS — DO NOT REPEAT THESE:\n"
            f"The candidate has already received the following advice. "
            f"Your suggestions MUST cover different angles and gaps:\n{prev_lines}\n"
        )

    if resume_text and resume_text.strip():
        system = (
            "You are a senior technical recruiter and career coach reviewing a resume "
            "for a specific job. Your feedback must be HYPER-SPECIFIC — every suggestion "
            "must reference exact text from the candidate's resume AND a specific requirement "
            "from the job description.\n\n"
            "RULES:\n"
            "1. Every resume_improvements item MUST quote or paraphrase a specific bullet, "
            "job title, section, or phrase from the ACTUAL RESUME TEXT below.\n"
            "2. Every improvement MUST tie to a specific requirement or phrase from the JD.\n"
            "3. Never give generic advice. BAD: 'Quantify your achievements.' "
            "GOOD: 'Your bullet \\'Built data pipelines\\' at Acme doesn\\'t mention scale — "
            "the JD requires experience with high-throughput systems; rewrite it to: "
            "\\'Built Python ETL pipelines processing 2M records/day at Acme.\\''\n"
            "4. Give 5–7 improvements covering different gaps — not all about the same skill.\n"
            "5. Do NOT repeat previously given suggestions (listed in the prompt).\n"
            "6. Be a coach: frame as specific rewrites, additions, or restructuring steps.\n"
            "7. Output a single JSON object with ONLY these keys: "
            "\"rationale\", \"headline_suggestion\", \"resume_improvements\". "
            "No markdown, no code fences."
        )

        user = (
            f"## CANDIDATE'S ACTUAL RESUME:\n{_clip(resume_text, 4000)}\n\n"
            f"## TARGET POSITION: {job_title or 'Not specified'}"
            + (f" at {company}" if company else "")
            + (f" ({location})" if location else "")
            + "\n\n"
            f"## JOB DESCRIPTION:\n{job_desc or '(not provided)'}\n\n"
            f"## SKILL ANALYSIS (authoritative — do not contradict):\n"
            f"- Required skills: {', '.join(str(s) for s in req_skills) or 'not listed'}\n"
            f"- Skills already in resume/profile: {', '.join(matching_skills) or 'none'}\n"
            f"- Skills missing from resume: {', '.join(missing_skills) or 'none'}\n"
            f"- Match score: {match_score}%\n"
            + prev_section
            + "\n---\n"
            "Provide JSON with:\n"
            "- \"rationale\": 2-4 sentences naming the candidate's actual roles/companies "
            "from their resume and contrasting with THIS job's requirements\n"
            "- \"headline_suggestion\": one specific LinkedIn headline for THIS role\n"
            "- \"resume_improvements\": 5-7 hyper-specific improvements, each quoting "
            "actual resume text and tying it to a specific JD requirement\n"
        )
    else:
        # Profile-only mode — no resume text, use profile data
        system = (
            "You are a senior career coach writing personalized LinkedIn profile and resume "
            "guidance for a job seeker. Use second person (you/your). Be specific to THIS job "
            "and THIS candidate's profile — do not give generic advice.\n\n"
            "RULES:\n"
            "1. Reference the candidate's actual current headline, skills, or summary in your suggestions.\n"
            "2. Tie every suggestion to a specific requirement from the job description.\n"
            "3. Do NOT repeat previously given suggestions.\n"
            "4. Output a single JSON with keys: \"rationale\", \"headline_suggestion\", "
            "\"resume_improvements\". No markdown, no code fences."
        )

        user = (
            f"## CANDIDATE PROFILE:\n"
            f"Current headline: {member_headline or '(none)'}\n"
            f"About/summary: {member_about or '(empty)'}\n"
            f"Profile skills: {', '.join(str(s) for s in member_skills[:40]) or 'none listed'}\n\n"
            f"## TARGET POSITION: {job_title or 'Not specified'}"
            + (f" at {company}" if company else "")
            + (f" ({location})" if location else "")
            + "\n\n"
            f"## JOB DESCRIPTION:\n{job_desc or '(not provided)'}\n\n"
            f"## SKILL ANALYSIS (authoritative):\n"
            f"- Required: {', '.join(str(s) for s in req_skills) or 'not listed'}\n"
            f"- Already has: {', '.join(matching_skills) or 'none'}\n"
            f"- Missing: {', '.join(missing_skills) or 'none'}\n"
            f"- Match score: {match_score}%\n"
            + prev_section
            + "\n---\n"
            "Provide JSON with:\n"
            "- \"rationale\": 2-4 sentences specific to this candidate and job\n"
            "- \"headline_suggestion\": optimized for this specific role\n"
            "- \"resume_improvements\": 5-7 specific, actionable tips tied to THIS JD requirements, "
            "referencing their current profile skills/headline where possible\n"
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
                temperature=0.4,  # lower = more focused, less generic
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

    logger.info("coach LLM narrative ok trace={} member={}", trace_id, member_id)
    return {
        "rationale": rationale.strip(),
        "headline_suggestion": _clip(headline.strip(), 220),
        "resume_improvements": cleaned_tips[:8],
    }


async def generate_coaching(
    member_id: str,
    target_job_id: str,
    trace_id: str,
    resume_text: str | None = None,
) -> CoachResponse:
    """Produce coaching feedback for *member_id* against *target_job_id*.

    If *resume_text* is provided (extracted from an uploaded PDF/DOCX),
    the LLM uses the actual resume content to give line-specific feedback.
    """
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

    # When a resume is uploaded, use it as the authoritative skills source.
    # The profile database may not have the same skills as the actual resume.
    if resume_text and resume_text.strip() and job_skills:
        resume_matched = _skills_from_resume(resume_text, job_skills)
        matching_skills = resume_matched
        missing_skills = [s for s in job_skills if s not in set(resume_matched)]
        logger.info(
            "coach: resume skill match — matched={} missing={} job_skills={}",
            matching_skills, missing_skills, job_skills,
        )
    else:
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
    company = (job.get("company_name") or "").strip()
    top_missing = missing_skills[0] if missing_skills else None

    headline_suggestion = _build_headline(
        profile.get("headline", ""), job_title, top_missing
    )
    if not headline_suggestion or not headline_suggestion.strip():
        headline_suggestion = "Software Engineer | Open to new opportunities"

    member_summary = (profile.get("about") or profile.get("bio") or "") or ""
    resume_improvements = _resume_improvements(
        missing_skills, member_summary, job_title, job_description, company
    )
    if not resume_improvements:
        resume_improvements = [
            "Start each experience bullet with a strong action verb followed by "
            "what you built and the result you measured."
        ]

    rationale = _deterministic_rationale(
        job_skills, matching_skills, missing_skills, match_score,
        job_title, target_job_id, company
    )

    # Fetch previous suggestions to prevent repetition
    previous_suggestions = _get_previous_suggestions(member_id, target_job_id)

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
        resume_text=resume_text,
        previous_suggestions=previous_suggestions,
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
