// ============================================
// INTEGRATION CONTRACT — Messaging Service
// ============================================
// Current mode: MOCK (threads with connections + any 1:1 rows in memory, e.g. non-connections / InMail-style)
// To integrate: keep signatures and swap API internals if endpoint contracts change.
//
// Endpoints:
//   POST /threads/open       → openThread(participant_ids)
//   POST /threads/get        → getThread(thread_id)
//   POST /threads/byUser     → listThreadsByUser(user_id)
//   POST /messages/list      → listMessages(thread_id, pagination)
//   POST /messages/send      → sendMessage(...)
//
// Auth: Bearer token via src/api/client.ts interceptor
// ============================================

import { USE_MOCKS, apiClient, mockDelay } from './client'
import { listConnections } from './connections'
import { getMember } from './profile'
import type { MessageRecord, MessagesListResponse, ThreadListItem } from '../types/messaging'
import { MOCK_MESSAGES_BY_THREAD, MOCK_THREADS } from '../lib/messagingMockData'
import { DIRECTORY_MEMBERS } from '../lib/profileDirectory'
import { seedDemoData } from '../lib/mockData'
import { useAuthStore } from '../store/authStore'

type ThreadRow = {
  thread_id: string
  user_a: string
  user_b: string
  messages: MessageRecord[]
  /** per-user unread count */
  unreadByUser: Record<string, number>
  lastMessageAt: string
}

const mockThreadRows = new Map<string, ThreadRow>()
const mockDeletedThreadIdsByUser = new Map<string, Set<string>>()
const mockStarredThreadIdsByUser = new Map<string, Set<string>>()

function pairKey(a: string, b: string): string {
  const [x, y] = [a, b].sort()
  return `${x}__${y}`
}

export function threadIdForPair(userA: string, userB: string): string {
  return `dm-${pairKey(userA, userB)}`
}

function otherParticipant(row: ThreadRow, viewerId: string): string {
  return row.user_a === viewerId ? row.user_b : row.user_a
}

function formatShortAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 60_000) return 'now'
  const m = Math.floor(ms / 60_000)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  const d = Math.floor(h / 24)
  return `${d}d`
}

function ensureUnreadKeys(row: ThreadRow, a: string, b: string): void {
  if (row.unreadByUser[a] === undefined) row.unreadByUser[a] = 0
  if (row.unreadByUser[b] === undefined) row.unreadByUser[b] = 0
}

function ensureThreadRow(userA: string, userB: string): ThreadRow {
  const tid = threadIdForPair(userA, userB)
  let row = mockThreadRows.get(tid)
  if (!row) {
    row = {
      thread_id: tid,
      user_a: userA,
      user_b: userB,
      messages: [],
      unreadByUser: { [userA]: 0, [userB]: 0 },
      lastMessageAt: new Date(0).toISOString(),
    }
    mockThreadRows.set(tid, row)
  } else {
    ensureUnreadKeys(row, userA, userB)
  }
  return row
}

function unhideThreadEverywhere(threadId: string): void {
  mockDeletedThreadIdsByUser.forEach((set) => {
    set.delete(threadId)
  })
}

/** One-time demo inbound so the "Other" (non-connection) tab is not empty in mock mode. */
async function ensureDemoNonConnectionThread(user_id: string, connectionPeerIds: Set<string>): Promise<void> {
  const hasNonConnectionThread = Array.from(mockThreadRows.values()).some((row) => {
    if (row.user_a !== user_id && row.user_b !== user_id) return false
    const other = otherParticipant(row, user_id)
    return !connectionPeerIds.has(other)
  })
  if (hasNonConnectionThread) return

  const merged = [...DIRECTORY_MEMBERS, ...seedDemoData().members]
  const pick = merged.find(
    (m) => m.member_id && m.member_id !== user_id && !connectionPeerIds.has(m.member_id),
  )
  if (!pick) return

  const [a, b] = [user_id, pick.member_id].sort((x, y) => x.localeCompare(y))
  const row = ensureThreadRow(a, b)
  if (row.messages.length > 0) return

  const inbound: MessageRecord = {
    message_id: `msg-inmail-${Date.now()}`,
    thread_id: row.thread_id,
    sender_id: pick.member_id,
    sender_name: pick.full_name,
    text: 'Hi — I came across your profile and wanted to introduce myself.',
    sent_at: new Date().toISOString(),
    status: 'delivered',
  }
  row.messages.push(inbound)
  row.lastMessageAt = inbound.sent_at
  ensureUnreadKeys(row, row.user_a, row.user_b)
  row.unreadByUser[user_id] = (row.unreadByUser[user_id] ?? 0) + 1
}

