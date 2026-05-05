// ============================================
// INTEGRATION CONTRACT — Notifications Service
// ============================================
// Current mode: MOCK-FIRST (returns local notification list)
// To integrate: preserve signatures and replace API internals.
//
// Endpoints (proposed):
//   POST /notifications/list   → listNotifications(params)
//
// Auth: Bearer token via src/api/client.ts interceptor
// ============================================

import { formatDistanceToNow } from 'date-fns'
import { MOCK_NOTIFICATIONS } from '../lib/mockData'
import { listMemberApplications } from './applications'
import { listPendingInvitations } from './connections'
import { listJobs } from './jobs'
import { listThreadsByUser } from './messaging'
import { fetchPostActivityNotifications, type PostActivityNotificationRow } from './posts'
import { USE_MOCKS, apiClient, mockDelay, unwrapApiData } from './client'
import type { MemberApplication } from '../types/tracker'
import type { ThreadListItem } from '../types/messaging'
import type { NotificationFilter, NotificationRecord, NotificationsResponse } from '../types/notifications'

/** Outcome pushes (interview/rejected) sync across tabs via localStorage so the candidate account can see them. */
export const OUTCOME_NOTIFICATIONS_STORAGE_KEY = 'linkedin-clone-outcome-notifications-v1'

/** Fired after a new outcome notification is stored (same tab); other tabs get `storage` on the key above. */
export const OUTCOME_NOTIFICATION_EVENT = 'linkedin-outcome-notification'
const NOTIFICATION_STATE_STORAGE_KEY = 'linkedin-clone-notification-state-v1'

type NotificationLocalState = {
  dismissed_by_member: Record<string, string[]>
  muted_types_by_member: Record<string, NotificationRecord['type'][]>
}

function isPersistedNotificationRecord(v: unknown): v is NotificationRecord {
  if (!v || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  return (
    typeof o.notification_id === 'string' &&
    typeof o.type === 'string' &&
    typeof o.title === 'string' &&
    typeof o.preview === 'string' &&
    typeof o.timestamp === 'string' &&
    typeof o.unread === 'boolean' &&
    typeof o.target_url === 'string'
  )
}

function readPersistedOutcomeNotifications(): NotificationRecord[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(OUTCOME_NOTIFICATIONS_STORAGE_KEY)
    if (!raw?.trim()) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isPersistedNotificationRecord)
  } catch {
    return []
  }
}

function readNotificationLocalState(): NotificationLocalState {
  if (typeof window === 'undefined') {
    return { dismissed_by_member: {}, muted_types_by_member: {} }
  }
  try {
    const raw = window.localStorage.getItem(NOTIFICATION_STATE_STORAGE_KEY)
    if (!raw?.trim()) return { dismissed_by_member: {}, muted_types_by_member: {} }
    const parsed = JSON.parse(raw) as Partial<NotificationLocalState>
    return {
      dismissed_by_member:
        parsed.dismissed_by_member && typeof parsed.dismissed_by_member === 'object'
          ? parsed.dismissed_by_member
          : {},
      muted_types_by_member:
        parsed.muted_types_by_member && typeof parsed.muted_types_by_member === 'object'
          ? parsed.muted_types_by_member
          : {},
    }
  } catch {
    return { dismissed_by_member: {}, muted_types_by_member: {} }
  }
}

function writeNotificationLocalState(next: NotificationLocalState): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(NOTIFICATION_STATE_STORAGE_KEY, JSON.stringify(next))
  } catch {
    /* storage full or disabled */
  }
}

function normalizeViewerId(viewerMemberId?: string): string {
  return viewerMemberId?.trim() || '__anon__'
}

function dismissNotificationForViewer(notificationId: string, viewerMemberId?: string): void {
  const key = normalizeViewerId(viewerMemberId)
  const state = readNotificationLocalState()
  const current = new Set(state.dismissed_by_member[key] ?? [])
  current.add(notificationId)
  state.dismissed_by_member[key] = Array.from(current).slice(-500)
  writeNotificationLocalState(state)
}

function notificationsForViewerAfterLocalState(
  rows: NotificationRecord[],
  viewerMemberId?: string,
): NotificationRecord[] {
  const key = normalizeViewerId(viewerMemberId)
  const state = readNotificationLocalState()
  const dismissed = new Set(state.dismissed_by_member[key] ?? [])
  const mutedTypes = new Set(state.muted_types_by_member[key] ?? [])
  return rows.filter((n) => !dismissed.has(n.notification_id) && !mutedTypes.has(n.type))
}

