import { Pencil } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { listConnections, requestConnection } from '../../api/connections'
import { searchMembers } from '../../api/profile'
import { USE_MOCKS } from '../../api/client'
import { Button, Card } from '../../components/ui'
import { BrandMark } from '../../components/layout/BrandMark'
import { RailFooter } from '../../components/layout/RailFooter'
import { useAuthStore } from '../../store/authStore'
import { useProfileStore } from '../../store/profileStore'
const fictionalCompanies = [
  { id: 'co-f1', name: 'Nimbus Labs', tagline: 'Cloud analytics' },
  { id: 'co-f2', name: 'Vertex Forge', tagline: 'Developer tools' },
  { id: 'co-f3', name: 'Futura Stack', tagline: 'AI infrastructure' },
]

function memberIdFromProfilePath(pathname: string): string | null {
  const m = pathname.replace(/\/+$/, '').match(/^\/in\/([^/]+)$/)
  if (!m) return null
  const id = m[1]
  return id && id !== 'me' ? id : null
}

export function ProfileRightRail(): JSX.Element {
  const location = useLocation()
  const user = useAuthStore((s) => s.user)
  const profileMemberId = useProfileStore((s) => s.profile.member_id)
  /** URL shown for "Public profile" must match the profile in the address bar, not only the logged-in user. */
  const viewedMemberId = memberIdFromProfilePath(location.pathname)
  const publicProfileMemberId = viewedMemberId ?? user?.member_id ?? profileMemberId ?? ''
  const publicHost =
    typeof window !== 'undefined' && window.location?.host ? window.location.host : 'clonecorp.com'
  const toggleFollowCompany = useProfileStore((s) => s.toggleFollowCompany)
  const followed = useProfileStore((s) => s.followedCompanyIds)
  const connectionsQuery = useQuery({
    queryKey: ['connections', user?.member_id],
    queryFn: () => (user ? listConnections(user.member_id) : Promise.resolve([])),
    enabled: Boolean(user),
  })
  const suggestionsQuery = useQuery({
    queryKey: ['member-suggestions', user?.member_id],
    queryFn: async () => {
      if (!user?.member_id) return []
      // Profile service search with empty keyword behaves like "list some members" (LIKE '%%').
      const members = await searchMembers({ query: '' })
      return members
    },
    enabled: Boolean(user?.member_id) && !USE_MOCKS,
  })
  const connectMutation = useMutation({
    mutationFn: async (targetId: string) => {
      if (!user) return
      await requestConnection(user.member_id, targetId)
    },
  })

  const connectedPeerIds = new Set(
    (connectionsQuery.data ?? [])
      .filter((c) => c.status === 'accepted')
      .map((c) => (c.requester_member_id === user?.member_id ? c.addressee_member_id : c.requester_member_id)),
  )
  const suggestions = (USE_MOCKS ? [] : suggestionsQuery.data ?? [])
    .filter((m) => m.member_id && m.member_id !== (user?.member_id ?? '') && !connectedPeerIds.has(m.member_id))
    .slice(0, 3)

  return (
    <aside className="hidden space-y-3 lg:col-span-4 lg:block">
      <Card>
        <Card.Body className="space-y-3 p-4 text-sm">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-text-primary">Profile language</span>
            <button type="button" className="text-brand-primary hover:underline" aria-label="Edit language">
              <Pencil className="h-4 w-4" />
            </button>
          </div>
          <p className="text-text-secondary">English</p>
          <div className="border-t border-border pt-3">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-text-primary">Public profile &amp; URL</span>
              <button type="button" className="text-brand-primary" aria-label="Edit URL">
                <Pencil className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-1 break-all text-text-secondary">
              {publicHost}/in/{publicProfileMemberId || '…'}
            </p>
          </div>
        </Card.Body>
      </Card>

      <Card>
        <Card.Body className="flex flex-col items-center gap-2 py-6">
          <BrandMark size={40} />
          <select className="rounded border border-border px-2 py-1 text-xs" defaultValue="en">
            <option value="en">English (English)</option>
          </select>
          <p className="text-xs text-text-tertiary">LinkedIn Corporation © 2026</p>
        </Card.Body>
      </Card>

      <Card>
        <Card.Header className="text-sm font-semibold">People you may know</Card.Header>
        <Card.Body className="space-y-3">
          {suggestions.map((m) => (
            <div key={m.member_id} className="flex items-start justify-between gap-2">
              <div>
                <Link to={`/in/${m.member_id}`} className="text-sm font-semibold text-text-primary hover:underline">
                  {m.full_name}
                </Link>
                <p className="line-clamp-2 text-xs text-text-secondary">{m.headline}</p>
              </div>
              <Button size="sm" variant="secondary" onClick={() => connectMutation.mutate(m.member_id)}>
                Connect
              </Button>
            </div>
          ))}
          {!USE_MOCKS && suggestions.length === 0 ? (
            <p className="text-xs text-text-tertiary">No suggestions yet. Create a couple accounts and they’ll appear here.</p>
          ) : null}
        </Card.Body>
      </Card>

      <Card>
        <Card.Header className="text-sm font-semibold">You might like</Card.Header>
        <Card.Body className="space-y-3">
          {fictionalCompanies.map((c) => {
            const isFollowing = followed.includes(c.id)
            return (
              <div key={c.id} className="flex items-start justify-between gap-2">
                <div>
                  <Link to={`/companies/${c.id}`} className="text-sm font-semibold text-text-primary hover:underline">
                    {c.name}
                  </Link>
                  <p className="text-xs text-text-secondary">{c.tagline}</p>
                </div>
                <Button
                  size="sm"
                  variant={isFollowing ? 'tertiary' : 'secondary'}
                  onClick={() => toggleFollowCompany(c.id)}
                >
                  {isFollowing ? 'Following' : 'Follow'}
                </Button>
              </div>
            )
          })}
        </Card.Body>
      </Card>

      <RailFooter />
    </aside>
  )
}
