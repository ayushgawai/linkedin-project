import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { acceptConnection, listPendingInvitations, rejectConnection } from '../../api/connections'
import { ingestEvent } from '../../api/analytics'
import { Avatar, Button, Card, EmptyState } from '../../components/ui'
import { useActionToast } from '../../hooks/useActionToast'
import { useAuthStore } from '../../store/authStore'
import { useProfileStore } from '../../store/profileStore'

export default function NetworkInvitationsPage(): JSX.Element {
  const actionToast = useActionToast()
  const queryClient = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const patchProfile = useProfileStore((s) => s.patchProfile)
  const [tab, setTab] = useState<'Received' | 'Sent' | 'Archived'>('Received')
  const invitationsQuery = useQuery({
    queryKey: ['pending-invitations', user?.member_id],
    queryFn: () => (user ? listPendingInvitations(user.member_id) : Promise.resolve([])),
    enabled: Boolean(user),
  })

  const acceptMutation = useMutation({
    mutationFn: async (requestId: string) => {
      await acceptConnection(requestId)
      if (user) {
        await ingestEvent({
          event_type: 'connection.requested',
          trace_id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          actor_id: user.member_id,
          entity: { entity_type: 'connection_request', entity_id: requestId },
          idempotency_key: `connection-accept-${requestId}`,
        })
      }
    },
    onSuccess: (_, requestId) => {
      const accepted = invitationsQuery.data?.find((item) => item.request_id === requestId)
      if (accepted) {
        actionToast.connectionAccepted(accepted.name)
      }
      const currentConnections = useProfileStore.getState().profile.connections_count ?? 0
      patchProfile({ connections_count: currentConnections + 1 })
      void queryClient.invalidateQueries({ queryKey: ['pending-invitations', user?.member_id] })
      void queryClient.invalidateQueries({ queryKey: ['connections', user?.member_id] })
    },
  })

  const rejectMutation = useMutation({
    mutationFn: rejectConnection,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['pending-invitations', user?.member_id] })
    },
  })

  return (
    <Card>
      <Card.Header>
        <h1 className="text-xl font-semibold">Invitations</h1>
        <div className="mt-2 flex gap-2">
          {(['Received', 'Sent', 'Archived'] as const).map((item) => (
            <button key={item} type="button" onClick={() => setTab(item)} className={tab === item ? 'rounded-full bg-brand-primary px-3 py-1 text-xs text-white' : 'rounded-full bg-black/5 px-3 py-1 text-xs'}>{item}</button>
          ))}
        </div>
      </Card.Header>
      <Card.Body className="space-y-3">
        {tab === 'Received' ? (
          (invitationsQuery.data?.length ?? 0) === 0 ? (
            <EmptyState title="No invitations" description="You're all caught up." />
          ) : (
            (invitationsQuery.data ?? []).map((item) => (
              <div key={item.request_id} className="flex items-center gap-3 rounded-md border border-border p-3">
                <Avatar size="lg" name={item.name} />
                <div className="flex-1">
                  <p className="font-semibold text-text-primary">{item.name}</p>
                  <p className="text-sm text-text-secondary">{item.headline}</p>
                  <p className="text-xs text-text-tertiary">{item.mutual} mutual connections</p>
                </div>
                <Button variant="secondary" size="sm" onClick={() => rejectMutation.mutate(item.request_id)}>Ignore</Button>
                <Button size="sm" loading={acceptMutation.isPending} onClick={() => acceptMutation.mutate(item.request_id)}>Accept</Button>
              </div>
            ))
          )
        ) : (
          <p className="text-sm text-text-secondary">{tab} invitations placeholder list.</p>
        )}
      </Card.Body>
    </Card>
  )
}
