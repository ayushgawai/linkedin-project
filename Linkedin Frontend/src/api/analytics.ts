// ============================================
// INTEGRATION CONTRACT — Analytics Service
// ============================================
// Current mode: MOCK-FIRST (mock on VITE_USE_MOCKS=true; fallback-to-mock on request errors)
// To integrate: replace function internals with service-specific axios calls if needed.
//
// Endpoints:
//   GET  /analytics/events             → listAnalyticsEvents()
//   POST /events/ingest                → ingestEvent(payload)
//   POST /analytics/member/dashboard   → getMemberDashboard(member_id, window)
//   POST /analytics/jobs/top           → getRecruiterDashboard(window)
//   POST /analytics/funnel             → getRecruiterDashboard(window)
//   POST /analytics/geo                → getRecruiterDashboard(window)
//
// Auth: Bearer token via src/api/client.ts interceptor
// ============================================

import { USE_MOCKS, apiClient, mockDelay } from './client'
import type { AnalyticsEvent } from '../types'
import { listApplicationsByJob, listMemberApplications, type JobApplicantRow } from './applications'
import { listJobsByRecruiter } from './jobs'
import { getMockSavedJobCounts } from '../lib/mockRecruiterMetrics'
import { mapStatusToTab } from '../lib/statusUtils'
import { DIRECTORY_MEMBERS } from '../lib/profileDirectory'
import { useAuthStore } from '../store/authStore'
import { useProfileStore } from '../store/profileStore'
import { useSavedJobsStore } from '../store/savedJobsStore'

type IngestPayload = {
  event_type: string
  trace_id: string
  timestamp: string
  actor_id: string
  entity: {
    entity_type: string
    entity_id: string
  }
  idempotency_key: string
  metadata?: Record<string, unknown>
}

export type MemberDashboardWindow = '7d' | '14d' | '30d' | '90d'

type TimePoint = { date: string; value: number }
const mockIngestedEvents: IngestPayload[] = []

export type MemberDashboardResponse = {
  profile_views_per_day: TimePoint[]
  post_impressions_per_day: TimePoint[]
  search_appearances_per_week: TimePoint[]
  applications_status_breakdown: {
    submitted: number
    reviewing: number
    interview: number
    offer: number
    rejected: number
  }
  engagement_breakdown: {
    reactions: number
    comments: number
    reposts: number
    shares: number
  }
  top_skills_searched: Array<{ skill: string; count: number }>
  top_viewers: Array<{ member_id: string; full_name: string; headline: string }>
  kpis: {
    profile_views: { value: number; change_pct: number }
    post_impressions: { value: number; change_pct: number }
    search_appearances: { value: number; change_pct: number }
    application_response_rate: { value: number; change_pct: number }
  }
}

export type RecruiterDashboardResponse = {
  kpis: {
    active_jobs: number
    total_applicants: number
    avg_time_to_review_days: number
    pending_messages: number
  }
  top_jobs_by_applications: Array<{ name: string; value: number }>
  city_applications: Array<{ city: string; value: number }>
  low_performing_jobs: Array<{ name: string; value: number }>
  clicks_per_job: Array<{ name: string; value: number }>
  /** Bar chart: one bar per job posting with save count (preferred over time-series). */
  saved_jobs_by_posting: Array<{ name: string; value: number }>
  /** Legacy time series; may be empty when backend returns per-job saves only. */
  saved_jobs_trend: Array<{ date: string; value: number }>
}

function generateSeries(days: number, base: number, variance: number): TimePoint[] {
  return Array.from({ length: days }).map((_, index) => {
    const date = new Date()
    date.setDate(date.getDate() - (days - index - 1))
    return {
      date: date.toISOString(),
      value: Math.max(0, Math.round(base + Math.sin(index / 3) * variance + (index % 5) * 2)),
    }
  })
}

function daysFromWindow(window: MemberDashboardWindow): number {
  return window === '7d' ? 7 : window === '14d' ? 14 : window === '30d' ? 30 : 90
}

function changePct(current: number, previous: number): number {
  if (previous <= 0) return current > 0 ? 100 : 0
  return Number((((current - previous) / previous) * 100).toFixed(1))
}

