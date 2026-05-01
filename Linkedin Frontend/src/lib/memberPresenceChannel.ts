import { useMemberPresenceStore } from '../store/memberPresenceStore'

const CHANNEL_NAME = 'linkedin-member-presence-v1'

let channel: BroadcastChannel | null = null

function getChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') return null
  if (!channel) {
    try {
      channel = new BroadcastChannel(CHANNEL_NAME)
    } catch {
      return null
    }
  }
  return channel
}

/** Broadcast + record locally (same tab does not receive its own message). */
export function postMemberPresenceHeartbeat(memberId: string): void {
  const ts = Date.now()
  useMemberPresenceStore.getState().touch(memberId, ts)
  const ch = getChannel()
  if (ch) {
    try {
      ch.postMessage({ memberId, ts })
    } catch {
      /* ignore */
    }
  }
}

export function subscribeMemberPresence(onMessage: (memberId: string, ts: number) => void): () => void {
  const ch = getChannel()
  if (!ch) return () => {}
  const handler = (ev: MessageEvent): void => {
    const d = ev.data as { memberId?: string; ts?: number }
    if (d?.memberId && typeof d.ts === 'number') {
      onMessage(d.memberId, d.ts)
    }
  }
  ch.addEventListener('message', handler)
  return () => ch.removeEventListener('message', handler)
}
