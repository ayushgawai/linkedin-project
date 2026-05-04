"""Hiring Assistant Supervisor.

Orchestrates the multi-step AI shortlisting workflow:

  1. Receive task from ai.requests (via KafkaRequestsConsumer)
  2. Fetch applications for the job
  3. Fetch member profiles
  4. Parse each resume
  5. Match all candidates against the job
  6. Generate outreach drafts for top-N candidates
  7. Emit final result to ai.results + WebSocket

Trace ID is propagated through every step and every emitted message.
Kafka offsets are committed by the consumer *after* this method returns.
"""
from __future__ import annotations

import asyncio
import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Any

from loguru import logger

from .config import get_settings
from .db import claim_idempotency_key, finalize_idempotency_key, get_ai_traces
from .kafka_events import build_result_envelope
from .models import (
    CandidateProfile,
    OutreachDraftRequest,
    ParseResumeResponse,
    TaskStatus,
)
from .service_clients import (
    get_applications_by_job,
    get_job,
    get_member_profile,
)
from .skills.career_coach import generate_coaching
from .skills.job_matcher import match_candidates
from .skills.outreach_drafter import draft_outreach
from .skills.resume_parser import parse_resume

if TYPE_CHECKING:
    from .kafka_producer import KafkaProducer

TOP_N = 3  # number of candidates to generate outreach drafts for
SKILL_TIMEOUT = 30  # seconds per skill call
MIN_OUTREACH_SCORE = 0.15  # candidates scoring below this get a "below-threshold" note instead of a draft


def _normalize_score_threshold(value: Any) -> float:
    """Accept either 0..1 or 0..100 UI-style thresholds."""
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return MIN_OUTREACH_SCORE
    if numeric > 1:
        numeric /= 100.0
    return max(0.0, min(1.0, numeric))


