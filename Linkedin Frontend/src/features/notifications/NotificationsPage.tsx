import { memo, useEffect, useRef, type MouseEvent } from 'react'
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { BarChart3, Bot, BriefcaseBusiness, Check, MessageCircle, MoreHorizontal, Reply } from 'lucide-react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { acceptConnection, rejectConnection } from '../../api/connections'
import { dismissNotification, listNotifications, markNotificationViewed, muteNotificationType } from '../../api/notifications'
import { useActionToast } from '../../hooks/useActionToast'
import { useOutcomeNotificationSync } from '../../hooks/useOutcomeNotificationSync'
import type { NotificationFilter, NotificationRecord } from '../../types/notifications'
import { useAuthStore } from '../../store/authStore'
import { useProfileStore } from '../../store/profileStore'
import { Avatar, Button, Card, Dropdown, Skeleton } from '../../components/ui'

const filters: Array<{ id: NotificationFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'jobs', label: 'Jobs' },
  { id: 'my_posts', label: 'My posts' },
  { id: 'mentions', label: 'Mentions' },
]

function iconForNotification(notification: NotificationRecord): JSX.Element {
  switch (notification.type) {
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

function actionForType(notification: NotificationRecord, onOpen: () => void): JSX.Element | null {
  const stop = (e: MouseEvent): void => {
    e.stopPropagation()
  }
  if (notification.type === 'post_comment' || notification.type === 'message') {
    return (
      <Button type="button" size="sm" variant="secondary" className="mt-2" leftIcon={<Reply className="h-4 w-4" />} onClick={(e) => { stop(e); onOpen() }}>
        Reply
      </Button>
    )
  }
  if (notification.type === 'job_recommendation') {
    return (
      <Button type="button" size="sm" className="mt-2" onClick={(e) => { stop(e); onOpen() }}>
        View Job
      </Button>
    )
  }
  if (notification.type === 'application_status') {
    return (
      <Button type="button" size="sm" variant="secondary" className="mt-2" onClick={(e) => { stop(e); onOpen() }}>
        View
      </Button>
    )
  }
  if (notification.type === 'ai_completed') {
    return (
      <Button type="button" size="sm" variant="secondary" className="mt-2" onClick={(e) => { stop(e); onOpen() }}>
        View
      </Button>
    )
  }
  return null
}

type ConnectionActions = {
  onIgnoreConnection: (requestId: string) => void
  onAcceptConnection: (requestId: string, inviterName: string) => void
  ignorePendingId: string | null
  acceptPendingId: string | null
}

const NotificationItem = memo(function NotificationItem({
  notification,
  onOpen,
  onDelete,
  onMuteType,
  connectionActions,
}: {
  notification: NotificationRecord
  onOpen: () => void
  onDelete: () => void
  onMuteType: () => void
  connectionActions: ConnectionActions | null
}): JSX.Element {
  const isConnection = notification.type === 'connection_request' && Boolean(notification.connection_request_id)
  const [headlineLine, mutualLine] =
    isConnection && notification.preview.includes(' · ')
      ? (() => {
          const i = notification.preview.indexOf(' · ')
          return [notification.preview.slice(0, i), notification.preview.slice(i + 3)]
        })()
      : ['', '']

  return (
    <article className={`relative rounded-lg border border-border p-3 transition hover:bg-black/[0.03] ${notification.unread ? 'bg-brand-primary/5' : 'bg-surface-raised'}`}>
      <div className="flex gap-3">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-surface">
          {isConnection ? (
            <Avatar size="lg" name={notification.actor_name ?? notification.title} src={notification.actor_avatar_url ?? undefined} />
          ) : (
            iconForNotification(notification)
          )}
        </div>
        <div className="min-w-0 flex-1">
          <button type="button" onClick={onOpen} className="w-full text-left">
            <p className="text-sm text-text-primary">
              <span className="font-semibold">{notification.title}</span>
            </p>
            {isConnection && headlineLine ? (
              <>
                <p className="mt-1 text-sm text-text-secondary">{headlineLine}</p>
                {mutualLine ? <p className="mt-1 text-xs text-text-tertiary">{mutualLine}</p> : null}
              </>
            ) : (
              <p className="mt-1 text-sm text-text-secondary">{notification.preview}</p>
            )}
            <p className="mt-1 text-xs text-text-tertiary">{notification.timestamp}</p>
          </button>
          {isConnection && notification.connection_request_id && connectionActions ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                loading={connectionActions.ignorePendingId === notification.connection_request_id}
                onClick={(e) => {
                  e.stopPropagation()
                  connectionActions.onIgnoreConnection(notification.connection_request_id!)
                }}
              >
                Ignore
              </Button>
              <Button
                type="button"
                size="sm"
                loading={connectionActions.acceptPendingId === notification.connection_request_id}
                onClick={(e) => {
                  e.stopPropagation()
                  connectionActions.onAcceptConnection(notification.connection_request_id!, notification.title)
                }}
              >
                Accept
              </Button>
            </div>
          ) : (
            actionForType(notification, onOpen)
          )}
        </div>
        <div className="flex items-start gap-2">
          <Dropdown.Root>
            <Dropdown.Trigger className="h-8 w-8 justify-center px-0"><MoreHorizontal className="h-4 w-4" /></Dropdown.Trigger>
            <Dropdown.Content>
              <Dropdown.Item onSelect={onDelete}>Delete</Dropdown.Item>
              <Dropdown.Item onSelect={onMuteType}>Turn off this type</Dropdown.Item>
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
  useOutcomeNotificationSync()
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const queryClient = useQueryClient()
  const actionToast = useActionToast()
  const patchProfile = useProfileStore((s) => s.patchProfile)
  const filter = (searchParams.get('filter') as NotificationFilter) ?? 'all'
  const sentinelRef = useRef<HTMLDivElement>(null)

  const acceptMutation = useMutation({
    mutationFn: async (input: { requestId: string; inviterName: string }) => {
      await acceptConnection(input.requestId)
      return input.inviterName
    },
    onSuccess: (inviterName) => {
      actionToast.connectionAccepted(inviterName)
      const current = useProfileStore.getState().profile.connections_count ?? 0
      patchProfile({ connections_count: current + 1 })
      void queryClient.invalidateQueries({ queryKey: ['notifications'], exact: false })
      void queryClient.invalidateQueries({ queryKey: ['pending-invitations'], exact: false })
      void queryClient.invalidateQueries({ queryKey: ['connections'], exact: false })
    },
  })

  const rejectMutation = useMutation({
    mutationFn: rejectConnection,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'], exact: false })
      void queryClient.invalidateQueries({ queryKey: ['pending-invitations'], exact: false })
    },
  })

  const connectionActions: ConnectionActions = {
    onIgnoreConnection: (requestId) => rejectMutation.mutate(requestId),
    onAcceptConnection: (requestId, inviterName) => acceptMutation.mutate({ requestId, inviterName }),
    ignorePendingId: rejectMutation.isPending && rejectMutation.variables ? rejectMutation.variables : null,
    acceptPendingId:
      acceptMutation.isPending && acceptMutation.variables ? acceptMutation.variables.requestId : null,
  }

  const query = useInfiniteQuery({
    queryKey: ['notifications', filter, user?.member_id],
    queryFn: ({ pageParam }) =>
      listNotifications({ page: pageParam, pageSize: 10, filter, viewer_member_id: user?.member_id }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => (lastPage.has_more ? lastPage.page + 1 : undefined),
    enabled: Boolean(user),
  })

  const dismissMutation = useMutation({
    mutationFn: (notificationId: string) => dismissNotification(notificationId, user?.member_id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'], exact: false })
    },
  })
  const viewMutation = useMutation({
    mutationFn: (notificationId: string) => markNotificationViewed(notificationId, user?.member_id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'], exact: false })
    },
  })
  const muteTypeMutation = useMutation({
    mutationFn: (type: NotificationRecord['type']) => muteNotificationType(type, user?.member_id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'], exact: false })
    },
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
              onOpen={() => {
                viewMutation.mutate(notification.notification_id)
                navigate(notification.target_url)
              }}
              onDelete={() => dismissMutation.mutate(notification.notification_id)}
              onMuteType={() => muteTypeMutation.mutate(notification.type)}
                connectionActions={notification.type === 'connection_request' ? connectionActions : null}
              />
            ))}
      </div>

      {query.isFetchingNextPage ? <Skeleton className="h-16" /> : null}
      <div ref={sentinelRef} className="h-4" />
    </div>
  )
}
