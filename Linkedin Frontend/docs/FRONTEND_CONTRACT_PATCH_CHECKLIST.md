# Frontend Contract Patch Checklist

This checklist lists concrete frontend-side patches required to align the current implementation with `LinkedInClone_MasterPrompt.docx` contract expectations.

Use this as an execution list for the integration teammate.

---

## 1) AI Contract Alignment (Highest Priority)

### Why
Master prompt uses:
- `POST /ai/request`
- `POST /ai/status`
- `POST /ai/approve`
- `WS /ai/stream/{task_id}`

Current frontend uses `/ai/tasks/*` patterns.

### Files to patch
- `src/api/ai.ts`
- `src/features/recruiter/RecruiterAiPage.tsx`
- `src/hooks/*` or socket helpers used by recruiter AI stream
- `docs/CONTRACT.md`
- `docs/END_TO_END_WORKFLOW.md`

### Required changes
- Add adapter methods in `src/api/ai.ts`:
  - `requestAiTask()` -> POST `/ai/request`
  - `getAiStatus()` -> POST `/ai/status`
  - `approveAiTask()` -> POST `/ai/approve`
- Keep backward compatibility by supporting both old and new endpoints temporarily:
  - Try new endpoint first, fallback to old only if explicitly needed during transition.
- Update AI WS URL to master format:
  - `ws://<host>:8007/ai/stream/${task_id}`
- Update event payload mapping in UI:
  - Ensure `step`, `status`, `partial_result`, `trace_id` are parsed exactly.

### Acceptance criteria
- Recruiter AI workflow runs against `/ai/request|status|approve`.
- AI progress appears over `/ai/stream/{task_id}` with no frontend code changes required per environment.

---

## 2) Standard Response/Error Envelope Compatibility

### Why
Master prompt requires:
- Success: `{ success: true, data: ..., trace_id }`
- Error: `{ success: false, error: { code, message, details }, trace_id }`

Current frontend often expects direct payloads.

### Files to patch
- `src/api/client.ts`
- All service files under `src/api/*.ts`

### Required changes
- Add response unwrapping helper in `src/api/client.ts`:
  - If response has `{ success, data }`, return `data`.
  - If direct payload, return payload as-is (backward compatible).
- Add centralized API error mapper:
  - Extract `error.code`, `error.message`, `trace_id`.
  - Preserve HTTP status for UI handling (409 duplicate, etc.).

### Acceptance criteria
- Frontend works with both envelope and direct-body responses.
- Toasts and forms surface correct backend error codes/messages.

---

## 3) Application Status Enum Normalization

### Why
Master prompt status flow:
- `submitted -> reviewing -> interview -> offer|rejected`

Current frontend contains mixed values (`under_review`, `shortlisted`, `accepted`).

### Files to patch
- `src/types/api.ts`
- `src/types/tracker.ts`
- `src/lib/statusUtils.ts`
- `src/api/applications.ts`
- `src/features/recruiter/RecruiterApplicantsPage.tsx`
- `src/features/jobs/JobTrackerPage.tsx`
- `src/features/jobs/JobTrackerRow.tsx`

### Required changes
- Define one canonical status union in frontend:
  - `submitted | reviewing | interview | offer | rejected`
- Add compatibility mapping for old mock values:
  - `under_review -> reviewing`
  - `shortlisted -> interview`
  - `accepted -> offer`
- Ensure recruiter actions send canonical values to backend.
- Ensure tracker tab mapping uses canonical values only.

### Acceptance criteria
- No page depends on `under_review/shortlisted/accepted` as canonical backend values.
- Recruiter status updates and tracker display are consistent.

---

## 4) Endpoint Completeness (Contract Compliance)

### Why
Master prompt includes additional endpoints used for complete workflow contract:
- `POST /members/delete`
- `POST /applications/get`

Even if UI does not yet surface both actions, contract-aware API layer should support them.

### Files to patch
- `src/api/profile.ts`
- `src/api/applications.ts`
- `src/types/*` where needed
- `docs/CONTRACT.md`

### Required changes
- Add `deleteMember(member_id)` in `src/api/profile.ts`.
- Add `getApplication(application_id)` in `src/api/applications.ts`.
- Keep these methods ready for integration tests and future UI hooks.

