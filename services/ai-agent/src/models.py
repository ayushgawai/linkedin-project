"""Pydantic v2 request/response models for the AI Agent Service."""
from __future__ import annotations

import uuid
from datetime import datetime
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, Field, field_validator, model_validator


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------


class TaskType(str, Enum):
    SHORTLIST = "shortlist"
    MATCH = "match"
    PARSE = "parse"
    COACH = "coach"


class TaskStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class StepStatus(str, Enum):
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    # A step finished but with caveats (e.g. resume parsed with fallback
    # regex extraction after LLM error). Not a failure — the pipeline
    # continues — but consumers may want to surface it distinctly.
    PARTIAL = "partial"


class ApprovalAction(str, Enum):
    APPROVE = "approve"
    EDIT = "edit"
    REJECT = "reject"


# ---------------------------------------------------------------------------
# Standard response envelope helpers
# ---------------------------------------------------------------------------


class ErrorDetail(BaseModel):
    code: str
    message: str
    details: dict[str, Any] = Field(default_factory=dict)


class SuccessResponse(BaseModel):
    success: bool = True
    data: Any
    trace_id: str = Field(default_factory=lambda: str(uuid.uuid4()))


class ErrorResponse(BaseModel):
    success: bool = False
    error: ErrorDetail
    trace_id: str = Field(default_factory=lambda: str(uuid.uuid4()))


# ---------------------------------------------------------------------------
# AI Request / Status / Approve
# ---------------------------------------------------------------------------


class AIRequestBody(BaseModel):
    """Request envelope for ``POST /ai/request``.

    Fields required depend on ``task_type``:

    - ``shortlist`` / ``match``: ``job_id`` + ``recruiter_id``
    - ``parse``: ``resume_text`` (``member_id`` optional — falls back to
      ``recruiter_id``)
    - ``coach``: ``member_id`` + ``target_job_id``

    Everything else remains optional so we can extend the contract
    without breaking existing callers.
    """

    # Common
    recruiter_id: str
    task_type: TaskType

    # shortlist / match
    job_id: Optional[str] = None

    # parse
    resume_text: Optional[str] = None
    member_id: Optional[str] = None

    # coach
    target_job_id: Optional[str] = None

    @field_validator("recruiter_id")
    @classmethod
    def recruiter_must_not_be_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("recruiter_id must not be empty")
        return v

    @model_validator(mode="after")
    def _require_fields_by_task_type(self) -> "AIRequestBody":
        t = self.task_type
        missing: list[str] = []
        if t in (TaskType.SHORTLIST, TaskType.MATCH):
            if not (self.job_id and self.job_id.strip()):
                missing.append("job_id")
        elif t == TaskType.PARSE:
            if not (self.resume_text and self.resume_text.strip()):
                missing.append("resume_text")
        elif t == TaskType.COACH:
            if not (self.member_id and self.member_id.strip()):
                missing.append("member_id")
            if not (self.target_job_id and self.target_job_id.strip()):
                missing.append("target_job_id")
        if missing:
            raise ValueError(
                f"task_type={t.value} requires: {', '.join(missing)}"
            )
        return self


class AIRequestResponse(BaseModel):
    task_id: str
    trace_id: str


class StepRecord(BaseModel):
    step: str
    status: StepStatus
    timestamp: datetime
    partial_result: Optional[dict[str, Any]] = None


class AIStatusResponse(BaseModel):
    task_id: str
    status: TaskStatus
    steps: list[StepRecord] = Field(default_factory=list)
    result: Optional[dict[str, Any]] = None


class AIApproveBody(BaseModel):
    """Per-candidate approval decision on a shortlisted outreach draft."""

    task_id: str
    member_id: str  # which candidate in the shortlist the decision applies to
    action: ApprovalAction
    edited_content: Optional[str] = None

    @field_validator("task_id", "member_id")
    @classmethod
    def must_not_be_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Field must not be empty")
        return v


