import { USE_MOCKS, apiClient } from './client'

/** Notifies the messaging service that this member has an active session (for thread “Online” UI). */
export async function postPresenceHeartbeat(userId: string): Promise<void> {
  if (USE_MOCKS || !userId) return
  try {
    await apiClient.post('/presence/heartbeat', { user_id: userId })
  } catch {
    /* offline gateway / messaging not running — ignore */
  }
}
