// ============================================
// INTEGRATION CONTRACT — Connections Service
// ============================================
// Current mode: MOCK (returns local connection graph when VITE_USE_MOCKS=true)
// To integrate: keep signatures and swap non-mock branches as needed.
//
// Endpoints:
//   POST /connections/request   → requestConnection(requester_id, receiver_id)
//   POST /connections/accept    → acceptConnection(request_id)
//   POST /connections/reject    → rejectConnection(request_id)
//   POST /connections/list      → listConnections(user_id)
//   POST /connections/mutual    → listMutualConnections(user_id, other_id)
//
// Auth: Bearer token via src/api/client.ts interceptor
// ============================================

import { USE_MOCKS, apiClient, mockDelay } from './client'
import type { Connection } from '../types'
import { PENDING_CONNECTION_INVITATIONS } from '../lib/networkInvitationsData'
import { useAuthStore } from '../store/authStore'
import { useProfileStore } from '../store/profileStore'
import { getMember } from './profile'

export type ConnectionInvitation = {
  request_id: string
  requester_member_id: string
  addressee_member_id: string
  name: string
  headline: string
  mutual: number
  created_at: string
}

const mockConnectionsByUser = new Map<string, Connection[]>()
let mockInvitations: ConnectionInvitation[] = []
const seededUsers = new Set<string>()

function seedForUser(userId: string): void {
  if (seededUsers.has(userId)) return
  seededUsers.add(userId)

  const now = Date.now()
  const accepted = Array.from({ length: 8 }).map((_, index) => ({
    connection_id: `conn-${userId}-seed-${index + 1}`,
    requester_member_id: userId,
    addressee_member_id: `seed-member-${index + 1}`,
    status: 'accepted' as const,
    created_at: new Date(now - index * 86400000).toISOString(),
    updated_at: new Date(now - index * 43200000).toISOString(),
  }))
  mockConnectionsByUser.set(userId, accepted)

  const seededInvitations = PENDING_CONNECTION_INVITATIONS.map((invitation, index) => ({
    request_id: invitation.request_id,
    requester_member_id: `dir-inviter-${index + 1}`,
    addressee_member_id: userId,
    name: invitation.name,
    headline: invitation.headline,
    mutual: invitation.mutual,
    created_at: new Date(now - index * 3600000).toISOString(),
  }))
  mockInvitations = [...mockInvitations.filter((i) => i.addressee_member_id !== userId), ...seededInvitations]
}

function ensureConnectionList(memberId: string): Connection[] {
  seedForUser(memberId)
  const list = mockConnectionsByUser.get(memberId)
  if (list) return list
  const next: Connection[] = []
  mockConnectionsByUser.set(memberId, next)
  return next
}

function resolveMemberLabel(memberId: string): { name: string; headline: string } {
  const auth = useAuthStore.getState().user
  const profile = useProfileStore.getState().profile
  if (auth?.member_id === memberId) {
    const name = `${profile.first_name} ${profile.last_name}`.trim() || auth.full_name || 'Member'
    return { name, headline: profile.headline || 'Professional' }
  }
  return { name: `Member ${memberId.slice(0, 6)}`, headline: 'Professional' }
}

function addAcceptedConnection(a: string, b: string): void {
  const now = new Date().toISOString()
  const linkA: Connection = {
    connection_id: `conn-${a}-${b}`,
    requester_member_id: a,
    addressee_member_id: b,
    status: 'accepted',
    created_at: now,
    updated_at: now,
  }
  const linkB: Connection = {
    connection_id: `conn-${b}-${a}`,
    requester_member_id: b,
    addressee_member_id: a,
    status: 'accepted',
    created_at: now,
    updated_at: now,
  }
  const listA = ensureConnectionList(a)
  const listB = ensureConnectionList(b)
  if (!listA.some((c) => c.addressee_member_id === b)) listA.unshift(linkA)
  if (!listB.some((c) => c.addressee_member_id === a)) listB.unshift(linkB)
}