function persistOutcomeNotification(record: NotificationRecord): void {
  if (typeof window === 'undefined') return
  try {
    const prev = readPersistedOutcomeNotifications()
    const next = [record, ...prev.filter((r) => r.notification_id !== record.notification_id)].slice(0, 150)
    window.localStorage.setItem(OUTCOME_NOTIFICATIONS_STORAGE_KEY, JSON.stringify(next))
  } catch {
    /* storage full or disabled */
  }
}

function mergeLocalNotificationSources(): NotificationRecord[] {
  const persisted = readPersistedOutcomeNotifications()
  const seen = new Set<string>()
  const out: NotificationRecord[] = []
  for (const item of [...persisted, ...MOCK_NOTIFICATIONS]) {
    if (seen.has(item.notification_id)) continue
    seen.add(item.notification_id)
    out.push(item)
  }
  return out
}

function matchesFilter(type: string, filter: NotificationFilter): boolean {
  if (filter === 'all') return true
  if (filter === 'jobs') return type === 'job_recommendation' || type === 'application_status'
  if (filter === 'my_posts') return type === 'post_comment' || type === 'post_reaction'
  if (filter === 'mentions') return type === 'post_comment' || type === 'message'
  return true
}

function inviteTimestampLabel(created_at: string): string {
  try {
    return formatDistanceToNow(new Date(created_at), { addSuffix: true })
  } catch {
    return 'Recently'
  }
}

/** Maps pending connection invites into notification rows (same source as My Network → Invitations). */
async function connectionInvitesAsNotifications(viewerMemberId: string): Promise<NotificationRecord[]> {
  try {
    const invitations = await listPendingInvitations(viewerMemberId)
    return invitations.map((inv) => ({
      notification_id: `conn-req-${inv.request_id}`,
      type: 'connection_request',
      actor_name: inv.name,
      actor_avatar_url: null,
      title: inv.name,
      preview: `${inv.headline} · ${inv.mutual} mutual connection${inv.mutual === 1 ? '' : 's'}`,
      timestamp: inviteTimestampLabel(inv.created_at),
      unread: true,
      target_url: `/in/${inv.requester_member_id}`,
      connection_request_id: inv.request_id,
      connection_requester_member_id: inv.requester_member_id,
      recipient_member_id: viewerMemberId,
    }))
  } catch {
    return []
  }
}

function ellipsizeText(s: string, max: number): string {
  const t = s.replace(/\s+/g, ' ').trim()
  if (t.length <= max) return t
  return `${t.slice(0, max).trim()}…`
}

function postActivityRowToNotification(row: PostActivityNotificationRow, viewer: string): NotificationRecord {
  const who = row.actor_name?.trim() || 'Someone'
  const snippet = ellipsizeText(row.post_snippet || '', 100)
  const ts = formatDistanceToNow(new Date(row.created_at), { addSuffix: true })
  if (row.kind === 'post_like') {
    return {
      notification_id: `feed-like-${row.dedupe_id}`,
      type: 'post_reaction',
      actor_name: who,
      title: `${who} liked your post`,
      preview: snippet ? `About: “${snippet}”` : 'Someone reacted to your post.',
      timestamp: ts,
      unread: true,
      target_url: `/feed?highlight=${encodeURIComponent(row.post_id)}`,
      recipient_member_id: viewer,
    }
  }
  const comment = ellipsizeText(row.comment_preview || '', 160)
  return {
    notification_id: `feed-comment-${row.dedupe_id}`,
    type: 'post_comment',
    actor_name: who,
    title: `${who} commented on your post`,
    preview: comment ? `“${comment}”${snippet ? ` · Post: “${snippet}”` : ''}` : snippet ? `On: “${snippet}”` : 'New comment on your post.',
    timestamp: ts,
    unread: true,
    target_url: `/feed?highlight=${encodeURIComponent(row.post_id)}`,
    recipient_member_id: viewer,
  }
}

