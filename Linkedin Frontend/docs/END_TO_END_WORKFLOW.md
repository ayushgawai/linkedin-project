# End-to-End Workflow — LinkedIn Clone Frontend

This document describes how the application is structured, how users move through the product, and how major features connect from UI → state → API (mock or real). It is intended for onboarding, demos, and handoff to backend teammates.

---

## 1. What this project is

- **Single-page application (SPA)** built with **React 18**, **Vite**, **TypeScript**, **Tailwind CSS**.
- **Routing:** React Router v6 (`createBrowserRouter` in `src/routes/index.tsx`).
- **Server state:** TanStack Query (React Query) for caching, loading, and invalidation.
- **Client state:** Zustand (auth, profile, saved jobs, optional presence).
- **HTTP:** Axios via `src/api/client.ts` with Bearer token injection and 401 → logout redirect.
- **Realtime:** Native `WebSocket` for messaging (`src/hooks/useMessagingSocket.ts`); optional `presence` / `presence.heartbeat` message types update local presence when a backend sends them.
- **Integration model:** Most `src/api/*.ts` modules support **`VITE_USE_MOCKS=true`** (in-memory / localStorage-backed behavior) or **`false`** (POST to `VITE_API_BASE_URL` per `docs/CONTRACT.md`).

---

## 2. Environment & run

| Variable | Purpose |
|----------|---------|
| `VITE_USE_MOCKS` | `true` (default in many setups): use mock branches in API modules. `false`: call real HTTP APIs. |
| `VITE_API_BASE_URL` | REST base URL when mocks are off. |
| `VITE_WS_BASE_URL` | WebSocket origin for messaging (and optional presence). |

**Scripts** (`package.json`):

- `npm run dev` — Vite dev server.
- `npm run build` — `tsc -b` + production bundle.
- `npm run typecheck` — `tsc --noEmit`.
- `npm run lint` — ESLint.

**Entry:** `src/main.tsx` mounts the router and global providers (e.g. React Query, Helmet, Toast).

---

## 3. Authentication & session

**Store:** `src/store/authStore.ts` (Zustand + `persist` to `localStorage`).

- **`token`**: opaque string used as `Authorization: Bearer <token>` on `apiClient`.
- **`user`**: `Member` plus optional **`role: 'member' | 'recruiter'`**.
- **`setAuth` / `setUser` / `clearAuth`**.

**Flows:**

1. **Sign up** — `src/features/auth/SignupPage.tsx` (wizard) creates credentials / profile in mock or `POST /members/create` when live.
2. **Login** — `src/features/auth/LoginPage.tsx` sets `setAuth(token, user)`.
3. **Protected routes** — `AppShell` with `protectedRoute` renders `<Navigate to="/login" />` if `!user`.
4. **401** — `apiClient` response interceptor clears auth and sends the browser to `/login`.

**Recruiter-only shell:** `src/features/recruiter/RecruiterRouteGuard.tsx` wraps recruiter hub routes. If `user.role !== 'recruiter'`, user is redirected to `/feed`. **Note:** primary job posting for members uses **`/jobs/post`** (not behind this guard); **applicants** for any signed-in poster use **`/jobs/:jobId/applicants`**.

---

## 4. Application shells & layout

**`RootLayout`** — global chrome (if any) wrapping all routes.

**`AppShell`** (`src/components/layout/AppShell.tsx`):

- **Top navigation** (`TopNav.tsx`).
- **Left rail** — default member rail; variants: profile rail, saved rail, notifications rail, **none** for wide “hub” pages.
- **Main column** — `<Outlet />` for child route.
- **Right rail** — optional (e.g. profile right rail, community rail).
- **Bottom nav** on small screens (`MobileBottomNav.tsx`).
- **`FloatingMessagingDock`** when user is logged in.

**Jobs hub minimal layout** — `src/lib/jobsLayoutPaths.ts` marks paths where the main column spans wider (e.g. `/jobs`, `/jobs/search`, `/jobs/post`, `/jobs/post/:id/edit`, **`/jobs/:jobId/applicants`**).

---

## 5. Route map (high level)

Routes are defined in **`src/routes/index.tsx`**. Below is a functional map (not every redirect).

