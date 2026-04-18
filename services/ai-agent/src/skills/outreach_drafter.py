"""Outreach Draft Generator Skill.

Produces a personalised recruiter outreach message for a candidate.

Strategy:
- Default: template-based generation (no external API needed).
- If OPENAI_API_KEY is set, uses GPT to generate a richer message (pluggable).
"""
from __future__ import annotations

import asyncio

from loguru import logger

from ..config import get_settings
from ..models import OutreachDraftRequest, OutreachDraftResponse

# ---------------------------------------------------------------------------
# Template-based generator (default)
# ---------------------------------------------------------------------------

_TEMPLATE = """\
Hi {name},

I came across your profile and was impressed by your experience with {top_skills}. \
We have an exciting {job_title} opportunity at {company} that I think could be a \
great fit for your background.

The role involves working with {job_highlights}, and your {years_note}makes you a \
strong candidate.

I'd love to set up a quick 20-minute call to tell you more about the position. \
Would you be available this week or next?

Best regards,
Recruiting Team{company_suffix}
"""


def _template_draft(req: OutreachDraftRequest) -> tuple[str, str]:
    """Return (draft_message, personalization_notes) using the template."""
    top_skills = ", ".join(req.candidate_skills[:3]) if req.candidate_skills else "your expertise"
    company = req.company_name or "our company"
    company_suffix = f" at {req.company_name}" if req.company_name else ""

    # Build a short job highlights snippet from the description
    job_highlights = (req.job_description[:120].rstrip() + "…") if req.job_description else req.job_title

    # Years of experience note from the candidate summary
    years_note = ""
    if req.candidate_summary:
        import re
        m = re.search(r"(\d+)\s+year", req.candidate_summary, re.IGNORECASE)
        if m:
            years_note = f"{m.group(1)} years of experience "

    draft = _TEMPLATE.format(
        name=req.candidate_name,
        top_skills=top_skills,
        job_title=req.job_title,
        company=company,
        job_highlights=job_highlights,
        years_note=years_note,
        company_suffix=company_suffix,
    ).strip()

    notes = (
        f"Personalised for: {req.candidate_name}. "
        f"Highlighted skills: {top_skills}. "
        f"Role: {req.job_title}."
    )
    return draft, notes


# ---------------------------------------------------------------------------
# LLM-backed generator (optional, pluggable)
# ---------------------------------------------------------------------------


async def _llm_draft(req: OutreachDraftRequest) -> tuple[str, str] | None:
    """Use OpenAI to generate the outreach message. Returns None if unavailable."""
    settings = get_settings()
    if not settings.openai_api_key:
        return None

    try:
        from openai import AsyncOpenAI  # lazy import
        client = AsyncOpenAI(api_key=settings.openai_api_key)

        prompt = (
            f"Write a personalised recruiter outreach message for the following candidate:\n"
            f"Name: {req.candidate_name}\n"
            f"Skills: {', '.join(req.candidate_skills)}\n"
            f"Summary: {req.candidate_summary}\n\n"
            f"Job Title: {req.job_title}\n"
            f"Company: {req.company_name}\n"
            f"Job Description: {req.job_description[:500]}\n\n"
            "Return JSON with keys: draft_message (string), personalization_notes (string)."
        )
        response = await asyncio.wait_for(
            client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[{"role": "user", "content": prompt}],
                response_format={"type": "json_object"},
                temperature=0.7,
            ),
            timeout=30,
        )
        import json
        data = json.loads(response.choices[0].message.content)
        return data.get("draft_message", ""), data.get("personalization_notes", "")
    except asyncio.TimeoutError:
        logger.warning("OpenAI outreach draft timed out — using template")
        return None
    except Exception as exc:  # noqa: BLE001
        logger.warning("OpenAI outreach draft failed ({}). Using template.", exc)
        return None


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


async def draft_outreach(req: OutreachDraftRequest) -> OutreachDraftResponse:
    """Generate a personalised outreach message for *req.member_id*."""
    result = await _llm_draft(req)

    if result:
        draft_message, personalization_notes = result
    else:
        draft_message, personalization_notes = _template_draft(req)

    return OutreachDraftResponse(
        member_id=req.member_id,
        draft_message=draft_message,
        personalization_notes=personalization_notes,
    )
