import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Bell } from 'lucide-react'
import { listNotifications } from '../../api/notifications'
import { useOutcomeNotificationSync } from '../../hooks/useOutcomeNotificationSync'
import { Card, Skeleton } from '../../components/ui'

type ProfileHiringAlertsCardProps = {
  memberId: string
}

/** Own-profile surface for interview / status notifications (backed by mock + localStorage). */
export function ProfileHiringAlertsCard({ memberId }: ProfileHiringAlertsCardProps): JSX.Element {
  useOutcomeNotificationSync()

  const q = useQuery({
    queryKey: ['profile-hiring-alerts', memberId],
    queryFn: () =>
      listNotifications({
        page: 1,
        pageSize: 15,
        filter: 'jobs',
        viewer_member_id: memberId,
      }),
    staleTime: 10_000,
  })

  const hiring = useMemo(() => {
    const raw = (q.data?.notifications ?? []).filter((n) => n.type === 'application_status')
    const seen = new Set<string>()
    const out: typeof raw = []
    for (const n of raw) {
      const key = `${n.title}|${n.preview}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push(n)
    }
    return out
  }, [q.data?.notifications])

  return (
    <Card>
      <Card.Header className="flex flex-wrap items-center justify-between gap-2 border-b border-border">
        <div className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-brand-primary" aria-hidden />
          <h2 className="text-base font-semibold text-text-primary">Hiring updates</h2>
        </div>
        <Link to="/notifications" className="text-sm font-semibold text-brand-primary hover:underline">
          Notifications
        </Link>
      </Card.Header>
      <Card.Body className="space-y-3">
        {q.isLoading ? (
          <Skeleton className="h-14 w-full" />
        ) : hiring.length === 0 ? (
          <p className="text-sm leading-relaxed text-text-secondary">
            When a recruiter invites you to interview or updates your application, it appears here and under the{' '}
            <Link to="/notifications" className="font-semibold text-brand-primary hover:underline">
              Notifications
            </Link>{' '}
            bell.
          </p>
        ) : (
          <ul className="space-y-2">
            {hiring.slice(0, 5).map((n) => (
              <li key={n.notification_id}>
                <Link
                  to={n.target_url || '/notifications'}
                  className="block rounded-md border border-border bg-surface px-3 py-2 transition hover:border-brand-primary/40 hover:bg-black/[0.02]"
                >
                  <p className="text-sm font-semibold text-text-primary">{n.title}</p>
                  <p className="mt-0.5 line-clamp-2 text-xs text-text-secondary">{n.preview}</p>
                  <p className="mt-1 text-xs text-text-tertiary">{n.timestamp}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card.Body>
    </Card>
  )
}