function threadPreviewFromMessage(m: MessageRecord | undefined): string {
  if (!m) return 'No messages yet'
  const t = (m.text ?? '').trim()
  const bits: string[] = []
  if (m.image_url) bits.push('📷 Photo')
  if (m.attachment_url && m.attachment_filename) bits.push(`📎 ${m.attachment_filename}`)
  if (t) bits.push(t.length > 48 ? `${t.slice(0, 48)}…` : t)
  if (bits.length === 0) return 'Message'
  return bits.join(' · ')
}

async function buildThreadListItemForViewer(viewerId: string, otherId: string): Promise<ThreadListItem | null> {
  const tid = threadIdForPair(viewerId, otherId)
  const deleted = mockDeletedThreadIdsByUser.get(viewerId)
  if (deleted?.has(tid)) return null

  const row = ensureThreadRow(viewerId, otherId)
  const member = await getMember(otherId)
  const starred = mockStarredThreadIdsByUser.get(viewerId)?.has(tid) ?? false
  const last = row.messages[row.messages.length - 1]
  const unread = row.unreadByUser[viewerId] ?? 0

  return {
    thread_id: tid,
    participant: {
      member_id: otherId,
      full_name: member.full_name,
      headline: member.headline ?? '',
      profile_photo_url: member.profile_photo_url ?? null,
      online: false,
    },
    last_message_preview: threadPreviewFromMessage(last),
    last_message_time: last ? formatShortAgo(last.sent_at) : '',
    unread_count: unread,
    starred,
  }
}

export async function openThread(participant_ids: string[]): Promise<{ thread_id: string }> {
  if (USE_MOCKS) {
    await mockDelay()
    const ids = [...new Set(participant_ids.filter(Boolean))]
    if (ids.length !== 2) {
      return Promise.reject({ status: 400, message: 'Exactly two participants required' })
    }
    const [a, b] = [ids[0], ids[1]].sort((x, y) => x.localeCompare(y))
    const tid = threadIdForPair(ids[0], ids[1])
    unhideThreadEverywhere(tid)
    ensureThreadRow(a, b)
    return { thread_id: tid }
  }
  const response = await apiClient.post<{ thread_id: string }>('/threads/open', { participant_ids })
  return response.data
}

export async function getThread(thread_id: string): Promise<ThreadListItem> {
  if (USE_MOCKS) {
    await mockDelay()
    const row = mockThreadRows.get(thread_id)
    if (!row) {
      return MOCK_THREADS.find((thread) => thread.thread_id === thread_id) ?? MOCK_THREADS[0]
    }
    const viewerId = useAuthStore.getState().user?.member_id
    const viewer =
      viewerId && (viewerId === row.user_a || viewerId === row.user_b) ? viewerId : row.user_a
    const other = otherParticipant(row, viewer)
    return (await buildThreadListItemForViewer(viewer, other)) ?? MOCK_THREADS[0]
  }
  const response = await apiClient.post<ThreadListItem>('/threads/get', { thread_id })
  return response.data
}

