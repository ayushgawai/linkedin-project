import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { listConnections } from '../../api/connections'
import { Avatar, Button, Card, Input, Select, Skeleton } from '../../components/ui'
import { DIRECTORY_MEMBERS } from '../../lib/profileDirectory'
import { useAuthStore } from '../../store/authStore'

export default function NetworkConnectionsPage(): JSX.Element {
  const user = useAuthStore((s) => s.user)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('recent')

  const connectionsQuery = useQuery({
    queryKey: ['connections', user?.member_id],
    queryFn: async () => {
      if (!user) return []
      return listConnections(user.member_id)
    },
    enabled: Boolean(user),
  })

  const cards = useMemo(() => {
    const base = (connectionsQuery.data ?? []).map((connection, index) => {
      const peerId = connection.addressee_member_id
      const directory = DIRECTORY_MEMBERS.find((m) => m.member_id === peerId)
      const fallbackName = ['Jordan Miles', 'Priya Nair', 'Ethan Park', 'Isla Roy'][index % 4] ?? 'Connection'
      return {
      id: connection.connection_id,
      name: directory?.full_name ?? fallbackName,
      headline: directory?.headline ?? 'Professional',
      addedAt: index,
      }
    })

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
                <Avatar size="lg" name={card.name} />
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