class HiringAssistantSupervisor:
    """Stateless supervisor — each task is an independent coroutine run."""

    def __init__(self, kafka_producer: "KafkaProducer") -> None:
        self._producer = kafka_producer

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    async def _emit_progress(
        self,
        task_id: str,
        trace_id: str,
        step: str,
        status: str,
        partial_result: dict[str, Any] | None = None,
    ) -> None:
        """
        Persist step progress to MongoDB and produce a result event to Kafka.

        Note: this method does NOT broadcast to WebSocket directly. The
        ``ai.results`` consumer is the single source of WebSocket frames, so
        every client sees exactly the same stream regardless of which
        AI-service replica produced it.

        Task-level status transitions:
          - step.status == "failed"                  → TaskStatus.FAILED
          - step == "complete" AND status == "completed" → TaskStatus.COMPLETED
          - otherwise                                → TaskStatus.RUNNING
        """
        # ---- Derive the correct task-level status ---------------------
        if status == "failed":
            task_status = TaskStatus.FAILED
            terminal: str | None = "failed"
        elif step == "complete" and status == "completed":
            task_status = TaskStatus.COMPLETED
            terminal = "completed"
        else:
            task_status = TaskStatus.RUNNING
            terminal = None

        # ---- 1. MongoDB persist ---------------------------------------
        try:
            get_ai_traces().update_one(
                {"task_id": task_id},
                {
                    "$push": {
                        "steps": {
                            "step": step,
                            "status": status,
                            "timestamp": datetime.utcnow(),
                            "partial_result": partial_result,
                        }
                    },
                    "$set": {
                        "status": task_status.value,
                        "updated_at": datetime.utcnow(),
                    },
                },
                upsert=False,
            )
        except Exception as exc:  # noqa: BLE001
            logger.error("MongoDB progress write failed: {}", exc)

        # ---- 2. Kafka ai.results (single source for downstream broadcast) --
        envelope = build_result_envelope(
            task_id=task_id,
            trace_id=trace_id,
            step=step,
            step_status=status,
            terminal=terminal,
            partial_result=partial_result,
        )
        settings = get_settings()
        self._producer.produce(
            settings.kafka_topic_results,
            envelope.model_dump(),
            key=task_id,
        )

    async def _update_task_status(
        self,
        task_id: str,
        status: TaskStatus,
        result: dict[str, Any] | None = None,
    ) -> None:
        """Update the top-level task document status in MongoDB."""
        try:
            update: dict[str, Any] = {
                "$set": {"status": status.value, "updated_at": datetime.utcnow()}
            }
            if result is not None:
                update["$set"]["result"] = result
            get_ai_traces().update_one({"task_id": task_id}, update)
        except Exception as exc:
            logger.error("MongoDB task status update failed: {}", exc)

    # ------------------------------------------------------------------
    # Idempotency — atomic claim-before-process
    # ------------------------------------------------------------------

    def _try_claim(
        self,
        idempotency_key: str,
        task_id: str,
        trace_id: str,
    ) -> bool:
        """
        Claim the idempotency key via the processed_events ledger.

        Returns True if this is a fresh delivery; False if already processed.
        On crash + redelivery, the unique index rejects the duplicate and we skip.
        """
        return claim_idempotency_key(idempotency_key, task_id, trace_id)

    # ------------------------------------------------------------------
    # Shortlist workflow
    # ------------------------------------------------------------------

    async def _run_shortlist(
        self,
        task_id: str,
        trace_id: str,
        job_id: str,
        recruiter_id: str,
        *,
        include_outreach: bool = True,
        top_n: int = TOP_N,
        min_outreach_score: float = MIN_OUTREACH_SCORE,
    ) -> None:
        """Candidate pipeline for a given job.

        When ``include_outreach`` is True (task_type=shortlist) we run the
        full pipeline through outreach drafting and persist the result under
        ``shortlist``. When False (task_type=match) we stop after scoring
        and persist ranked candidates under ``matches`` with no drafts —
        useful for recruiters who only want to rank applicants, or for
        upstream systems that will handle outreach elsewhere.
        """

        # ---- Step 0: Fetch the job itself (real data, not a placeholder) --
        await self._emit_progress(task_id, trace_id, "fetching_job", "running")
        try:
            job = await asyncio.wait_for(get_job(job_id), timeout=SKILL_TIMEOUT)
        except Exception as exc:  # noqa: BLE001
            logger.error("fetch job failed for {}: {}", job_id, exc)
            await self._emit_progress(
                task_id, trace_id, "fetching_job", "failed", {"reason": str(exc)}
            )
            await self._update_task_status(task_id, TaskStatus.FAILED)
            return
        await self._emit_progress(
            task_id, trace_id, "fetching_job", "completed",
            {"job_title": job.get("title", ""), "job_skills": job.get("skills_required", [])},
        )

        # ---- Step 1: Fetch applications --------------------------------
        await self._emit_progress(task_id, trace_id, "fetching_applications", "running")
        try:
            applications = await asyncio.wait_for(
                get_applications_by_job(job_id), timeout=SKILL_TIMEOUT
            )
        except Exception as exc:
            logger.error("fetch applications failed: {}", exc)
            await self._emit_progress(
                task_id, trace_id, "fetching_applications", "failed",
                {"reason": str(exc)},
            )
            await self._update_task_status(task_id, TaskStatus.FAILED)
            return

        await self._emit_progress(
            task_id, trace_id, "fetching_applications", "completed",
            {"application_count": len(applications)},
        )

        if not applications:
            await self._emit_progress(
                task_id, trace_id, "complete", "completed",
                {"message": "No applications found for this job."},
            )
            empty_metrics = {"candidates_evaluated": 0, "top_score": 0.0, "avg_score": 0.0}
            empty_result: dict[str, Any] = (
                {"shortlist": [], "metrics": empty_metrics}
                if include_outreach
                else {"matches": [], "metrics": empty_metrics}
            )
            await self._update_task_status(
                task_id, TaskStatus.COMPLETED, empty_result,
            )
            return

        # ---- Step 2: Fetch profiles ------------------------------------
        await self._emit_progress(task_id, trace_id, "fetching_profiles", "running")
        profiles_by_member: dict[str, dict[str, Any]] = {}
        for app in applications:
            member_id = app["member_id"]
            try:
                profile = await asyncio.wait_for(
                    get_member_profile(member_id), timeout=SKILL_TIMEOUT
                )
                profiles_by_member[member_id] = profile
            except Exception as exc:
                logger.warning("Could not fetch profile for {}: {}", member_id, exc)
                profiles_by_member[member_id] = {"member_id": member_id, "skills": []}

        await self._emit_progress(
            task_id, trace_id, "fetching_profiles", "completed",
            {"profiles_fetched": len(profiles_by_member)},
        )

        # ---- Step 3: Parse resumes -------------------------------------
        await self._emit_progress(task_id, trace_id, "parsing_resumes", "running")
        parsed_resumes: dict[str, ParseResumeResponse] = {}
        for app in applications:
            member_id = app["member_id"]
            resume_text = app.get("resume_text", "")
            if not resume_text:
                parsed_resumes[member_id] = ParseResumeResponse(
                    member_id=member_id,
                    skills=profiles_by_member.get(member_id, {}).get("skills", []),
                )
                continue
            try:
                parsed = await asyncio.wait_for(
                    parse_resume(resume_text, member_id, task_id, trace_id),
                    timeout=SKILL_TIMEOUT,
                )
                parsed_resumes[member_id] = parsed
            except asyncio.TimeoutError:
                logger.warning("Resume parse timed out for member_id={}", member_id)
                parsed_resumes[member_id] = ParseResumeResponse(
                    member_id=member_id, parse_error="timeout"
                )
            except Exception as exc:
                logger.error("Resume parse error for {}: {}", member_id, exc)
                parsed_resumes[member_id] = ParseResumeResponse(
                    member_id=member_id, parse_error=str(exc)
                )

        await self._emit_progress(
            task_id, trace_id, "parsing_resumes", "completed",
            {"resumes_parsed": len(parsed_resumes)},
        )

        # ---- Step 4: Build candidate profiles for matching -------------
        # Enrich each candidate with headline + about + experience summaries so
        # the embedding step has meaningful semantic text, not just a skills list.
        candidate_profiles: list[CandidateProfile] = []
        for app in applications:
            member_id = app["member_id"]
            profile = profiles_by_member.get(member_id, {})
            parsed = parsed_resumes.get(member_id)

            # Combine profile headline/about/experience into the parsed_resume summary
            # so the matcher's embedding gets richer context.
            enriched_summary_parts: list[str] = []
            if profile.get("headline"):
                enriched_summary_parts.append(profile["headline"])
            if profile.get("about"):
                enriched_summary_parts.append(profile["about"])
            for exp in (profile.get("experience") or [])[:3]:
                title = exp.get("title", "")
                company = exp.get("company", "")
                desc = exp.get("description", "")
                enriched_summary_parts.append(f"{title} at {company}: {desc}".strip())
            if parsed and parsed.summary:
                enriched_summary_parts.append(parsed.summary)

            enriched = parsed
            if parsed is not None and enriched_summary_parts:
                # Keep everything else but prepend richer context to summary
                enriched = parsed.model_copy(update={
                    "summary": " | ".join(p for p in enriched_summary_parts if p)
                })

            cp = CandidateProfile(
                member_id=member_id,
                skills=list({*(profile.get("skills") or []), *((parsed.skills if parsed else []))}),
                parsed_resume=enriched,
            )
            candidate_profiles.append(cp)

        # ---- Step 5: Match candidates (with REAL job data) -------------
        await self._emit_progress(task_id, trace_id, "matching", "running")
        try:
            match_result = await asyncio.wait_for(
                match_candidates(
                    job_id,
                    job.get("description", ""),
                    job.get("skills_required", []),
                    candidate_profiles,
                ),
                timeout=SKILL_TIMEOUT,
            )
        except asyncio.TimeoutError:
            await self._emit_progress(
                task_id, trace_id, "matching", "failed", {"reason": "timeout"}
            )
            await self._update_task_status(task_id, TaskStatus.FAILED)
            return
        except Exception as exc:
            logger.error("Matching failed: {}", exc)
            await self._emit_progress(
                task_id, trace_id, "matching", "failed", {"reason": str(exc)}
            )
            await self._update_task_status(task_id, TaskStatus.FAILED)
            return

        await self._emit_progress(
            task_id, trace_id, "matching", "completed",
            {"top_score": match_result.matches[0].score if match_result.matches else 0},
        )

        top_matches = match_result.matches[:max(1, int(top_n))]

        # ---- Step 6: Generate outreach drafts for top-N (shortlist only) ----
        shortlist: list[dict[str, Any]] = []
        if include_outreach:
            await self._emit_progress(task_id, trace_id, "drafting", "running")
            job_title = job.get("title", f"Role {job_id}")
            job_description = job.get("description", "")
            company_name = job.get("company_name", "")

            for match in top_matches:
                profile = profiles_by_member.get(match.member_id, {})
                parsed = parsed_resumes.get(match.member_id)

                # Gate on minimum score — below threshold gets a note, not a draft.
                if match.score < min_outreach_score:
                    shortlist.append({
                        "member_id": match.member_id,
                        "score": match.score,
                        "skill_overlap": match.skill_overlap,
                        "embedding_similarity": match.embedding_similarity,
                        "rationale": match.rationale,
                        "outreach_draft": None,
                        "draft_status": "below_threshold",
                    })
                    continue

                outreach_req = OutreachDraftRequest(
                    member_id=match.member_id,
                    candidate_name=f"{profile.get('first_name', '')} {profile.get('last_name', '')}".strip() or "Candidate",
                    candidate_skills=profile.get("skills", []),
                    candidate_summary=parsed.summary if parsed else "",
                    job_title=job_title,
                    job_description=job_description,
                    company_name=company_name,
                )
                try:
                    draft = await asyncio.wait_for(
                        draft_outreach(outreach_req), timeout=SKILL_TIMEOUT
                    )
                    outreach_text = draft.draft_message
                    draft_status = "generated"
                except asyncio.TimeoutError:
                    logger.warning("Outreach draft timed out for {}", match.member_id)
                    outreach_text = None
                    draft_status = "timeout"
                except Exception as exc:
                    logger.warning("Outreach draft failed for {}: {}", match.member_id, exc)
                    outreach_text = None
                    draft_status = "error"

                shortlist.append({
                    "member_id": match.member_id,
                    "score": match.score,
                    "skill_overlap": match.skill_overlap,
                    "embedding_similarity": match.embedding_similarity,
                    "rationale": match.rationale,
                    "outreach_draft": outreach_text,
                    "draft_status": draft_status,
                })

            if shortlist and not any(candidate.get("outreach_draft") for candidate in shortlist):
                # Seeded classroom/demo data can score low with deterministic
                # fallback embeddings. Still generate one draft for the
                # strongest candidate so the human-approval step is demoable.
                best = shortlist[0]
                profile = profiles_by_member.get(best["member_id"], {})
                parsed = parsed_resumes.get(best["member_id"])
                outreach_req = OutreachDraftRequest(
                    member_id=best["member_id"],
                    candidate_name=f"{profile.get('first_name', '')} {profile.get('last_name', '')}".strip() or "Candidate",
                    candidate_skills=profile.get("skills", []),
                    candidate_summary=parsed.summary if parsed else "",
                    job_title=job_title,
                    job_description=job_description,
                    company_name=company_name,
                )
                try:
                    draft = await asyncio.wait_for(
                        draft_outreach(outreach_req), timeout=SKILL_TIMEOUT
                    )
                    best["outreach_draft"] = draft.draft_message
                    best["draft_status"] = "fallback_generated"
                except Exception as exc:  # noqa: BLE001
                    logger.warning("Fallback outreach draft failed for {}: {}", best["member_id"], exc)

            await self._emit_progress(
                task_id, trace_id, "drafting", "completed",
                {"drafts_generated": len(shortlist)},
            )

        # ---- Step 7: Final result & metrics ----------------------------
        all_scores = [m.score for m in match_result.matches]
        metrics = {
            "candidates_evaluated": len(match_result.matches),
            "top_score": round(all_scores[0], 4) if all_scores else 0.0,
            "avg_score": round(sum(all_scores) / len(all_scores), 4) if all_scores else 0.0,
        }

        if include_outreach:
            final_result: dict[str, Any] = {"shortlist": shortlist, "metrics": metrics}
            log_label = "Shortlist"
        else:
            # Match-only: return ranked candidates with scores, no drafts.
            matches_out = [
                {
                    "member_id": m.member_id,
                    "score": m.score,
                    "skill_overlap": m.skill_overlap,
                    "embedding_similarity": m.embedding_similarity,
                    "rationale": m.rationale,
                }
                for m in top_matches
            ]
            final_result = {"matches": matches_out, "metrics": metrics}
            log_label = "Match"

        await self._emit_progress(
            task_id, trace_id, "complete", "completed",
            final_result,
        )
        await self._update_task_status(task_id, TaskStatus.COMPLETED, final_result)
        logger.info(
            "{} complete — task_id={} trace_id={} candidates={} top_score={}",
            log_label, task_id, trace_id,
            metrics["candidates_evaluated"], metrics["top_score"],
        )

    # ------------------------------------------------------------------
    # Dispatch entry point (called by Kafka consumer)
    # ------------------------------------------------------------------

    async def process_task(self, kafka_message: dict[str, Any]) -> None:
        """
        Entry point called by the Kafka consumer for each message on ai.requests.

        Enforces idempotency, then dispatches to the appropriate workflow.
        """
        idempotency_key = kafka_message.get("idempotency_key", "")
        trace_id = kafka_message.get("trace_id", str(uuid.uuid4()))
        payload = kafka_message.get("payload", {})
        task_id = payload.get("task_id") or kafka_message.get("entity", {}).get("entity_id", "")
        task_type = payload.get("task_type", "shortlist")
        job_id = payload.get("job_id", "")
        recruiter_id = kafka_message.get("actor_id", "")
        top_n = payload.get("top_n", TOP_N)
        min_outreach_score = _normalize_score_threshold(payload.get("min_match_score"))

        if not task_id:
            logger.error("Received ai.requests message with no task_id — skipping")
            return

        # Idempotency — atomic claim before any side effects.
        if idempotency_key:
            claimed = self._try_claim(idempotency_key, task_id, trace_id)
            if not claimed:
                logger.info(
                    "Skipping already-claimed idempotency_key={} (duplicate delivery)",
                    idempotency_key,
                )
                return

        logger.info(
            "Processing task_id={} type={} job_id={} trace_id={}",
            task_id, task_type, job_id, trace_id,
        )

        # Ensure a task document exists (REST may race with the consumer).
        try:
            get_ai_traces().update_one(
                {"task_id": task_id},
                {
                    "$setOnInsert": {
                        "task_id": task_id,
                        "trace_id": trace_id,
                        "job_id": job_id,
                        "recruiter_id": recruiter_id,
                        "task_type": task_type,
                        "steps": [],
                        "approvals": [],
                        "result": None,
                        "created_at": datetime.utcnow(),
                    },
                    "$set": {
                        "status": TaskStatus.RUNNING.value,
                        "idempotency_key": idempotency_key,
                        "updated_at": datetime.utcnow(),
                    },
                },
                upsert=True,
            )
        except Exception as exc:  # noqa: BLE001
            logger.error("Failed to upsert task doc: {}", exc)

        # Run the workflow. Whatever happens (success, handled failure, or
        # unhandled exception) we only finalize the idempotency claim when
        # the workflow actually reaches a terminal state. An unhandled
        # exception here leaves the claim in `in_progress`, so after the
        # staleness window elapses Kafka redelivery can re-attempt it.
        try:
            if task_type == "shortlist":
                await self._run_shortlist(
                    task_id,
                    trace_id,
                    job_id,
                    recruiter_id,
                    include_outreach=True,
                    top_n=top_n,
                    min_outreach_score=min_outreach_score,
                )
            elif task_type == "match":
                await self._run_shortlist(
                    task_id,
                    trace_id,
                    job_id,
                    recruiter_id,
                    include_outreach=False,
                    top_n=top_n,
                    min_outreach_score=min_outreach_score,
                )
            elif task_type == "parse":
                await self._run_parse(task_id, trace_id, payload, recruiter_id)
            elif task_type == "coach":
                await self._run_coach(task_id, trace_id, payload, recruiter_id)
            else:
                logger.warning("Unknown task_type={} for task_id={}", task_type, task_id)
                await self._update_task_status(task_id, TaskStatus.FAILED)
        except Exception:
            # Don't finalize — leave claim in `in_progress` so a future
            # redelivery (after staleness window) can retake the task.
            logger.exception(
                "Unhandled error in workflow task_id={} type={}",
                task_id, task_type,
            )
            raise
        else:
            if idempotency_key:
                finalize_idempotency_key(idempotency_key)

    # ------------------------------------------------------------------
    # Parse workflow
    # ------------------------------------------------------------------

    async def _run_parse(
        self,
        task_id: str,
        trace_id: str,
        payload: dict[str, Any],
        recruiter_id: str,
    ) -> None:
        """Parse a single resume and emit the same progress shape as shortlist.

        Emits ``parsing_resume`` running/completed followed by ``complete``
        so WebSocket clients subscribed to the task see a structured event
        stream, not just a single terminal frame.
        """
        resume_text = payload.get("resume_text", "") or ""
        member_id = payload.get("member_id") or recruiter_id

        if not resume_text.strip():
            await self._emit_progress(
                task_id, trace_id, "parsing_resume", "failed",
                {"reason": "empty resume_text"},
            )
            await self._update_task_status(task_id, TaskStatus.FAILED)
            return

        await self._emit_progress(task_id, trace_id, "parsing_resume", "running")
        try:
            parsed = await asyncio.wait_for(
                parse_resume(resume_text, member_id, task_id, trace_id),
                timeout=SKILL_TIMEOUT,
            )
        except asyncio.TimeoutError:
            await self._emit_progress(
                task_id, trace_id, "parsing_resume", "failed", {"reason": "timeout"},
            )
            await self._update_task_status(task_id, TaskStatus.FAILED)
            return
        except Exception as exc:  # noqa: BLE001
            logger.error("parse_resume failed task={} member={}: {}",
                         task_id, member_id, exc)
            await self._emit_progress(
                task_id, trace_id, "parsing_resume", "failed", {"reason": str(exc)},
            )
            await self._update_task_status(task_id, TaskStatus.FAILED)
            return

        await self._emit_progress(
            task_id, trace_id, "parsing_resume", "completed",
            {
                "skills_count": len(parsed.skills or []),
                "experience_years": parsed.years_experience,
                "parse_error": parsed.parse_error,
            },
        )

        final_result = parsed.model_dump()
        await self._emit_progress(
            task_id, trace_id, "complete", "completed", final_result,
        )
        await self._update_task_status(task_id, TaskStatus.COMPLETED, final_result)
        logger.info(
            "Parse complete — task_id={} trace_id={} skills={}",
            task_id, trace_id, len(parsed.skills or []),
        )

    # ------------------------------------------------------------------
    # Coach workflow
    # ------------------------------------------------------------------

    async def _run_coach(
        self,
        task_id: str,
        trace_id: str,
        payload: dict[str, Any],
        recruiter_id: str,
    ) -> None:
        """Run a career-coach analysis for a member against a target job."""
        member_id = payload.get("member_id") or recruiter_id
        target_job_id = payload.get("target_job_id") or payload.get("job_id", "")

        if not member_id or not target_job_id:
            await self._emit_progress(
                task_id, trace_id, "coach", "failed",
                {"reason": "member_id and target_job_id are required"},
            )
            await self._update_task_status(task_id, TaskStatus.FAILED)
            return

        await self._emit_progress(task_id, trace_id, "coach", "running")
        try:
            result = await asyncio.wait_for(
                generate_coaching(member_id, target_job_id, trace_id),
                timeout=SKILL_TIMEOUT,
            )
        except asyncio.TimeoutError:
            await self._emit_progress(
                task_id, trace_id, "coach", "failed", {"reason": "timeout"},
            )
            await self._update_task_status(task_id, TaskStatus.FAILED)
            return
        except Exception as exc:  # noqa: BLE001
            logger.error("coach failed task={} member={}: {}",
                         task_id, member_id, exc)
            await self._emit_progress(
                task_id, trace_id, "coach", "failed", {"reason": str(exc)},
            )
            await self._update_task_status(task_id, TaskStatus.FAILED)
            return

        coach_dict = result.model_dump()
        await self._emit_progress(
            task_id, trace_id, "coach", "completed",
            {
                "match_score": coach_dict.get("match_score", 0),
                "matching_skills_count": len(coach_dict.get("matching_skills", [])),
                "missing_skills_count": len(coach_dict.get("missing_skills", [])),
                "improvements_count": len(coach_dict.get("resume_improvements", [])),
            },
        )
        await self._emit_progress(
            task_id, trace_id, "complete", "completed", coach_dict,
        )
        await self._update_task_status(task_id, TaskStatus.COMPLETED, coach_dict)
        logger.info(
            "Coach complete — task_id={} trace_id={} member={} score={} gaps={}",
            task_id, trace_id, member_id,
            coach_dict.get("match_score", 0),
            len(coach_dict.get("missing_skills", [])),
        )