### Acceptance criteria
- API layer fully covers master contract endpoints.

---

## 5) Port/Service Routing Compatibility

### Why
Master prompt defines fixed service ports (`8001..8007`) while current `.env` uses a gateway-style `8000`.

### Files to patch
- `.env.example`
- `src/api/client.ts`
- `src/api/ai.ts`
- `docs/CONTRACT.md`

### Required changes
- Support both modes:
  - **Gateway mode** (single `VITE_API_BASE_URL`)
  - **Direct service mode** (optional env vars):
    - `VITE_PROFILE_API_BASE_URL`
    - `VITE_JOB_API_BASE_URL`
    - `VITE_APPLICATION_API_BASE_URL`
    - `VITE_MESSAGING_API_BASE_URL`
    - `VITE_CONNECTION_API_BASE_URL`
    - `VITE_ANALYTICS_API_BASE_URL`
    - `VITE_AI_API_BASE_URL`
- Add deterministic base URL resolver in API layer.

### Acceptance criteria
- Frontend can run against fixed port services without code edits.

---

## 6) Saved Jobs: Durable Backend Alignment

### Why
UI exposes saved jobs; class workflow implies retrievable member-facing state.

### Files to patch
- `src/store/savedJobsStore.ts`
- `src/api/jobs.ts` (or new `src/api/savedJobs.ts`)
- `src/features/saved/SavedPage.tsx`
- `src/components/jobs/JobListItem.tsx`
- `src/components/jobs/JobDetail.tsx`

### Required changes
- Add backend-facing methods:
  - `saveJob(member_id, job_id)`
  - `unsaveJob(member_id, job_id)`
  - `listSavedJobs(member_id, page, page_size)`
- Keep local optimistic update but reconcile with backend response.
- Continue event emission `job.saved` to `/events/ingest`.

### Acceptance criteria
- Saved jobs survive login/session/device when backend is enabled.

---

## 7) Messaging vs AI Realtime Separation

### Why
Master text mixes notification language; frontend must keep protocols explicit to avoid integration confusion.

### Files to patch
- `src/hooks/useMessagingSocket.ts`
- `src/features/recruiter/RecruiterAiPage.tsx`
- `docs/END_TO_END_WORKFLOW.md`
- `docs/CONTRACT.md`

### Required changes
- Explicitly document:
  - Messaging WS channel: messaging events only.
  - AI WS channel: AI task events only.
- Ensure no shared parser assumptions across channels.

### Acceptance criteria
- Each channel has independent payload typing and retry strategy.

---

## 8) Contract and Workflow Docs Synchronization

### Why
Current project docs still describe team-draft endpoint names in places.

### Files to patch
- `docs/CONTRACT.md`
- `docs/END_TO_END_WORKFLOW.md`
- `README.md`

### Required changes
- Add a “Professor Contract Overrides” section.
- Mark any temporary adapter paths clearly.
- Publish final canonical endpoint table and enum table.

### Acceptance criteria
- New teammate can integrate without reverse-engineering mixed contracts.

---

## 9) Integration Smoke Test Matrix (Frontend-Owned)

Run after all patches with `VITE_USE_MOCKS=false`:

1. Login/signup with role routing
2. Profile get/update (and delete API call via test harness)
3. Jobs search/get/create/update/close/byRecruiter
4. Apply + duplicate + closed-job error handling
5. Recruiter update status + add note
6. My applications status rendering
7. Messaging thread/message with WS live receive
8. AI request/status/approve + WS stream
9. Saved jobs persist/reload
10. Analytics pages show non-empty data when events exist

---

## 10) Implementation Order (Recommended)

1. AI endpoint + WS alignment
2. Response envelope adapter
3. Status enum normalization
4. Endpoint completeness (`members/delete`, `applications/get`)
5. Port routing compatibility
6. Saved jobs backend sync
7. Docs sync + smoke matrix run

---

## Definition of Done

The frontend is considered contract-aligned when:
- It works against professor-aligned endpoint names and payloads.
- It accepts standard envelope responses and errors.
- Status values are canonical and consistent across recruiter/member views.
- AI and messaging realtime channels are separated and stable.
- Saved jobs are retrievable from backend in real mode.
- Documentation reflects final frozen integration contract.

