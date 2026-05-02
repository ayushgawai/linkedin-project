import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { OUTCOME_NOTIFICATION_EVENT, OUTCOME_NOTIFICATIONS_STORAGE_KEY } from '../api/notifications'

/**
 * Refetch notifications (and profile hiring alerts) when an interview/rejection push
 * is written in another tab or when localStorage updates from a recruiter tab.
 */
export function useOutcomeNotificationSync(): void {
  const queryClient = useQueryClient()
  useEffect(() => {
    const refresh = (): void => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] })
      void queryClient.invalidateQueries({ queryKey: ['profile-hiring-alerts'] })
    }
    window.addEventListener(OUTCOME_NOTIFICATION_EVENT, refresh)
    const onStorage = (e: StorageEvent): void => {
      if (e.key === OUTCOME_NOTIFICATIONS_STORAGE_KEY) refresh()
    }
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener(OUTCOME_NOTIFICATION_EVENT, refresh)
      window.removeEventListener('storage', onStorage)
    }
  }, [queryClient])
}
