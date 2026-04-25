import { create } from 'zustand'

/** No heartbeat newer than this → treat as offline (heartbeats every 25s). */
export const MEMBER_PRESENCE_STALE_MS = 45_000

type MemberPresenceState = {
  lastSeen: Record<string, number>
  touch: (memberId: string, ts: number) => void
}

export const useMemberPresenceStore = create<MemberPresenceState>((set) => ({
  lastSeen: {},
  touch: (memberId, ts) => set((s) => ({ lastSeen: { ...s.lastSeen, [memberId]: ts } })),
}))
