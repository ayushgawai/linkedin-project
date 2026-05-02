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

import { MOCK_NOTIFICATIONS } from '../lib/mockData'
import { USE_MOCKS, apiClient, mockDelay } from './client'
import type { NotificationFilter, NotificationRecord, NotificationsResponse } from '../types/notifications'

/** Outcome pushes (interview/rejected) sync across tabs via localStorage so the candidate account can see them. */
export const OUTCOME_NOTIFICATIONS_STORAGE_KEY = 'linkedin-clone-outcome-notifications-v1'

/** Fired after a new outcome notification is stored (same tab); other tabs get `storage` on the key above. */
export const OUTCOME_NOTIFICATION_EVENT = 'linkedin-outcome-notification'

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
  if (!USE_MOCKS) {
    try {
      const body: ListNotificationsParams = { ...params }
      delete body.viewer_member_id
      const response = await apiClient.post<NotificationsResponse>('/notifications/list', body)
      const remote = Array.isArray(response.data?.notifications) ? response.data.notifications : []
      const merged = [...localSource, ...remote]
      const seen = new Set<string>()
      const deduped = merged.filter((item) => {
        if (seen.has(item.notification_id)) return false
        seen.add(item.notification_id)
        return true
      })
      const start = (params.page - 1) * params.pageSize
      const end = start + params.pageSize
      return {
        notifications: deduped.slice(start, end),
        page: params.page,
        has_more: end < deduped.length,
      }
    } catch {
      // No real notifications service in this repo; fall back to local notifications
      // so interview/rejection updates are still visible in integrated mode.
    }
  }
  await mockDelay(300)
  const start = (params.page - 1) * params.pageSize
  const end = start + params.pageSize

  return {
    notifications: localSource.slice(start, end),
    page: params.page,
    has_more: end < localSource.length,
  }
}

/** Mock: notify the applicant when a recruiter moves them to interview or rejects them. */
export function pushMockApplicationOutcomeNotification(input: {
  recipient_member_id: string
  job_id: string
  job_title: string
  company_name: string
  kind: 'interview' | 'rejected'
}): void {
  const record: NotificationRecord = {
    notification_id: `notif-app-${input.recipient_member_id}-${Date.now()}`,
    type: 'application_status',
    actor_name: input.company_name,
    title: input.kind === 'interview' ? 'Interview invitation' : 'Application update',
    preview:
      input.kind === 'interview'
        ? `${input.company_name} invited you to interview for ${input.job_title}. Please accept or decline this invitation.`
        : `Unfortunately, you were not selected for ${input.job_title} at ${input.company_name}.`,
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