function resolveMemberProfile(memberId: string): { full_name: string; headline: string } {
  const authUser = useAuthStore.getState().user
  const profile = useProfileStore.getState().profile
  if (authUser?.member_id === memberId) {
    const fullName = `${profile.first_name} ${profile.last_name}`.trim() || authUser.full_name || 'Member'
    return { full_name: fullName, headline: profile.headline || 'Member' }
  }
  const directory = DIRECTORY_MEMBERS.find((m) => m.member_id === memberId)
  if (directory) {
    return { full_name: directory.full_name, headline: directory.headline ?? 'Member' }
  }
  return { full_name: 'Unknown member', headline: 'Member' }
}

async function buildMockDashboard(member_id: string, window: MemberDashboardWindow): Promise<MemberDashboardResponse> {
  const now = Date.now()
  const days = daysFromWindow(window)
  const rangeMs = days * 86400000
  const startCurrent = now - rangeMs
  const startPrevious = startCurrent - rangeMs
  const events = mockIngestedEvents.filter((evt) => evt.entity.entity_id === member_id || evt.metadata?.target_member_id === member_id)
  const currentEvents = events.filter((evt) => new Date(evt.timestamp).getTime() >= startCurrent)
  const previousEvents = events.filter((evt) => {
    const ts = new Date(evt.timestamp).getTime()
    return ts >= startPrevious && ts < startCurrent
  })

  const profileViewCurrent = currentEvents.filter((evt) => evt.event_type === 'profile.viewed' && evt.entity.entity_id === member_id)
  const profileViewPrevious = previousEvents.filter((evt) => evt.event_type === 'profile.viewed' && evt.entity.entity_id === member_id)
  const searchCurrent = currentEvents.filter((evt) => evt.event_type === 'profile.searched' && evt.entity.entity_id === member_id)
  const searchPrevious = previousEvents.filter((evt) => evt.event_type === 'profile.searched' && evt.entity.entity_id === member_id)
  const engagementCurrent = currentEvents.filter(
    (evt) => evt.event_type === 'post.engagement' && evt.metadata?.target_member_id === member_id,
  )
  const engagementPrevious = previousEvents.filter(
    (evt) => evt.event_type === 'post.engagement' && evt.metadata?.target_member_id === member_id,
  )

  const likesCurrent = engagementCurrent.filter((evt) => evt.metadata?.action === 'like').length
  const commentsCurrent = engagementCurrent.filter((evt) => evt.metadata?.action === 'comment').length
  const likesPrevious = engagementPrevious.filter((evt) => evt.metadata?.action === 'like').length
  const commentsPrevious = engagementPrevious.filter((evt) => evt.metadata?.action === 'comment').length

  const viewerCountMap = new Map<string, number>()
  profileViewCurrent.forEach((evt) => {
    viewerCountMap.set(evt.actor_id, (viewerCountMap.get(evt.actor_id) ?? 0) + 1)
  })
  const top_viewers = [...viewerCountMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([viewerId]) => ({
      member_id: viewerId,
      ...resolveMemberProfile(viewerId),
    }))

  const applications = await listMemberApplications(member_id)
  const applied = applications.filter((app) => mapStatusToTab(app.status) === 'applied').length
  const interview = applications.filter((app) => mapStatusToTab(app.status) === 'interview').length
  const offer = applications.filter((app) => mapStatusToTab(app.status) === 'offer').length
  const rejected = applications.filter((app) => mapStatusToTab(app.status) === 'rejected').length
  const total = applications.length
  const responseRate = total > 0 ? Number((((interview + offer) / total) * 100).toFixed(1)) : 0

  const profileViewsValue = profileViewCurrent.length
  const postImpressionsValue = likesCurrent + commentsCurrent
  const searchAppearancesValue = searchCurrent.length
  const responsePrevious = total > 0 ? Number((((Math.max(0, interview - 1) + Math.max(0, offer - 1)) / total) * 100).toFixed(1)) : 0

  return {
    profile_views_per_day: generateSeries(Math.min(days, 30), Math.max(1, profileViewsValue), Math.max(2, Math.ceil(profileViewsValue / 4))),
    post_impressions_per_day: generateSeries(
      Math.min(days, 30),
      Math.max(1, postImpressionsValue),
      Math.max(2, Math.ceil(postImpressionsValue / 4)),
    ),
    search_appearances_per_week: generateSeries(
      Math.max(4, Math.ceil(days / 7)),
      Math.max(1, searchAppearancesValue),
      Math.max(2, Math.ceil(searchAppearancesValue / 3)),
    ),
    applications_status_breakdown: {
      submitted: applied,
      reviewing: 0,
      interview,
      offer,
      rejected,
    },
    engagement_breakdown: {
      reactions: likesCurrent,
      comments: commentsCurrent,
      reposts: 0,
      shares: 0,
    },
    top_skills_searched: [
      { skill: 'Profile search', count: searchAppearancesValue },
      { skill: 'Connections lookup', count: Math.max(0, searchAppearancesValue - 1) },
    ],
    top_viewers,
    kpis: {
      profile_views: { value: profileViewsValue, change_pct: changePct(profileViewsValue, profileViewPrevious.length) },
      post_impressions: {
        value: postImpressionsValue,
        change_pct: changePct(postImpressionsValue, likesPrevious + commentsPrevious),
      },
      search_appearances: { value: searchAppearancesValue, change_pct: changePct(searchAppearancesValue, searchPrevious.length) },
      application_response_rate: { value: responseRate, change_pct: changePct(responseRate, responsePrevious) },
    },
  }
}