class AIApproveResponse(BaseModel):
    actioned: bool = True
    message_id: Optional[str] = None  # set when outreach was actually sent
    sent: bool = False


class AIStatusBody(BaseModel):
    task_id: str

    @field_validator("task_id")
    @classmethod
    def must_not_be_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("task_id must not be empty")
        return v


# ---------------------------------------------------------------------------
# Skill: Resume Parser
# ---------------------------------------------------------------------------


class ParseResumeRequest(BaseModel):
    resume_text: str
    member_id: str

    @field_validator("resume_text")
    @classmethod
    def resume_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("resume_text must not be empty")
        return v


class ParsedEducation(BaseModel):
    institution: str = ""
    degree: str = ""
    year: Optional[int] = None


class ParseResumeResponse(BaseModel):
    member_id: str
    skills: list[str] = Field(default_factory=list)
    years_experience: int = 0
    education: list[ParsedEducation] = Field(default_factory=list)
    summary: str = ""
    parse_error: Optional[str] = None


# ---------------------------------------------------------------------------
# Skill: Job-Candidate Matching
# ---------------------------------------------------------------------------


class CandidateProfile(BaseModel):
    member_id: str
    skills: list[str] = Field(default_factory=list)
    parsed_resume: Optional[ParseResumeResponse] = None


class MatchRequest(BaseModel):
    job_id: str
    job_description: str = ""
    job_skills: list[str] = Field(default_factory=list)
    candidate_profiles: list[CandidateProfile]


class CandidateMatch(BaseModel):
    member_id: str
    score: float
    skill_overlap: float
    embedding_similarity: float
    rationale: str


class MatchResponse(BaseModel):
    job_id: str
    matches: list[CandidateMatch]


# ---------------------------------------------------------------------------
# Skill: Outreach Drafter
# ---------------------------------------------------------------------------


class OutreachDraftRequest(BaseModel):
    member_id: str
    candidate_name: str = "Candidate"
    candidate_skills: list[str] = Field(default_factory=list)
    candidate_summary: str = ""
    job_title: str
    job_description: str = ""
    company_name: str = ""


class OutreachDraftResponse(BaseModel):
    member_id: str
    draft_message: str
    personalization_notes: str


# ---------------------------------------------------------------------------
# Career Coach
# ---------------------------------------------------------------------------


class CoachRequest(BaseModel):
    member_id: str
    target_job_id: str


class CoachResponse(BaseModel):
    member_id: str
    # Frontend contract fields (Q6 / Frontend Testing Assignment):
    # match_score is an integer 0-100 — never null or undefined.
    match_score: int = 0
    # Skills the member already has that the target job requires.
    matching_skills: list[str] = Field(default_factory=list)
    # Skills the target job requires that the member is missing.
    missing_skills: list[str] = Field(default_factory=list)
    headline_suggestion: str = ""
    resume_improvements: list[str] = Field(default_factory=list)
    rationale: str = ""
    # Backwards-compatible alias for older internal callers / Mongo traces.
    # Mirrors `missing_skills`. Frontend should prefer `missing_skills`.
    skills_to_add: list[str] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Kafka Event Envelope
# ---------------------------------------------------------------------------


class KafkaEntity(BaseModel):
    entity_type: str
    entity_id: str


class KafkaEventEnvelope(BaseModel):
    event_type: str
    trace_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    timestamp: str = Field(default_factory=lambda: datetime.utcnow().isoformat() + "Z")
    actor_id: str
    entity: KafkaEntity
    payload: dict[str, Any] = Field(default_factory=dict)
    idempotency_key: str = Field(default_factory=lambda: str(uuid.uuid4()))


# ---------------------------------------------------------------------------
# WebSocket frame
# ---------------------------------------------------------------------------


class WSFrame(BaseModel):
    task_id: str
    trace_id: str
    step: str
    status: str
    partial_result: Optional[dict[str, Any]] = None
    timestamp: str = Field(default_factory=lambda: datetime.utcnow().isoformat() + "Z")