| Path | Feature | Shell notes |
|------|---------|-------------|
| `/` | Landing | Public |
| `/login`, `/signup` | Auth | Public |
| `/feed` | Home feed | `AppShell` protected |
| `/news` | News | Protected |
| `/jobs` | Job discovery (“More jobs for you”) | Protected, jobs hub |
| `/jobs/search` | Keyword/location search + list + detail | Jobs hub |
| `/jobs/:jobId` | Job detail, Easy Apply, owner actions | Protected |
| `/jobs/:jobId/applicants` | Applicant list + Review + interview/reject | Protected, jobs hub |
| `/jobs/post` | Hiring Pro — create job | Jobs hub |
| `/jobs/post/:jobId/edit` | Edit posting | Jobs hub |
| `/jobs/tracker` | Application tracker | Full-width variant |
| `/job-posting-activity` | Posted jobs hub (LinkedIn-style) | Often full-width column |
| `/saved` | Saved items | Default rails |
| `/in/:memberId` | Profile | Custom left + right rail |
| `/in/:memberId/activity` | Profile activity | Same |
| `/mynetwork`, `/mynetwork/connections`, `/mynetwork/invitations` | Network | Sometimes no left rail |
| `/messaging`, `/messaging/:threadId` | Messaging | Full-width |
| `/notifications` | Notifications | Notifications left rail |
| `/analytics` | Member analytics | Full-width |
| `/help`, `/learning` | Help / learning placeholder | Full-width |
| `/groups`, `/groups/:groupId` | Groups | Community right rail |
| `/newsletters` | Newsletters | Community rail |
| `/events` | Events | Full-width |
| `/companies/:companyId` | Company page | Full-width |
| `/recruiter/*` | Recruiter dashboard, manage jobs, AI, duplicate job form routes | **`RecruiterRouteGuard`** + recruiter left rail |

Legacy redirect: `/recruiter/job-posting-activity` → `/job-posting-activity`.

---

## 6. End-to-end user journeys

### 6.1 First visit → account → home

1. User opens **`/`** (`LandingPage`).
2. Clicks **Join** / **Sign in** → **`/signup`** or **`/login`**.
3. After successful auth, user is typically sent to **`/feed`** (or intended destination stored in router state).
4. **`authStore`** persists; refresh keeps session until logout or 401.

### 6.2 Feed & social content

- **`/feed`** — `src/features/feed/FeedPage.tsx`: post creation, feed list, interactions (likes, comments per product scope).
- Posts tie to **`profileStore`** / members for author display.
- **Analytics:** meaningful actions can call **`ingestEvent`** from `src/api/analytics.ts` (mock or `POST /events/ingest`).

### 6.3 Profile

- **`/in/:memberId`** — `ProfilePage.tsx` + modals + sections; **`profileStore`** holds editable profile for the signed-in member.
- **`/in/:memberId/activity`** — activity sub-route.
- **Right rail** lazy `ProfileRightRail` for contextual widgets.

### 6.4 My Network

- **`/mynetwork`** — discovery / invitations overview (`NetworkPage`).
- **`/mynetwork/connections`** — accepted connections (`NetworkConnectionsPage`).
- **`/mynetwork/invitations`** — pending invites (`NetworkInvitationsPage`).
- API surface in **`src/api/connections.ts`** (list, request, accept, reject mocks or HTTP).

### 6.5 Messaging (1:1 threads)

1. User opens **`/messaging`** or **`/messaging/:threadId`** (`MessagingPage.tsx`).
2. **Threads** load via **`listThreadsByUser`** (`src/api/messaging.ts`).
3. **Messages** for active thread via **`listMessages`** with query key `['messages', threadId]`.
4. **WebSocket** (`useMessagingSocket`): with `token`, connects to `VITE_WS_BASE_URL/messaging?token=...`. Handles `message.received`, `typing`, `read_receipt`, and optional **`presence`** / **`presence.heartbeat`** to update `memberPresenceStore`.
5. **Cross-tab mock sync** — `broadcastMessagingThreadUpdate` / `subscribeMessagingThreadUpdates` (`src/lib/messagingCrossTab.ts`) via `localStorage` `storage` events.
6. **Session presence** — `useSessionPresenceSync` in `AppShell` + **`BroadcastChannel`** (`memberPresenceChannel.ts`) + **`memberPresenceStore`**: heartbeats so another tab/window on the same origin can show **Online / Offline** next to thread participants (`useMemberPresence` in `MessagingPage`).
7. **Composer** sends **`sendMessage`** + socket `message.send`; optimistic updates in React Query.