function applicationPipelineNotifications(apps: MemberApplication[], viewer: string): NotificationRecord[] {
  const out: NotificationRecord[] = []
  for (const app of apps) {
    if (app.member_id && app.member_id !== viewer) continue
    const jobTitle = app.job?.title ?? 'this role'
    const company = app.job?.company_name ?? 'The hiring team'
    const ts = formatDistanceToNow(new Date(app.updated_at || app.applied_at), { addSuffix: true })
    const base = {
      actor_name: company,
      recipient_member_id: viewer,
      target_url: `/jobs/${app.job_id}`,
    }
    const st = app.status as string
    if (st === 'interview' || st === 'shortlisted') {
      out.push({
        notification_id: `app-status-${app.application_id}-interview`,
        type: 'application_status',
        ...base,
        title: `Your application for ${jobTitle} moved to Interview`,
        preview: 'Tap to view status details',
        timestamp: ts,
        unread: true,
        interview_invite: true,
      })
    } else if (app.status === 'rejected') {
      out.push({
        notification_id: `app-status-${app.application_id}-rejected`,
        type: 'application_status',
        ...base,
        title: `Your application for ${jobTitle} was not selected`,
        preview: `Tap to view status details · ${company}`,
        timestamp: ts,
        unread: true,
        interview_invite: false,
      })
    } else if (app.status === 'offer') {
      out.push({
        notification_id: `app-status-${app.application_id}-offer`,
        type: 'application_status',
        ...base,
        title: `Your application for ${jobTitle} moved forward`,
        preview: `${company} shared a positive update. Tap to view status details.`,
        timestamp: ts,
        unread: true,
        interview_invite: false,
      })
    } else if (st === 'under_review') {
      out.push({
        notification_id: `app-status-${app.application_id}-review`,
        type: 'application_status',
        ...base,
        title: `Your application for ${jobTitle} is under review`,
        preview: `${company} is reviewing your application. Tap to view status details.`,
        timestamp: ts,
        unread: true,
        interview_invite: false,
      })
    }
  }
  return out
}

/** Open roles from job search, excluding jobs you already applied to — shows under Jobs + All. */
async function jobMatchNotificationsFromListings(viewer: string, apps: MemberApplication[]): Promise<NotificationRecord[]> {
  try {
    const appliedIds = new Set(apps.map((a) => a.job_id).filter(Boolean))
    const { jobs } = await listJobs({ page: 1, pageSize: 30 })
    return jobs
      .filter((j) => j.job_id && !appliedIds.has(j.job_id))
      .slice(0, 15)
      .map((job) => {
        const posted = job.posted_time_ago?.trim() || 'Recently'
        const postedLine = /ago$/i.test(posted) || posted === 'Just now' || posted === 'Recently' ? posted : `${posted} ago`
        return {
          notification_id: `job-rec-${job.job_id}`,
          type: 'job_recommendation' as const,
          actor_name: job.company_name,
          title: `New ${job.title} role at ${job.company_name} matches your profile`,
          preview: `Posted ${postedLine}${job.easy_apply ? ' · Easy Apply' : ''}`,
          timestamp: postedLine,
          unread: true,
          target_url: `/jobs/${job.job_id}`,
          recipient_member_id: viewer,
        }
      })
  } catch {
    return []
  }
}

function messageInboxNotifications(threads: ThreadListItem[], viewer: string): NotificationRecord[] {
  return threads
    .filter((t) => (t.unread_count ?? 0) > 0)
    .map((t) => ({
      notification_id: `msg-unread-${t.thread_id}`,
      type: 'message' as const,
      actor_name: t.participant.full_name,
      actor_avatar_url: t.participant.profile_photo_url ?? null,
      title: t.participant.full_name,
      preview: t.last_message_preview || 'Sent you a message',
      timestamp: t.last_message_time || 'Recent',
      unread: true,
      target_url: `/messaging/${t.thread_id}`,
      recipient_member_id: viewer,
    }))
}

/** Feed reactions, job matches, application pipeline, and unread DMs — merged into the notifications list. */
async function loadActivityNotificationsRaw(viewer: string): Promise<NotificationRecord[]> {
  const [postRows, apps, threads] = await Promise.all([
    USE_MOCKS
      ? Promise.resolve([] as PostActivityNotificationRow[])
      : fetchPostActivityNotifications(viewer)
          .then((rows) => rows)
          .catch(() => [] as PostActivityNotificationRow[]),
    listMemberApplications(viewer).catch(() => [] as MemberApplication[]),
    listThreadsByUser(viewer).catch(() => [] as ThreadListItem[]),
  ])
  const postNotifs = postRows.map((r) => postActivityRowToNotification(r, viewer))
  const appNotifs = applicationPipelineNotifications(apps, viewer)
  const jobNotifs = await jobMatchNotificationsFromListings(viewer, apps)
  const msgNotifs = messageInboxNotifications(threads, viewer)
  return [...jobNotifs, ...appNotifs, ...postNotifs, ...msgNotifs]
}

export type ListNotificationsParams = {
  page: number
  pageSize: number
  filter: NotificationFilter
  /** Current viewer; when set in mocks, hides targeted notifications meant for other members. */
  viewer_member_id?: string
}

