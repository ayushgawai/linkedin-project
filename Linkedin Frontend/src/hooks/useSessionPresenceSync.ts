import { useEffect } from 'react'
import { postPresenceHeartbeat } from '../api/presence'
import { postMemberPresenceHeartbeat, subscribeMemberPresence } from '../lib/memberPresenceChannel'
import { useMemberPresenceStore } from '../store/memberPresenceStore'

const HEARTBEAT_MS = 25_000

/**
 * While a member is signed in, publishes periodic heartbeats so other tabs / windows
 * on this origin can show them as Online in messaging. Replace with server/WebSocket
 * presence when a backend is available.
 */
export function useSessionPresenceSync(memberId: string | undefined): void {
  useEffect(() => {
    return subscribeMemberPresence((id, ts) => {
      useMemberPresenceStore.getState().touch(id, ts)
    })
  }, [])

  useEffect(() => {
    if (!memberId) return
    postMemberPresenceHeartbeat(memberId)
    void postPresenceHeartbeat(memberId)
    const interval = window.setInterval(() => {
      postMemberPresenceHeartbeat(memberId)
      void postPresenceHeartbeat(memberId)
    }, HEARTBEAT_MS)
    return () => window.clearInterval(interval)
  }, [memberId])
}
