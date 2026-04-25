import { useEffect, useState } from 'react'
import { MEMBER_PRESENCE_STALE_MS, useMemberPresenceStore } from '../store/memberPresenceStore'

const CLOCK_MS = 4_000

/**
 * True when recent heartbeats were received for this member (see useSessionPresenceSync).
 * `serverOnline` merges API/socket truth when the backend sets participant.online.
 */
export function useMemberPresence(memberId: string | undefined, serverOnline = false): boolean {
  const lastSeen = useMemberPresenceStore((s) => (memberId ? s.lastSeen[memberId] : undefined))
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), CLOCK_MS)
    return () => window.clearInterval(id)
  }, [])

  if (serverOnline) return true
  if (!memberId || lastSeen == null) return false
  return now - lastSeen < MEMBER_PRESENCE_STALE_MS
}
