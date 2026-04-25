import { memo, useEffect, useRef } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { BarChart3, Bot, BriefcaseBusiness, Check, MessageCircle, MoreHorizontal, Reply, UserPlus } from 'lucide-react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { listNotifications } from '../../api/notifications'
import type { NotificationFilter, NotificationRecord } from '../../types/notifications'
import { useAuthStore } from '../../store/authStore'
import { Avatar, Button, Card, Dropdown, Skeleton, useToast } from '../../components/ui'

const filters: Array<{ id: NotificationFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'jobs', label: 'Jobs' },
  { id: 'my_posts', label: 'My posts' },
  { id: 'mentions', label: 'Mentions' },
]

function iconForNotification(notification: NotificationRecord): JSX.Element {
  switch (notification.type) {
    case 'connection_request':
      return <UserPlus className="h-6 w-6 text-brand-primary" />
    case 'job_recommendation':
    case 'application_status':
      return <BriefcaseBusiness className="h-6 w-6 text-warning" />
    case 'ai_completed':
      return <Bot className="h-6 w-6 text-brand-primary" />
    case 'message':
      return <MessageCircle className="h-6 w-6 text-brand-primary" />
    case 'milestone':
      return <BarChart3 className="h-6 w-6 text-success" />
    default:
      return <Avatar size="md" name={notification.actor_name ?? 'User'} />
  }
}

function actionForType(notification: NotificationRecord): JSX.Element | null {
  if (notification.type === 'connection_request') {
    return (
      <div className="mt-2 flex gap-2">
        <Button size="sm" variant="secondary">Ignore</Button>
        <Button size="sm">Accept</Button>
      </div>
    )
  }
  if (notification.type === 'post_comment' || notification.type === 'message') {
    return <Button size="sm" variant="secondary" className="mt-2" leftIcon={<Reply className="h-4 w-4" />}>Reply</Button>
  }
  if (notification.type === 'job_recommendation') {
    return <Button size="sm" className="mt-2">View Job</Button>
  }
  if (notification.type === 'application_status' && !notification.interview_invite) {
    return <Button size="sm" variant="secondary" className="mt-2">View</Button>
  }
  if (notification.type === 'ai_completed') {
    return <Button size="sm" variant="secondary" className="mt-2">View</Button>
  }
  return null
}

const NotificationItem = memo(function NotificationItem({ notification, onOpen }: { notification: NotificationRecord; onOpen: () => void }): JSX.Element {
  const { toast } = useToast()

  return (
    <article className={`relative rounded-lg border border-border p-3 transition hover:bg-black/[0.03] ${notification.unread ? 'bg-brand-primary/5' : 'bg-surface-raised'}`}>
      <div className="flex gap-3">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-surface">{iconForNotification(notification)}</div>
        <div className="min-w-0 flex-1">
          <button type="button" onClick={onOpen} className="w-full text-left">
            <p className="text-sm text-text-primary"><span className="font-semibold">{notification.title}</span></p>
            <p className="mt-1 text-sm text-text-secondary">{notification.preview}</p>
            <p className="mt-1 text-xs text-text-tertiary">{notification.timestamp}</p>
          </button>
          {notification.type === 'application_status' && notification.interview_invite ? (
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() =>
                  toast({
                    variant: 'info',
                    title: 'Invitation declined',
                    description: 'The employer has been notified that you are not moving forward with this interview.',
                  })
                }
              >
                Decline
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  toast({
                    variant: 'success',
                    title: 'Interview accepted',
                    description: 'Great — the hiring team will reach out with scheduling details.',
                  })
                  onOpen()
                }}
              >
                Accept interview
              </Button>
            </div>
          ) : (
            actionForType(notification)
          )}
        </div>
        <div className="flex items-start gap-2">
          <Dropdown.Root>
            <Dropdown.Trigger className="h-8 w-8 justify-center px-0"><MoreHorizontal className="h-4 w-4" /></Dropdown.Trigger>
            <Dropdown.Content>
              <Dropdown.Item>Delete</Dropdown.Item>
              <Dropdown.Item>Turn off this type</Dropdown.Item>
              <Dropdown.Item>Report</Dropdown.Item>
            </Dropdown.Content>
          </Dropdown.Root>
          {notification.unread ? <span className="mt-2 h-2 w-2 rounded-full bg-brand-primary" /> : null}
        </div>
      </div>
    </article>
  )
})

export function NotificationsLeftRail(): JSX.Element {
  const [searchParams] = useSearchParams()
  const filter = (searchParams.get('filter') as NotificationFilter) ?? 'all'

  return (
    <div className="space-y-3">
      <Card>
        <Card.Header><h2 className="text-lg font-semibold">Filters</h2></Card.Header>
        <Card.Body className="space-y-1">
          {filters.map((item) => (
            <Link key={item.id} to={`/notifications?filter=${item.id}`} className={`flex items-center justify-between rounded-md px-2 py-2 text-sm ${filter === item.id ? 'bg-brand-primary/10 text-brand-primary' : 'hover:bg-black/5'}`}>
              <span>{item.label}</span>
              {filter === item.id ? <Check className="h-4 w-4" /> : null}
            </Link>
          ))}
        </Card.Body>
      </Card>

      <Card>
        <Card.Body>
          <Link to="/settings/notifications" className="text-sm font-semibold text-brand-primary hover:underline">
            Manage your notifications
          </Link>
        </Card.Body>
      </Card>
    </div>
  )
}

export default function NotificationsPage(): JSX.Element {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const filter = (searchParams.get('filter') as NotificationFilter) ?? 'all'
  const sentinelRef = useRef<HTMLDivElement>(null)

  const query = useInfiniteQuery({
    queryKey: ['notifications', filter, user?.member_id],
    queryFn: ({ pageParam }) =>
      listNotifications({ page: pageParam, pageSize: 10, filter, viewer_member_id: user?.member_id }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => (lastPage.has_more ? lastPage.page + 1 : undefined),
    enabled: Boolean(user),
  })

  useEffect(() => {
    if (!sentinelRef.current) return
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && query.hasNextPage && !query.isFetchingNextPage) {
        void query.fetchNextPage()
      }
    })
    observer.observe(sentinelRef.current)
    return () => observer.disconnect()
  }, [query])

  const notifications = query.data?.pages.flatMap((p) => p.notifications) ?? []

  return (
    <div className="space-y-3 pb-6">
      <Card>
        <Card.Body className="flex flex-wrap gap-2 p-3">
          {filters.map((item) => (
            <button key={item.id} type="button" onClick={() => setSearchParams({ filter: item.id })} className={filter === item.id ? 'rounded-full bg-brand-primary px-3 py-1 text-xs font-semibold text-white' : 'rounded-full bg-black/5 px-3 py-1 text-xs text-text-secondary'}>
              {item.label}
            </button>
          ))}
        </Card.Body>
      </Card>

      <div className="space-y-2">
        {query.isLoading
          ? Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24" />)
          : notifications.map((notification) => (
              <NotificationItem
                key={notification.notification_id}
                notification={notification}
                onOpen={() => navigate(notification.target_url)}
              />
            ))}
      </div>

      {query.isFetchingNextPage ? <Skeleton className="h-16" /> : null}
      <div ref={sentinelRef} className="h-4" />
    </div>
  )
}
