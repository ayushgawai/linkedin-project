import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useAuthStore } from '../store/authStore'

const DEFAULT_MS = 5000

/**
 * Periodically refreshes notifications and pending invitations so new connection
 * requests appear for the recipient without a manual refresh (member + recruiter).
 */
export function useConnectionNotificationPoll(intervalMs: number = DEFAULT_MS): void {
  const queryClient = useQueryClient()
  const memberId = useAuthStore((s) => s.user?.member_id)

  useEffect(() => {
    if (!memberId) return
    const tick = (): void => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
      void queryClient.invalidateQueries({ queryKey: ['notifications'], exact: false })
      void queryClient.invalidateQueries({ queryKey: ['pending-invitations'], exact: false })
    }
    const id = window.setInterval(tick, intervalMs)
    const onVisible = (): void => {
      if (document.visibilityState === 'visible') tick()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [memberId, intervalMs, queryClient])
}