export async function requestConnection(requester_id: string, receiver_id: string): Promise<{ request_id: string }> {
  if (USE_MOCKS) {
    await mockDelay(200)
    ensureConnectionList(requester_id)
    ensureConnectionList(receiver_id)
    const existing = mockInvitations.find(
      (inv) => inv.requester_member_id === requester_id && inv.addressee_member_id === receiver_id,
    )
    if (existing) {
      return { request_id: existing.request_id }
    }
    const request_id = `conn-${requester_id}-${receiver_id}-${Date.now()}`
    const requester = resolveMemberLabel(requester_id)
    mockInvitations.unshift({
      request_id,
      requester_member_id: requester_id,
      addressee_member_id: receiver_id,
      name: requester.name,
      headline: requester.headline,
      mutual: 1,
      created_at: new Date().toISOString(),
    })
    return { request_id }
  }
  const response = await apiClient.post<{ request_id: string }>('/connections/request', { requester_id, receiver_id })
  return response.data
}

export async function acceptConnection(request_id: string): Promise<{ success: boolean }> {
  if (USE_MOCKS) {
    await mockDelay(180)
    const invitation = mockInvitations.find((inv) => inv.request_id === request_id)
    if (invitation) {
      addAcceptedConnection(invitation.requester_member_id, invitation.addressee_member_id)
      mockInvitations = mockInvitations.filter((inv) => inv.request_id !== request_id)
    }
    return { success: true }
  }
  const response = await apiClient.post<{ success: boolean }>('/connections/accept', { request_id })
  return response.data
}

export async function rejectConnection(request_id: string): Promise<{ success: boolean }> {
  if (USE_MOCKS) {
    await mockDelay(180)
    mockInvitations = mockInvitations.filter((inv) => inv.request_id !== request_id)
    return { success: true }
  }
  const response = await apiClient.post<{ success: boolean }>('/connections/reject', { request_id })
  return response.data
}

export async function listConnections(user_id: string): Promise<Connection[]> {
  if (USE_MOCKS) {
    await mockDelay(220)
    return ensureConnectionList(user_id)
  }
  const response = await apiClient.post<unknown>('/connections/list', { user_id })
  const data = response.data as any
  // Backend may return { connections, total } or a raw array.
  if (Array.isArray(data)) return data as Connection[]
  if (data && Array.isArray(data.connections)) return data.connections as Connection[]
  return []
}

export async function listMutualConnections(user_id: string, other_id: string): Promise<Connection[]> {
  if (USE_MOCKS) {
    await mockDelay(220)
    return Array.from({ length: 6 }).map((_, index) => ({
      connection_id: `mutual-${user_id}-${other_id}-${index + 1}`,
      requester_member_id: user_id,
      addressee_member_id: `member-${index + 200}`,
      status: 'accepted',
      created_at: new Date(Date.now() - index * 604800000).toISOString(),
      updated_at: new Date(Date.now() - index * 302400000).toISOString(),
    }))
  }
  const response = await apiClient.post<Connection[]>('/connections/mutual', { user_id, other_id })
  return response.data
}

export async function listPendingInvitations(user_id: string): Promise<ConnectionInvitation[]> {
  if (USE_MOCKS) {
    await mockDelay(180)
    seedForUser(user_id)
    return mockInvitations.filter((inv) => inv.addressee_member_id === user_id)
  }
  const response = await apiClient.post<ConnectionInvitation[]>('/connections/pending', { user_id })
  const invitations = response.data ?? []
  // Enrich requester display info (works for both members + recruiters).
  const uniqueRequesterIds = Array.from(new Set(invitations.map((i) => i.requester_member_id).filter(Boolean)))
  const requesterMap = new Map<string, { name: string; headline: string }>()
  await Promise.all(
    uniqueRequesterIds.map(async (rid) => {
      try {
        const m = await getMember(rid)
        requesterMap.set(rid, { name: m.full_name, headline: m.headline ?? 'Professional' })
      } catch {
        requesterMap.set(rid, { name: `Member ${rid.slice(0, 6)}`, headline: 'Professional' })
      }
    }),
  )
  return invitations.map((inv) => {
    const r = requesterMap.get(inv.requester_member_id)
    return r ? { ...inv, name: r.name, headline: r.headline } : inv
  })
}