### 6.6 Notifications

1. **`/notifications`** — `NotificationsPage.tsx`, infinite query on **`listNotifications`** (`src/api/notifications.ts`).
2. **Mock filtering:** optional **`viewer_member_id`** so notifications with **`recipient_member_id`** only appear for that member; items without `recipient_member_id` remain “global” demo items.
3. **Nav badge** — `fetchNavBadges` / `navBadges.ts` counts unread with the same recipient rule.
4. **Job application outcomes** (mock): when a recruiter invites to interview or rejects from **`RecruiterApplicantsPage`**, **`pushMockApplicationOutcomeNotification`** prepends a row to **`MOCK_NOTIFICATIONS`** (`src/lib/mockData.ts`) with:
   - **Interview:** `interview_invite: true`, copy asking to accept/decline; UI shows **Accept interview** / **Decline** (toasts + optional navigation).
   - **Rejection:** plain `application_status` update message.

### 6.7 Jobs — discovery & search

**Discovery (`/jobs`)** — `JobsDiscoveryPage.tsx`:

- Infinite **`listJobs`** (`src/api/jobs.ts`) for “More jobs for you”.
- **Save** toggles **`savedJobsStore`**.
- **Dismiss (X)** under bookmark: local **`dismissedIds`** hides rows client-side; **`onDismiss`** on **`JobListItem`**.

**Search (`/jobs/search`)** — `JobsSearchPage.tsx`:

- Filters + virtualized or stacked **`JobListItem`** list; **selected job** drives right **`JobDetail`** panel.
- Same dismiss + save behavior.

**Job detail (`/jobs/:jobId`)** — `JobDetail.tsx`:

- Loads **`getJob`**, view analytics, **Easy Apply** modal (`ApplyModal.tsx`).
- **Owner:** **View applicants** → `/jobs/:jobId/applicants`; **Edit** / **Delete** (with **`ConfirmModal`**, not `window.confirm`); delete calls **`closeJob`** and navigates to **`/job-posting-activity`**.

### 6.8 Easy Apply → applications → recruiter review

1. Candidate opens job detail, clicks **Easy Apply** → **`ApplyModal`** (`src/components/jobs/ApplyModal.tsx`).
2. Steps: **Contact** → **Resume** (file → blob URL in browser) → **Questions** → **Review** → **Apply**.
3. **`submitApplication`** (`src/api/applications.ts`):
   - Persists mock application row per job in **`mockApplicantsByJobId`** (includes contact, serialized answers, resume URL normalized for recruiter PDF preview in mocks).
   - **`incrementJobApplicants`** on the job.
   - **`appendApplicationToMemberTracker`** for the applicant’s tracker list.
4. React Query invalidates: **`['job-applicants', jobId]`**, **`['my-applications', memberId]`**, job lists, etc.

**Recruiter applicants (`/jobs/:jobId/applicants`)** — `RecruiterApplicantsPage.tsx`:

- **Left:** all applicants with **Review**.
- **Right:** after Review — profile link, **Invite to interview** (sets status **`shortlisted`**) / **Reject** (**`rejected`**), Easy Apply contact, **Resume** (PDF embed + open link), application answers, notes.
- **`updateApplicationStatus`** updates in-memory row in mocks + cache; pushes **targeted notification** to applicant.

### 6.9 Job posting (Hiring Pro) & activity

**Create (`/jobs/post`)** — `RecruiterJobFormPage.tsx`:

- Phased “Hiring Pro” UX: basics → description/skills → review → **`createJob`** → redirect **`/job-posting-activity`** (or stay in flow per latest product behavior).

**Edit (`/jobs/post/:jobId/edit`)** — same component with **`getJob`** preload; **`updateJob`** on save.

**Posted jobs hub (`/job-posting-activity`)** — `JobPostingActivityPage.tsx`:

- LinkedIn-style layout: **My items**, verification banner, **Posted Jobs** as **`JobListItem`** cards (same visual language as search), **Post a free job**, support card.
- Row **⋯** menu: **Edit**, **View applicants** (`/jobs/:jobId/applicants`), **Delete** (confirm modal).

### 6.10 Recruiter hub (role = recruiter)

Under **`RecruiterRouteGuard`**:

- **`/recruiter`** — dashboard (`RecruiterDashboardPage`).
- **`/recruiter/jobs`** — table manage jobs (`RecruiterJobsPage`); applicant count links to **`/jobs/:jobId/applicants`**.
- **`/recruiter/jobs/new`**, **`/recruiter/jobs/:jobId/edit`** — alternate entry to job form.
- **`/recruiter/jobs/:jobId/applicants`** — same `RecruiterApplicantsPage` as jobs shell route (legacy/alternate URL).
- **`/recruiter/ai`** — AI copilot flows (`RecruiterAiPage`).

### 6.11 Saved, analytics, help

- **`/saved`** — saved posts/jobs UI (`SavedPage`).
- **`/analytics`** — member dashboard charts; uses **`listMemberApplications`** and related analytics APIs in mocks.
- **`/help`**, **`/learning`** — help center placeholder (`HelpCenterPage`).

### 6.12 Groups, newsletters, events, company

- **`/groups`**, **`/groups/:groupId`** — community surfaces.
- **`/newsletters`** — newsletters list/UX.
- **`/events`** — events.
- **`/companies/:companyId`** — company profile.

---

## 7. Important UI primitives & patterns

- **`JobListItem`** (`src/components/jobs/JobListItem.tsx`): shared job card; props for **save**, **dismiss**, **`trailingMenu`** (e.g. owner ⋯).
- **`ConfirmModal`**: destructive confirmations (e.g. delete job post).
- **`Textarea`**: floating label fix uses **`translate-y-1/2`** on float state to avoid border clipping.
- **Cards** — `src/components/ui/Card.tsx` (`Card.Header`, `Card.Body`).

---

## 8. State & cache conventions (practical)

**TanStack Query keys** (representative; not exhaustive):

- `['threads', memberId]` — inbox list.
- `['messages', threadId]` — message list.
- `['jobs-search', keyword, location]` — search results.
- `['job', jobId]` — single job.
- `['job-applicants', jobId]` — applications by job.
- `['my-applications', memberId]` — applicant tracker source.
- `['notifications', filter, viewer_member_id]` — notification feed.
- `['recruiter-jobs-activity', memberId]` — posted jobs for activity page.

**Zustand:**

- **`authStore`** — session.
- **`profileStore`** — rich profile fields for UI/editing.
- **`savedJobsStore`** — persisted saved jobs.
- **`memberPresenceStore`** — last-seen timestamps for online UI.
- **`eventsStore`** / others as features require.

**Invalidation rule of thumb:** after mutations that change server-visible data (post job, apply, delete job, message send), invalidate the smallest set of keys that any dependent screen might read.

---

## 9. Mock vs live backend

| Concern | Mock behavior (typical) | Live behavior |
|---------|-------------------------|---------------|
| Data location | `src/lib/*Mock*`, Maps in `src/api/*.ts`, `mockData.ts` | JSON POST bodies per `docs/CONTRACT.md` |
| Latency | `mockDelay()` | Real network |
| Auth | Local credentials / demo members | JWT from `/auth/login` |
| WebSocket | May fail → polling fallback in messaging | Persistent WS |

Switching off mocks: set **`VITE_USE_MOCKS=false`**, point **`VITE_API_BASE_URL`** and **`VITE_WS_BASE_URL`** at implemented services, and ensure response shapes match **`src/types`** and API module typings.

---

## 10. Quality gates before merge

1. **`npm run typecheck`**
2. **`npm run lint`**
3. **`npm run build`**
4. Smoke paths: login → feed → job search → apply → (as poster) applicants → interview notification → (as applicant) notifications.

---

## 11. Related docs

- **`docs/CONTRACT.md`** — backend integration contract (endpoints, payloads).
- **`README.md`** — stack, scripts, high-level API list, Kafka ingest examples.

---

*Document generated for the LinkedIn Clone frontend (class project). Update this file when routes, guards, or primary flows change.*
