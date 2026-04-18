# AI Agent Service — Skill Descriptions

**Author:** Bhoomika (Member 3)
**Last updated:** 2026-04-16

---

## Skill 1: Resume Parser

**File:** `services/ai-agent/src/skills/resume_parser.py`
**Endpoint:** `POST /ai/skills/parse-resume`

### Inputs

| Field | Type | Description |
|-------|------|-------------|
| `resume_text` | `str` | Raw resume text (plain text extracted from PDF/DOCX) |
| `member_id` | `str` | UUID of the member |

### Outputs

| Field | Type | Description |
|-------|------|-------------|
| `member_id` | `str` | Echoed from input |
| `skills` | `list[str]` | Detected technical skills (lowercase, deduplicated) |
| `years_experience` | `int` | Total years computed from date ranges in the resume |
| `education` | `list[{institution, degree, year}]` | Extracted education entries |
| `summary` | `str` | 1–2 sentence human-readable summary |
| `parse_error` | `str \| null` | Set if parsing partially failed |

### Extraction Strategy (Deterministic / Default)

1. **Skill detection:** Matches against a curated list of 50+ technology keywords
   (Python, React, Kubernetes, etc.) using case-insensitive substring search.
2. **Years experience:** Scans for date range patterns like `2018 - 2023` or
   `2020 - present` using regex, sums the durations (capped at 50 years).
3. **Education:** Matches lines containing university/college/institute keywords
   and degree patterns (B.S., M.S., Ph.D., MBA).
4. **Summary:** Synthesised from the top 5 skills + experience count.

### LLM Backend (Pluggable)

If `OPENAI_API_KEY` is set, uses `gpt-4o-mini` with a JSON-mode prompt for richer,
context-aware extraction. Falls back to deterministic on any error or timeout.

### Failure Handling

- Timeout: 30 seconds on LLM call
- Retry: 1 automatic retry on any exception
- On second failure: returns partial result with `parse_error` set
- Result persisted to MongoDB `ai_traces` regardless of success/failure

### Prompt Template (LLM mode)

```
Extract structured information from the following resume text.
Return a JSON object with keys: skills (list of strings),
years_experience (integer), education (list of {institution, degree, year}),
summary (string).

Resume:
<resume_text[:4000]>
```

---

## Skill 2: Job-Candidate Matcher

**File:** `services/ai-agent/src/skills/job_matcher.py`
**Endpoint:** `POST /ai/skills/match`

### Inputs

| Field | Type | Description |
|-------|------|-------------|
| `job_id` | `str` | Unique job identifier |
| `job_description` | `str` | Full job description text |
| `job_skills` | `list[str]` | Required skills for the job |
| `candidate_profiles` | `list[CandidateProfile]` | Each has `member_id`, `skills[]`, optional `parsed_resume` |

### Outputs

| Field | Type | Description |
|-------|------|-------------|
| `job_id` | `str` | Echoed from input |
| `matches` | `list[CandidateMatch]` | Sorted descending by `score` |

**CandidateMatch:**

| Field | Type | Description |
|-------|------|-------------|
| `member_id` | `str` | |
| `score` | `float` | Final combined score ∈ [0, 1] |
| `skill_overlap` | `float` | Jaccard similarity of skill sets |
| `embedding_similarity` | `float` | Cosine similarity of text embeddings |
| `rationale` | `str` | Human-readable explanation |

### Scoring Formula

```
skill_overlap       = |intersection(job_skills, candidate_skills)| / |union(job_skills, candidate_skills)|
embedding_similarity = cosine_similarity(embed(job_description), embed(candidate_summary))
final_score          = 0.6 × skill_overlap + 0.4 × embedding_similarity
```

### Embedding Model

- **Model:** `sentence-transformers/all-MiniLM-L6-v2` (HuggingFace)
- **Dimensions:** 384
- **Loaded lazily** on first call to avoid slowing down app startup
- **Runs in ThreadPoolExecutor** (off the asyncio event loop)
- **Timeout:** 30 seconds for entire embedding computation

### Edge Cases

| Condition | Handling |
|-----------|----------|
| No skills AND no resume text | `score = 0.0`, `rationale = "Insufficient profile data"` |
| Embedding model unavailable | Falls back to zero vector → embedding_similarity = 0 |
| Empty job_skills list | skill_overlap = 0 for all; score is purely embedding-based |
| Identical skill sets | skill_overlap = 1.0 |

---

## Skill 3: Outreach Draft Generator

**File:** `services/ai-agent/src/skills/outreach_drafter.py`
**Endpoint:** (called internally by supervisor)

### Inputs

| Field | Type | Description |
|-------|------|-------------|
| `member_id` | `str` | Target candidate |
| `candidate_name` | `str` | Used for personalised greeting |
| `candidate_skills` | `list[str]` | To highlight relevant skills |
| `candidate_summary` | `str` | Extracted from parsed resume |
| `job_title` | `str` | The role being offered |
| `job_description` | `str` | For context-aware personalisation |
| `company_name` | `str` | Recruiter's company |

### Outputs

| Field | Type | Description |
|-------|------|-------------|
| `member_id` | `str` | Echoed |
| `draft_message` | `str` | Full personalised outreach message |
| `personalization_notes` | `str` | Summary of what was personalised and why |

### Template (Default Mode)

```
Hi {name},

I came across your profile and was impressed by your experience with
{top_3_skills}. We have an exciting {job_title} opportunity at {company}
that I think could be a great fit for your background.

The role involves working with {job_highlights}, and your {N} years of
experience makes you a strong candidate.

I'd love to set up a quick 20-minute call to tell you more about the
position. Would you be available this week or next?

Best regards,
Recruiting Team at {company}
```

### LLM Backend (Pluggable)

If `OPENAI_API_KEY` is set, uses `gpt-4o-mini` with `temperature=0.7` for more
natural, varied messages. Returns JSON with `draft_message` and `personalization_notes`.

---

## Skill 4: Career Coach Agent (Phase 2)

**File:** Phase 2 — currently returns structured stub via `POST /ai/coach`

### Planned Inputs

| Field | Type | Description |
|-------|------|-------------|
| `member_id` | `str` | Member to coach |
| `target_job_id` | `str` | Job the member is targeting |

### Planned Outputs

| Field | Type | Description |
|-------|------|-------------|
| `resume_improvements` | `list[str]` | Specific actionable improvements |
| `headline_suggestion` | `str` | Optimised LinkedIn headline |
| `skills_to_add` | `list[str]` | Skills to acquire for the target role |
| `rationale` | `str` | Explanation of recommendations |

### Planned Implementation

1. Fetch member profile from Profile Service
2. Fetch job description from Job Service
3. Compute skill gap: `target_skills - member_skills`
4. Send profile + job to GPT-4o with coaching prompt
5. Parse structured response
6. Stream progress via WebSocket