export async function listNotifications(params: ListNotificationsParams): Promise<NotificationsResponse> {
  const viewer = params.viewer_member_id
  const localSource = mergeLocalNotificationSources().filter(
    (item) =>
      matchesFilter(item.type, params.filter) &&
      (!viewer || !item.recipient_member_id || item.recipient_member_id === viewer),
  )
  const inviteNotifications =
    viewer && matchesFilter('connection_request', params.filter) ? await connectionInvitesAsNotifications(viewer) : []

  let activityNotifications: NotificationRecord[] = []
  if (viewer) {
    const rawActivity = await loadActivityNotificationsRaw(viewer)
    activityNotifications = rawActivity.filter(
      (item) =>
        matchesFilter(item.type, params.filter) && (!item.recipient_member_id || item.recipient_member_id === viewer),
    )
  }

  if (!USE_MOCKS) {
    try {
      const body: ListNotificationsParams = { ...params }
      delete body.viewer_member_id
      const response = await apiClient.post<unknown>('/notifications/list', body)
      const unpacked = unwrapApiData<NotificationsResponse>(response.data)
      const remote = Array.isArray(unpacked?.notifications) ? unpacked.notifications : []
      const merged = [...inviteNotifications, ...activityNotifications, ...localSource, ...remote]
      const seen = new Set<string>()
      const deduped = merged.filter((item) => {
        if (seen.has(item.notification_id)) return false
        seen.add(item.notification_id)
        return true
      })
      const effective = notificationsForViewerAfterLocalState(deduped, viewer)
      const start = (params.page - 1) * params.pageSize
      const end = start + params.pageSize
      return {
        notifications: effective.slice(start, end),
        page: params.page,
        has_more: end < effective.length,
      }
    } catch {
      // No real notifications service in this repo; fall back to local notifications
      // so interview/rejection updates are still visible in integrated mode.
    }
    const mergedFallback = [...inviteNotifications, ...activityNotifications, ...localSource]
    const effectiveFallback = notificationsForViewerAfterLocalState(mergedFallback, viewer)
    const start = (params.page - 1) * params.pageSize
    const end = start + params.pageSize
    return {
      notifications: effectiveFallback.slice(start, end),
      page: params.page,
      has_more: end < effectiveFallback.length,
    }
  }
  await mockDelay(300)
  const mergedMock = [...inviteNotifications, ...activityNotifications, ...localSource]
  const effectiveMock = notificationsForViewerAfterLocalState(mergedMock, viewer)
  const start = (params.page - 1) * params.pageSize
  const end = start + params.pageSize

  return {
    notifications: effectiveMock.slice(start, end),
    page: params.page,
    has_more: end < effectiveMock.length,
  }
}

/** Dismiss one notification for current viewer (used by Delete and open/read UX). */
export async function dismissNotification(notificationId: string, viewerMemberId?: string): Promise<void> {
  dismissNotificationForViewer(notificationId, viewerMemberId)
}

/** Dismiss when opened so viewed notifications no longer show in the list. */
export async function markNotificationViewed(notificationId: string, viewerMemberId?: string): Promise<void> {
  dismissNotificationForViewer(notificationId, viewerMemberId)
}

/** Mute a notification type for current viewer (best-effort local preference). */
export async function muteNotificationType(
  type: NotificationRecord['type'],
  viewerMemberId?: string,
): Promise<void> {
  const key = normalizeViewerId(viewerMemberId)
  const state = readNotificationLocalState()
  const muted = new Set(state.muted_types_by_member[key] ?? [])
  muted.add(type)
  state.muted_types_by_member[key] = Array.from(muted)
  writeNotificationLocalState(state)
}

/** Mock: notify the applicant when a recruiter moves them to interview, offer, or rejects them. */
export function pushMockApplicationOutcomeNotification(input: {
  recipient_member_id: string
  job_id: string
  job_title: string
  company_name: string
  kind: 'interview' | 'offer' | 'rejected'
}): void {
  const record: NotificationRecord = {
    notification_id: `notif-app-${input.recipient_member_id}-${Date.now()}`,
    type: 'application_status',
    actor_name: input.company_name,
    title:
      input.kind === 'interview'
        ? `Your application for ${input.job_title} moved to Interview`
        : input.kind === 'offer'
          ? `Your application for ${input.job_title} moved forward`
          : `Your application for ${input.job_title} was not selected`,
    preview:
      input.kind === 'interview'
        ? 'Tap to view status details'
        : input.kind === 'offer'
          ? `${input.company_name} shared a positive update. Tap to view status details.`
          : `Tap to view status details · ${input.company_name}`,
    timestamp: 'Just now',
    unread: true,
    target_url: `/jobs/${input.job_id}`,
    recipient_member_id: input.recipient_member_id,
    interview_invite: input.kind === 'interview',
  }
  MOCK_NOTIFICATIONS.unshift(record)
  persistOutcomeNotification(record)
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(OUTCOME_NOTIFICATION_EVENT))
  }
}