function withinRecruiterWindow(iso: string, window: MemberDashboardWindow): boolean {
  const ms = new Date(iso).getTime()
  if (!Number.isFinite(ms)) return false
  const days = daysFromWindow(window)
  return ms >= Date.now() - days * 86_400_000
}

function extractApplicantLocation(row: JobApplicantRow): string | null {
  let answers: Record<string, unknown> | null = null
  const rawAnswers = row.answers
  if (rawAnswers && typeof rawAnswers === 'object' && !Array.isArray(rawAnswers)) {
    answers = rawAnswers as Record<string, unknown>
  } else if (row.cover_letter?.trim()) {
    try {
      const p = JSON.parse(row.cover_letter) as unknown
      if (p && typeof p === 'object' && !Array.isArray(p)) answers = p as Record<string, unknown>
    } catch {
      /* ignore */
    }
  }
  const loc = answers?.location
  if (typeof loc === 'string' && loc.trim()) return loc.trim()
  return null
}

async function buildMockRecruiterDashboard(recruiterId: string, window: MemberDashboardWindow): Promise<RecruiterDashboardResponse> {
  const empty: RecruiterDashboardResponse = {
    kpis: { active_jobs: 0, total_applicants: 0, avg_time_to_review_days: 0, pending_messages: 0 },
    top_jobs_by_applications: [],
    city_applications: [],
    low_performing_jobs: [],
    clicks_per_job: [],
    saved_jobs_by_posting: [],
    saved_jobs_trend: [],
  }
  if (!recruiterId.trim()) return empty

  const jobs = await listJobsByRecruiter(recruiterId, { page: 1, page_size: 200 })
  if (jobs.length === 0) return empty

  const jobIds = new Set(jobs.map((j) => j.job_id))
  const cityMap = new Map<string, number>()
  const appsPerJob: Array<{ job_id: string; title: string; count: number }> = []

  for (const job of jobs) {
    const rows = await listApplicationsByJob(job.job_id)
    const inWindow = rows.filter((r) => withinRecruiterWindow(r.applied_at, window))
    appsPerJob.push({ job_id: job.job_id, title: job.title, count: inWindow.length })
    for (const app of inWindow) {
      const raw = extractApplicantLocation(app)
      if (raw) {
        const label = raw.split(',')[0]?.trim() || raw
        if (label) cityMap.set(label, (cityMap.get(label) ?? 0) + 1)
      }
    }
  }

  const topSorted = [...appsPerJob].sort((a, b) => b.count - a.count)
  const top_jobs_by_applications = topSorted.slice(0, 10).map((j) => ({ name: j.title, value: j.count }))

  const lowSorted = [...appsPerJob].sort((a, b) => a.count - b.count)
  const low_performing_jobs = lowSorted.slice(0, 5).map((j) => ({ name: j.title, value: j.count }))

  const clicks_per_job = jobs.map((j) => ({ name: j.title, value: j.views_count ?? 0 }))

  const openJobs = jobs.filter((j) => j.promoted || j.easy_apply)
  const kpis = {
    active_jobs: openJobs.length,
    total_applicants: appsPerJob.reduce((s, j) => s + j.count, 0),
    avg_time_to_review_days: 0,
    pending_messages: 0,
  }

  const city_applications = [...cityMap.entries()]
    .map(([city, value]) => ({ city, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 20)

  const mockSaved = getMockSavedJobCounts()
  const fromStore = new Map<string, number>()
  for (const e of useSavedJobsStore.getState().entries) {
    if (jobIds.has(e.job.job_id)) fromStore.set(e.job.job_id, 1)
  }
  const saved_jobs_by_posting = jobs
    .map((j) => ({
      name: j.title,
      value: Math.max(mockSaved.get(j.job_id) ?? 0, fromStore.get(j.job_id) ?? 0),
    }))
    .filter((x) => x.value > 0)
    .sort((a, b) => b.value - a.value)

  return {
    kpis,
    top_jobs_by_applications,
    city_applications,
    low_performing_jobs,
    clicks_per_job,
    saved_jobs_by_posting,
    saved_jobs_trend: [],
  }
}

export async function listAnalyticsEvents(): Promise<AnalyticsEvent[]> {
  if (USE_MOCKS) {
    await mockDelay(220)
    return mockIngestedEvents.map((evt, index) => ({
      event_id: `evt-${index + 1}`,
      member_id: evt.actor_id,
      event_type: evt.event_type,
      event_source: 'web',
      entity_id: evt.entity.entity_id,
      metadata: evt.metadata ?? {},
      occurred_at: evt.timestamp,
    }))
  }
  const response = await apiClient.get<AnalyticsEvent[]>('/analytics/events')
  return response.data
}

export async function ingestEvent(payload: IngestPayload): Promise<{ success: boolean }> {
  if (USE_MOCKS) {
    await mockDelay(140)
    mockIngestedEvents.push(payload)
    console.debug('[mock] ingest event', payload.event_type, payload.trace_id)
    return { success: true }
  }
  const response = await apiClient.post<{ success: boolean }>('/events/ingest', payload)
  return response.data
}

export async function getMemberDashboard(member_id: string, window: MemberDashboardWindow): Promise<MemberDashboardResponse> {
  if (USE_MOCKS) {
    await mockDelay(260)
    return buildMockDashboard(member_id, window)
  }
  const response = await apiClient.post<MemberDashboardResponse>('/analytics/member/dashboard', { member_id, window })
  return response.data
}

export async function getRecruiterDashboard(window: MemberDashboardWindow): Promise<RecruiterDashboardResponse> {
  const recruiterId = useAuthStore.getState().user?.recruiter_id || useAuthStore.getState().user?.member_id || ''
  if (USE_MOCKS) {
    await mockDelay(180)
    return buildMockRecruiterDashboard(recruiterId, window)
  }
  const body = { window, recruiter_id: recruiterId }
  const [top, funnel, geo] = await Promise.all([
    apiClient.post<{
      top_jobs_by_applications: RecruiterDashboardResponse['top_jobs_by_applications']
      clicks_per_job: RecruiterDashboardResponse['clicks_per_job']
      saved_jobs_trend: RecruiterDashboardResponse['saved_jobs_trend']
      saved_jobs_by_posting?: RecruiterDashboardResponse['saved_jobs_by_posting']
      kpis: RecruiterDashboardResponse['kpis']
    }>('/analytics/jobs/top', body),
    apiClient.post<{ low_performing_jobs: RecruiterDashboardResponse['low_performing_jobs'] }>('/analytics/funnel', body),
    apiClient.post<{ city_applications: RecruiterDashboardResponse['city_applications'] }>('/analytics/geo', body),
  ])

  return {
    kpis: top.data.kpis,
    top_jobs_by_applications: top.data.top_jobs_by_applications,
    city_applications: geo.data.city_applications,
    low_performing_jobs: funnel.data.low_performing_jobs,
    clicks_per_job: top.data.clicks_per_job,
    saved_jobs_by_posting: top.data.saved_jobs_by_posting ?? [],
    saved_jobs_trend: top.data.saved_jobs_trend ?? [],
  }
}
