import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { listConnections } from '../../api/connections'
import { getMember } from '../../api/profile'
import { Avatar, Button, Card, Input, Select, Skeleton } from '../../components/ui'
import { useAuthStore } from '../../store/authStore'

export default function NetworkConnectionsPage(): JSX.Element {
  const user = useAuthStore((s) => s.user)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('recent')

  const connectionsQuery = useQuery({
    queryKey: ['connections', user?.member_id],
    queryFn: async () => {
      if (!user?.member_id) return []
      const conns = await listConnections(user.member_id)
      const peerIds = Array.from(
        new Set(
          conns
            .filter((c) => c.status === 'accepted')
            .map((c) => (c.requester_member_id === user.member_id ? c.addressee_member_id : c.requester_member_id)),
        ),
      )
      const memberMap = new Map<string, { full_name: string; headline: string; profile_photo_url: string | null }>()
      await Promise.all(
        peerIds.map(async (id) => {
          try {
            const m = await getMember(id)
            memberMap.set(id, { full_name: m.full_name, headline: m.headline ?? 'Professional', profile_photo_url: m.profile_photo_url ?? null })
          } catch {
            memberMap.set(id, { full_name: `Member ${id.slice(0, 6)}`, headline: 'Professional', profile_photo_url: null })
          }
        }),
      )
      return conns
        .filter((c) => c.status === 'accepted')
        .map((c) => {
          const peerId = c.requester_member_id === user.member_id ? c.addressee_member_id : c.requester_member_id
          const peer = memberMap.get(peerId) ?? { full_name: `Member ${peerId.slice(0, 6)}`, headline: 'Professional', profile_photo_url: null }
          return {
            id: c.connection_id,
            peerId,
            name: peer.full_name,
            headline: peer.headline,
            avatar: peer.profile_photo_url,
          }
        })
    },
    enabled: Boolean(user?.member_id),
  })

  const cards = useMemo(() => {
    const base = (connectionsQuery.data ?? []).map((c, index) => ({ ...c, addedAt: index }))
    const filtered = base.filter((item) => item.name.toLowerCase().includes(query.toLowerCase()))

    if (sort === 'first_name') return [...filtered].sort((a, b) => a.name.localeCompare(b.name))
    if (sort === 'last_name') return [...filtered].sort((a, b) => a.name.split(' ')[1]?.localeCompare(b.name.split(' ')[1] ?? '') ?? 0)
    return filtered
  }, [connectionsQuery.data, query, sort])

  return (
    <Card>
      <Card.Header className="space-y-3">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">{cards.length} connections</h1>
          <div className="w-48">
            <Select
              variant="native"
              value={sort}
              onValueChange={setSort}
              options={[
                { value: 'recent', label: 'Recently added' },
                { value: 'first_name', label: 'First name' },
                { value: 'last_name', label: 'Last name' },
              ]}
            />
          </div>
        </div>
        <Input placeholder="Search by name" value={query} onChange={(e) => setQuery(e.target.value)} />
      </Card.Header>
      <Card.Body>
        {connectionsQuery.isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} variant="rect" className="h-28" />)}</div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {cards.map((card) => (
              <article key={card.id} className="rounded-lg border border-border p-3">
                <Avatar size="lg" name={card.name} src={card.avatar ?? undefined} />
                <p className="mt-2 font-semibold text-text-primary">{card.name}</p>
                <p className="text-sm text-text-secondary">{card.headline}</p>
                <Button size="sm" variant="secondary" className="mt-3">Message</Button>
              </article>
            ))}
          </div>
        )}
      </Card.Body>
    </Card>
  )
}
