/** Lets another browser tab (e.g. signed in as the other participant) refetch the same mock thread. */
const STORAGE_KEY = 'linkedin-mock-messaging-sync'

export function broadcastMessagingThreadUpdate(threadId: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ threadId, at: Date.now() }))
  } catch {
    /* quota / private mode */
  }
}

export function subscribeMessagingThreadUpdates(onUpdate: (threadId: string) => void): () => void {
  function handleStorage(event: StorageEvent): void {
    if (event.key !== STORAGE_KEY || !event.newValue) return
    try {
      const parsed = JSON.parse(event.newValue) as { threadId?: string }
      if (parsed.threadId) onUpdate(parsed.threadId)
    } catch {
      /* ignore */
    }
  }
  window.addEventListener('storage', handleStorage)
  return () => window.removeEventListener('storage', handleStorage)
}
