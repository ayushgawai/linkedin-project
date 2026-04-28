import { X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ingestEvent } from '../../api/analytics'
import { acceptConnection, listConnections, listPendingInvitations, rejectConnection, requestConnection } from '../../api/connections'
import { searchMembers } from '../../api/profile'
import { USE_MOCKS } from '../../api/client'
import { Avatar, Button, Card, Skeleton } from '../../components/ui'
import { useActionToast } from '../../hooks/useActionToast'
import { useAuthStore } from '../../store/authStore'
import { useProfileStore } from '../../store/profileStore'
import { useGroupsStore } from '../../store/groupsStore'
import { useEventsStore } from '../../store/eventsStore'
import { useNewslettersStore } from '../../store/newslettersStore'

type DiscoverPerson = {
  id: string
  name: string
  headline: string
  mutual: number
}

export default function NetworkPage(): JSX.Element {
  const actionToast = useActionToast()
  const queryClient = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const profile = useProfileStore((s) => s.profile)
  const patchProfile = useProfileStore((s) => s.patchProfile)
  const groups = useGroupsStore((s) => s.groups)
  const events = useEventsStore((s) => s.events)
  const newsletters = useNewslettersStore((s) => s.newsletters)
  const [dismissedPeople, setDismissedPeople] = useState<string[]>([])
  const [pending, setPending] = useState<string[]>([])
  const [peopleTab, setPeopleTab] = useState('school')

  const loadingQuery = useQuery({ queryKey: ['network-bootstrap'], queryFn: async () => new Promise((r) => setTimeout(r, 400)).then(() => true) })
  const connectionsQuery = useQuery({
    queryKey: ['connections', user?.member_id],
    queryFn: () => (user ? listConnections(user.member_id) : Promise.resolve([])),
    enabled: Boolean(user),
  })
  const invitationsQuery = useQuery({
    queryKey: ['pending-invitations', user?.member_id],
    queryFn: () => (user ? listPendingInvitations(user.member_id) : Promise.resolve([])),
    enabled: Boolean(user),
  })

  useEffect(() => {
    const liveConnections = connectionsQuery.data?.length ?? 0
    if ((profile.connections_count ?? 0) !== liveConnections) {
      patchProfile({ connections_count: liveConnections })
    }
  }, [connectionsQuery.data?.length, patchProfile, profile.connections_count])

  const networkLinks = useMemo(
    () => [
      ['Connections', String(connectionsQuery.data?.length ?? 0)],
      ['Following & followers', String(profile.followers_count ?? 0)],
      ['Groups', String(groups.length)],
      ['Events', String(events.length)],
      ['Newsletters', String(newsletters.length)],
    ],
    [connectionsQuery.data?.length, events.length, groups.length, newsletters.length, profile.followers_count],
  )

  const connectMutation = useMutation({
    mutationFn: async ({ receiverId }: { receiverId: string; name: string }) => {
      if (!user) throw new Error('Not authenticated')
      const result = await requestConnection(user.member_id, receiverId)
      await ingestEvent({
        event_type: 'connection.requested',
        trace_id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        actor_id: user.member_id,
        entity: { entity_type: 'member', entity_id: receiverId },
        idempotency_key: `connection-request-${user.member_id}-${receiverId}`,
      })
      return result
    },
    onSuccess: (_data, { name }) => {
      actionToast.connectionSent(name)
    },
  })
  const acceptMutation = useMutation({
    mutationFn: acceptConnection,
    onSuccess: (_d, requestId) => {
      const accepted = invitationsQuery.data?.find((inv) => inv.request_id === requestId)
      if (accepted) {
        actionToast.connectionAccepted(accepted.name)
      }
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

  const communities = useMemo(() => {
    if (groups.length > 0) {
      return groups.slice(0, 3).map((g) => g.name)
    }
    return ['SJSU Alumni Engineers', 'Frontend Guild', 'System Design Circle']
  }, [groups])

  const suggestionsQuery = useQuery({
    queryKey: ['discover-people', user?.member_id],
    queryFn: async () => {
      if (!user?.member_id) return []
      const members = await searchMembers({ query: '' })
      return members
    },
    enabled: Boolean(user?.member_id) && !USE_MOCKS,
  })

  const discoverPeople = useMemo<DiscoverPerson[]>(() => {
    const connectedIds = new Set(
      (connectionsQuery.data ?? [])
        .filter((c) => c.status === 'accepted')
        .map((c) => (c.requester_member_id === user?.member_id ? c.addressee_member_id : c.requester_member_id)),
    )
    const selfId = user?.member_id ?? ''
    const dedup = new Set<string>()
    const source = USE_MOCKS ? [] : suggestionsQuery.data ?? []
    return source
      .filter((m) => {
        if (!m.member_id || m.member_id === selfId) return false
        if (connectedIds.has(m.member_id)) return false
        if (dismissedPeople.includes(m.member_id)) return false
        if (pending.includes(m.member_id)) return false
        if (dedup.has(m.member_id)) return false
        dedup.add(m.member_id)
        return true
      })
      .slice(0, 9)
      .map((m, index) => ({
        id: m.member_id,
        name: m.full_name,
        headline: m.headline ?? 'Professional',
        mutual: 2 + (index % 4),
      }))
  }, [USE_MOCKS, connectionsQuery.data, dismissedPeople, pending, suggestionsQuery.data, user?.member_id])

  function handleConnect(person: { id: string; name: string }): void {
    setPending((prev) => [...prev, person.id])
    connectMutation.mutate({ receiverId: person.id, name: person.name })
  }

  function dismissPerson(personId: string): void {
    setDismissedPeople((prev) => [...prev, personId])
  }

  return (
    <div className="space-y-3 pb-6">
      <Card>
        <Card.Header><h1 className="text-xl font-semibold">Manage my network</h1></Card.Header>
        <Card.Body className="space-y-1">
          {networkLinks.map(([label, count]) => (
            <Link key={label} to={label === 'Connections' ? '/mynetwork/connections' : '/mynetwork'} className="flex items-center justify-between rounded-md px-2 py-2 text-sm hover:bg-black/5">
              <span className="text-text-primary">{label}</span>
              <span className="text-text-secondary">{count}</span>
            </Link>
          ))}
        </Card.Body>
      </Card>

      <Card>
        <Card.Header className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Invitations ({invitationsQuery.data?.length ?? 0})</h2>
        </Card.Header>
        <Card.Body className="space-y-3">
          {loadingQuery.isLoading
            ? Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20" />)
            : (invitationsQuery.data ?? []).slice(0, 3).map((invitation) => (
                <div key={invitation.request_id} className="flex items-start gap-3 rounded-md border border-border p-3">
                  <Avatar size="lg" name={invitation.name} />
                  <div className="flex-1">
                    <p className="font-semibold text-text-primary">{invitation.name}</p>
                    <p className="text-sm text-text-secondary">{invitation.headline}</p>
                    <p className="mt-1 text-xs text-text-tertiary">{invitation.mutual} mutual connections</p>
                    <div className="mt-2 flex gap-2">
                      <Button variant="secondary" size="sm" onClick={() => rejectMutation.mutate(invitation.request_id)}>Ignore</Button>
                      <Button size="sm" onClick={() => acceptMutation.mutate(invitation.request_id)}>Accept</Button>
                    </div>
                  </div>
                </div>
              ))}
          {(invitationsQuery.data?.length ?? 0) > 3 ? (
            <div className="pt-1">
              <Link to="/mynetwork/invitations" className="text-sm font-semibold text-brand-primary hover:underline">
                Show all
              </Link>
            </div>
          ) : null}
        </Card.Body>
      </Card>

      <Card>
        <Card.Header>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setPeopleTab('school')} className={peopleTab === 'school' ? 'rounded-full bg-brand-primary px-3 py-1 text-xs text-white' : 'rounded-full bg-black/5 px-3 py-1 text-xs'}>People you may know from SJSU</button>
            <button type="button" onClick={() => setPeopleTab('profile')} className={peopleTab === 'profile' ? 'rounded-full bg-brand-primary px-3 py-1 text-xs text-white' : 'rounded-full bg-black/5 px-3 py-1 text-xs'}>Based on your profile</button>
            <button type="button" onClick={() => setPeopleTab('industry')} className={peopleTab === 'industry' ? 'rounded-full bg-brand-primary px-3 py-1 text-xs text-white' : 'rounded-full bg-black/5 px-3 py-1 text-xs'}>From companies in your industry</button>
          </div>
        </Card.Header>
        <Card.Body>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {discoverPeople.map((person) => (
              <article key={person.id} className="relative overflow-hidden rounded-lg border border-border">
                <div className="h-16 bg-[#b9ccd3]" />
                <button
                  type="button"
                  className="absolute right-3 top-3 rounded-full bg-[#1f1f1f]/70 p-1.5 text-white"
                  onClick={() => dismissPerson(person.id)}
                  aria-label="Dismiss suggestion"
                >
                  <X className="h-4 w-4" />
                </button>
                <div className="p-3 pt-0">
                  <Avatar size="xl" name={person.name} className="-mt-10 border-2 border-white" />
                  <Link to={`/in/${person.id}`} className="mt-3 block line-clamp-2 text-[17px] font-semibold leading-tight text-text-primary hover:underline">
                    {person.name}
                  </Link>
                  <p className="line-clamp-2 text-[15px] leading-tight text-text-secondary">{person.headline}</p>
                  <p className="mt-2 text-[13px] text-text-tertiary">{person.mutual} mutual connections</p>
                  <div className="mt-3">
                    <Button fullWidth variant="secondary" disabled={pending.includes(person.id)} onClick={() => handleConnect(person)}>
                      {pending.includes(person.id) ? 'Pending' : 'Connect'}
                    </Button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </Card.Body>
      </Card>

      <Card>
        <Card.Header><h2 className="text-lg font-semibold">Communities</h2></Card.Header>
        <Card.Body>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {communities.map((community) => (
              <div key={community} className="min-w-56 rounded-md border border-border p-3">
                <p className="font-semibold text-text-primary">{community}</p>
                <Button size="sm" variant="secondary" className="mt-2">Follow</Button>
              </div>
            ))}
          </div>
          <div className="pt-3">
            <Link to="/groups" className="text-sm font-semibold text-brand-primary hover:underline">
              Show all
            </Link>
          </div>
        </Card.Body>
      </Card>
    </div>
  )
}
