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
import { listMemberApplications } from './applications'
import { mapStatusToTab } from '../lib/statusUtils'
import { DIRECTORY_MEMBERS } from '../lib/profileDirectory'
import { useAuthStore } from '../store/authStore'
import { useProfileStore } from '../store/profileStore'

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

function mockRecruiter(): RecruiterDashboardResponse {
  return {
    kpis: { active_jobs: 12, total_applicants: 238, avg_time_to_review_days: 3.4, pending_messages: 14 },
    top_jobs_by_applications: Array.from({ length: 10 }).map((_, i) => ({ name: `Role ${i + 1}`, value: 90 - i * 6 })),
    city_applications: [
      { city: 'San Jose', value: 64 },
      { city: 'San Francisco', value: 52 },
      { city: 'Austin', value: 31 },
      { city: 'New York', value: 29 },
    ],
    low_performing_jobs: [
      { name: 'QA Lead', value: 4 },
      { name: 'Ops Analyst', value: 5 },
      { name: 'Support Engineer', value: 6 },
      { name: 'Data QA', value: 7 },
      { name: 'UX Writer', value: 8 },
    ],
    clicks_per_job: Array.from({ length: 8 }).map((_, i) => ({ name: `Job ${i + 1}`, value: 22 + i * 5 })),
    saved_jobs_trend: generateSeries(10, 14, 6),
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
  if (USE_MOCKS) {
    await mockDelay(260)
    return mockRecruiter()
  }
  const [top, funnel, geo] = await Promise.all([
    apiClient.post<{ top_jobs_by_applications: RecruiterDashboardResponse['top_jobs_by_applications']; clicks_per_job: RecruiterDashboardResponse['clicks_per_job']; saved_jobs_trend: RecruiterDashboardResponse['saved_jobs_trend']; kpis: RecruiterDashboardResponse['kpis'] }>('/analytics/jobs/top', { window }),
    apiClient.post<{ low_performing_jobs: RecruiterDashboardResponse['low_performing_jobs'] }>('/analytics/funnel', { window }),
    apiClient.post<{ city_applications: RecruiterDashboardResponse['city_applications'] }>('/analytics/geo', { window }),
  ])

  return {
    kpis: top.data.kpis,
    top_jobs_by_applications: top.data.top_jobs_by_applications,
    city_applications: geo.data.city_applications,
    low_performing_jobs: funnel.data.low_performing_jobs,
    clicks_per_job: top.data.clicks_per_job,
    saved_jobs_trend: top.data.saved_jobs_trend,
  }
}