export async function listThreadsByUser(user_id: string): Promise<ThreadListItem[]> {
  if (USE_MOCKS) {
    await mockDelay()
    const connections = await listConnections(user_id)
    const connectionPeerIds = new Set<string>()
    for (const c of connections) {
      if (c.status !== 'accepted') continue
      const otherId = c.addressee_member_id === user_id ? c.requester_member_id : c.addressee_member_id
      connectionPeerIds.add(otherId)
    }

    await ensureDemoNonConnectionThread(user_id, connectionPeerIds)

    const items: ThreadListItem[] = []
    const seenThreadIds = new Set<string>()

    for (const otherId of connectionPeerIds) {
      const built = await buildThreadListItemForViewer(user_id, otherId)
      if (built) {
        items.push(built)
        seenThreadIds.add(built.thread_id)
      }
    }

    for (const row of mockThreadRows.values()) {
      if (row.user_a !== user_id && row.user_b !== user_id) continue
      const otherId = otherParticipant(row, user_id)
      if (connectionPeerIds.has(otherId)) continue
      if (seenThreadIds.has(row.thread_id)) continue
      const built = await buildThreadListItemForViewer(user_id, otherId)
      if (built) {
        items.push(built)
        seenThreadIds.add(row.thread_id)
      }
    }

    items.sort((a, b) => {
      const ra = mockThreadRows.get(a.thread_id)
      const rb = mockThreadRows.get(b.thread_id)
      const ta = ra?.lastMessageAt ? new Date(ra.lastMessageAt).getTime() : 0
      const tb = rb?.lastMessageAt ? new Date(rb.lastMessageAt).getTime() : 0
      return tb - ta
    })
    return items
  }
  const response = await apiClient.post<unknown>('/threads/byUser', { user_id })
  const data = response.data as any
  // Backend may return { threads, total } or a raw array.
  if (Array.isArray(data)) return data as ThreadListItem[]
  if (data && Array.isArray(data.threads)) return data.threads as ThreadListItem[]
  return []
}

export async function listMessages(thread_id: string, pagination?: { page?: number; pageSize?: number }): Promise<MessagesListResponse> {
  if (USE_MOCKS) {
    await mockDelay()
    const row = mockThreadRows.get(thread_id)
    if (row) {
      return { messages: [...row.messages], has_more: false }
    }
    return { messages: MOCK_MESSAGES_BY_THREAD[thread_id] ?? [], has_more: false }
  }
  const response = await apiClient.post<unknown>('/messages/list', {
    thread_id,
    page: pagination?.page ?? 1,
    pageSize: pagination?.pageSize ?? 50,
  })
  const data = response.data as any
  // Backend returns { messages, total, page, page_size } while frontend expects { messages, has_more }.
  if (data && Array.isArray(data.messages)) {
    const pageSize = Number(data.page_size || pagination?.pageSize || 50)
    const page = Number(data.page || pagination?.page || 1)
    const total = Number(data.total || data.messages.length)
    return { messages: data.messages, has_more: page * pageSize < total }
  }
  return data as MessagesListResponse
}

export type SendMessageOptions = {
  image_url?: string | null
  attachment_url?: string | null
  attachment_filename?: string | null
}

export async function sendMessage(
  thread_id: string,
  sender_id: string,
  text: string,
  idempotency_key: string,
  options?: SendMessageOptions,
): Promise<MessageRecord> {
  if (USE_MOCKS) {
    await mockDelay()
    const row = mockThreadRows.get(thread_id)
    if (!row) {
      return Promise.reject({ status: 404, message: 'Thread not found' })
    }
    const member = await getMember(sender_id)
    const rec: MessageRecord = {
      message_id: `msg-${Date.now()}`,
      thread_id,
      sender_id,
      sender_name: member.full_name,
      text,
      sent_at: new Date().toISOString(),
      status: 'delivered',
      idempotency_key,
      image_url: options?.image_url ?? undefined,
      attachment_url: options?.attachment_url ?? undefined,
      attachment_filename: options?.attachment_filename ?? undefined,
    }
    row.messages.push(rec)
    row.lastMessageAt = rec.sent_at
    const other = otherParticipant(row, sender_id)
    row.unreadByUser[other] = (row.unreadByUser[other] ?? 0) + 1
    return rec
  }
  const response = await apiClient.post<unknown>('/messages/send', {
    thread_id,
    sender_id,
    text,
    idempotency_key,
    image_url: options?.image_url,
    attachment_url: options?.attachment_url,
    attachment_filename: options?.attachment_filename,
  })
  const data = response.data as any
  // Backend may return { message_id, kafka_status } or a full record.
  if (data && typeof data === 'object' && typeof data.message_id === 'string') {
    return {
      message_id: data.message_id,
      thread_id,
      sender_id,
      sender_name: useAuthStore.getState().user?.full_name || 'Member',
      text,
      sent_at: new Date().toISOString(),
      status: 'delivered',
      idempotency_key,
      image_url: options?.image_url ?? undefined,
      attachment_url: options?.attachment_url ?? undefined,
      attachment_filename: options?.attachment_filename ?? undefined,
    } as MessageRecord
  }
  return data as MessageRecord
}

