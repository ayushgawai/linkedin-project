# LinkedIn Clone Frontend (Distributed Systems Class Project)

This repository contains the **frontend portion** of an 8-member distributed systems class project. The frontend integrates with teammate-owned backend services (profile, jobs, applications, messaging, connections, analytics, and agentic AI) and supports both mock and real backend modes.

## Tech Stack

| Layer | Technology |
|---|---|
| App framework | React 18 + Vite + TypeScript |
| Styling | Tailwind CSS v3 |
| Routing | React Router v6 |
| Server state | TanStack Query v5 |
| Client state | Zustand |
| Forms/validation | react-hook-form + zod |
| Charts | Recharts |
| Icons | lucide-react |
| HTTP | Axios |
| Realtime | Native WebSocket |
| SEO/meta | react-helmet-async |

## Getting Started

1. Install dependencies

```bash
npm install
```

2. Configure environment

```bash
cp .env.example .env.local
```

3. Run app

```bash
npm run dev
```

## Scripts

- `npm run dev` — local dev server
- `npm run build` — production build
- `npm run typecheck` — TypeScript check (`tsc --noEmit`)
- `npm run lint` — ESLint strict mode (`--max-warnings=0`)
- `npm run preview` — preview built output

## Project Structure

- `src/api` — API modules per backend service
- `src/components` — reusable UI and feature components
- `src/features` — route-level feature implementations
- `src/routes` — route configuration and route error boundaries
- `src/store` — Zustand stores
- `src/types` — API/domain types
- `src/lib/mockData.ts` — mock datasets and `seedDemoData()`
- `docs/CONTRACT.md` — integration contract for backend teammate

## Backend Contract Summary

### Profile service
- `POST /auth/login`
- `POST /members/create`
- `POST /members/get`
- `POST /members/update`
- `POST /members/search`

### Jobs service
- `POST /jobs/search`
- `POST /jobs/get`
- `POST /jobs/create`
- `POST /jobs/update`
- `POST /jobs/close`
- `POST /jobs/byRecruiter`

### Applications service
- `POST /applications/submit`
- `POST /applications/byMember`
- `POST /applications/byJob`
- `POST /applications/updateStatus`
- `POST /applications/addNote`

### Messaging service
- `POST /threads/open`
- `POST /threads/get`
- `POST /threads/byUser`
- `POST /messages/list`
- `POST /messages/send`

### Connections service
- `POST /connections/request`
- `POST /connections/accept`
- `POST /connections/reject`
- `POST /connections/list`
- `POST /connections/mutual`

### Analytics + events
- `POST /analytics/member/dashboard`
- `POST /analytics/jobs/top`
- `POST /analytics/funnel`
- `POST /analytics/geo`
- `POST /events/ingest`

### AI service
- `POST /ai/tasks/start`
- `POST /ai/tasks/status`
- `POST /ai/tasks/list`
- `POST /ai/tasks/approve`
- `POST /ai/tasks/reject`

## WebSocket Contracts

- Messaging: `VITE_WS_BASE_URL/messaging?token=<jwt>`
  - events: `message.received`, `typing`, `read_receipt`
- AI tasks: `VITE_WS_BASE_URL/ai/tasks/:task_id?token=<jwt>`
  - events: `step.started`, `step.progress`, `step.completed`, `approval.required`, `task.completed`, `task.failed`

## Kafka Event Emission Points (`/events/ingest`)

- `job.viewed`
- `job.saved`
- `application.submitted`
- `application.status.changed`
- `message.sent`
- `connection.requested`

## Mock vs Real Backend

Set `VITE_USE_MOCKS=true` to use mock-first flows and local fallbacks.
Set `VITE_USE_MOCKS=false` to use real backend endpoints only.

## External Integrations

These APIs are **client-side only** and live in `src/api/external/`. A dedicated Axios instance (`api/external/client.ts`, 8s timeout, 60s response deduplication) is used so **no** JWT auth interceptor is applied — they must never be mixed with `src/api/client.ts`, which is for our team backend (POST with JWT).

- **Hacker News (Algolia), Dev.to, Remotive, Arbeitnow** — public GET JSON endpoints; see `.env.example` for base URL overrides. Set `VITE_ENABLE_EXTERNAL_DATA=false` to use built-in static mocks and skip the network.
- **External jobs are not stored in MySQL.** The Remotive/Arbeitnow style listings are display-only. Bookmarks for those rows use a **Zustand `persist` store** (`savedExternalJobsStore`) in `localStorage` — the backend has no `job_id` for them.
- **External jobs do not emit Kafka** analytics to `/events/ingest` (no `job.saved` / `job.viewed` for those IDs) because they are not part of our system’s data model.
- If a future iteration needed first-class external jobs, you would add a **separate ingestion service** (scheduled ETL) that writes to MySQL and backfills recruiter metadata — that is out of scope for this class project.

## Integration TODOs

- Replace remaining fallback/mocked datasets with service-backed responses
- Align recruiter/application status enum mapping with backend canonical values
- Add final auth token refresh flow and role claims from backend JWT
- Finalize AI task WS payload schemas with FastAPI service
- Add server-driven pagination cursors for large lists

## Final Checklist

| Feature | Route | API endpoints used | Kafka events emitted | WebSocket channels | Status |
|---|---|---|---|---|---|
| Auth | `/login`, `/signup` | `/auth/login`, `/members/create` | - | - | Complete |
| Feed | `/feed` | frontend mock posts API | - | - | Complete |
| Profile | `/in/:memberId` | `/members/get`, `/members/update` | - | - | Complete |
| Jobs | `/jobs`, `/jobs/search`, `/jobs/:jobId` | `/jobs/search`, `/jobs/get`, `/applications/submit` | `job.viewed`, `job.saved`, `application.submitted` | - | Complete |
| Messaging | `/messaging`, `/messaging/:threadId` | `/threads/*`, `/messages/*` | `message.sent` | `/messaging` | Complete |
| My Network | `/mynetwork*` | `/connections/*` | `connection.requested` | - | Complete |
| Notifications | `/notifications` | frontend mock notifications API | - | - | Complete |
| Member Analytics | `/analytics` | `/analytics/member/dashboard` | - | - | Complete |
| Recruiter Dashboard | `/recruiter` | `/analytics/jobs/top`, `/analytics/funnel`, `/analytics/geo` | - | - | Complete |
| Recruiter Jobs | `/recruiter/jobs*` | `/jobs/byRecruiter`, `/jobs/create`, `/jobs/update`, `/jobs/close` | - | - | Complete |
| Recruiter Applicants | `/recruiter/jobs/:jobId/applicants` | `/applications/byJob`, `/applications/updateStatus`, `/applications/addNote` | `application.status.changed` | - | Complete |
| Recruiter AI Copilot | `/recruiter/ai` | `/ai/tasks/*` | (via workflow actions) | `/ai/tasks/:task_id` | Complete |
