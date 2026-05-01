// ============================================
// INTEGRATION CONTRACT — Nav Badges Service
// ============================================
// Current mode: MOCK-FIRST (computed from local mock notification/thread data)
// To integrate: preserve signature and replace API internals.
//
// Endpoint:
//   GET /me/nav-badges   → fetchNavBadges()
//
// Auth: Bearer token via src/api/client.ts interceptor
// ============================================

import { USE_MOCKS, apiClient, mockDelay } from './client'
import { MOCK_NOTIFICATIONS } from '../lib/mockData'
import { PENDING_CONNECTION_INVITATIONS } from '../lib/networkInvitationsData'
import { getMockMessagingUnreadTotal } from './messaging'
import { useAuthStore } from '../store/authStore'

export type NavBadges = {
  network_pending: number
  messaging_unread: number
  notifications_unread: number
}

function computeMockNavBadges(): NavBadges {
  const memberId = useAuthStore.getState().user?.member_id ?? ''
  return {
    network_pending: PENDING_CONNECTION_INVITATIONS.length,
    messaging_unread: memberId ? getMockMessagingUnreadTotal(memberId) : 0,
    notifications_unread: memberId
      ? MOCK_NOTIFICATIONS.filter((n) => n.unread && (!n.recipient_member_id || n.recipient_member_id === memberId)).length
      : MOCK_NOTIFICATIONS.filter((n) => n.unread && !n.recipient_member_id).length,
  }
}

export async function fetchNavBadges(): Promise<NavBadges> {
  if (USE_MOCKS) {
    await mockDelay(80)
    return computeMockNavBadges()
  }
  const { data } = await apiClient.get<NavBadges>('/me/nav-badges')
  return data
}