export async function markThreadRead(thread_id: string, reader_id: string): Promise<void> {
  if (USE_MOCKS) {
    await mockDelay(40)
    const row = mockThreadRows.get(thread_id)
    if (row) {
      row.unreadByUser[reader_id] = 0
    }
    return
  }
  await apiClient.post('/messages/markRead', { thread_id, reader_id })
}

export async function editMessage(thread_id: string, message_id: string, editor_id: string, text: string): Promise<MessageRecord> {
  if (USE_MOCKS) {
    await mockDelay()
    const row = mockThreadRows.get(thread_id)
    if (!row) return Promise.reject({ status: 404, message: 'Thread not found' })
    const msg = row.messages.find((m) => m.message_id === message_id)
    if (!msg || msg.sender_id !== editor_id) {
      return Promise.reject({ status: 403, message: 'Cannot edit this message' })
    }
    const next = { ...msg, text: text.trim(), edited_at: new Date().toISOString(), status: 'delivered' as const }
    row.messages = row.messages.map((m) => (m.message_id === message_id ? next : m))
    const last = row.messages[row.messages.length - 1]
    if (last) row.lastMessageAt = last.sent_at
    return next
  }
  const response = await apiClient.post<MessageRecord>('/messages/edit', { thread_id, message_id, editor_id, text })
  return response.data
}

export async function deleteMessage(thread_id: string, message_id: string, user_id: string): Promise<void> {
  if (USE_MOCKS) {
    await mockDelay()
    const row = mockThreadRows.get(thread_id)
    if (!row) return Promise.reject({ status: 404, message: 'Thread not found' })
    const msg = row.messages.find((m) => m.message_id === message_id)
    if (!msg || msg.sender_id !== user_id) {
      return Promise.reject({ status: 403, message: 'Cannot delete this message' })
    }
    row.messages = row.messages.filter((m) => m.message_id !== message_id)
    const last = row.messages[row.messages.length - 1]
    row.lastMessageAt = last ? last.sent_at : new Date().toISOString()
    return
  }
  await apiClient.post('/messages/delete', { thread_id, message_id, user_id })
}

export async function deleteThreadForUser(thread_id: string, user_id: string): Promise<void> {
  if (USE_MOCKS) {
    await mockDelay()
    let set = mockDeletedThreadIdsByUser.get(user_id)
    if (!set) {
      set = new Set()
      mockDeletedThreadIdsByUser.set(user_id, set)
    }
    set.add(thread_id)
    const starSet = mockStarredThreadIdsByUser.get(user_id)
    starSet?.delete(thread_id)
    return
  }
  await apiClient.post('/threads/deleteForUser', { thread_id, user_id })
}

export async function toggleStarThread(thread_id: string, user_id: string): Promise<boolean> {
  if (USE_MOCKS) {
    await mockDelay(40)
    let set = mockStarredThreadIdsByUser.get(user_id)
    if (!set) {
      set = new Set()
      mockStarredThreadIdsByUser.set(user_id, set)
    }
    if (set.has(thread_id)) {
      set.delete(thread_id)
      return false
    }
    set.add(thread_id)
    return true
  }
  const response = await apiClient.post<{ starred: boolean }>('/threads/star', { thread_id, user_id })
  return response.data.starred
}

/** Mock-only: total unread across connection threads (for nav badges, etc.) */
export function getMockMessagingUnreadTotal(user_id: string): number {
  let sum = 0
  for (const row of mockThreadRows.values()) {
    if (row.user_a !== user_id && row.user_b !== user_id) continue
    sum += row.unreadByUser[user_id] ?? 0
  }
  return sum
}
