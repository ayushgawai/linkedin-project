import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Card } from '../../components/ui'
import { RailFooter } from '../../components/layout/RailFooter'
import { RightRail } from '../../components/layout/RightRail'
import { SUGGESTED_TECH_GROUPS } from '../groups/suggestedGroups'
import { useAuthStore } from '../../store/authStore'
import { useGroupsStore } from '../../store/groupsStore'

export function CommunityRightRail(): JSX.Element {
  const { pathname } = useLocation()
  const user = useAuthStore((s) => s.user)
  const storeGroups = useGroupsStore((s) => s.groups)
  const addGroup = useGroupsStore((s) => s.addGroup)
  const deleteGroup = useGroupsStore((s) => s.deleteGroup)
  const updateGroup = useGroupsStore((s) => s.updateGroup)
  const [groups, setGroups] = useState(() =>
    SUGGESTED_TECH_GROUPS.map((group) => ({ ...group, joined: false })),
  )
  const [brokenLogos, setBrokenLogos] = useState<Record<string, boolean>>({})

  useEffect(() => {
    setGroups((prev) =>
      prev.map((group) => ({
        ...group,
        joined: storeGroups.some((existing) => existing.id === group.id),
      })),
    )
  }, [storeGroups])

  useEffect(() => {
    for (const suggested of SUGGESTED_TECH_GROUPS) {
      const existing = storeGroups.find((group) => group.id === suggested.id)
      if (!existing) continue
      if (existing.name !== suggested.name || existing.logoImage !== suggested.logoImage || existing.description !== suggested.description) {
        updateGroup(suggested.id, {
          name: suggested.name,
          logoImage: suggested.logoImage,
          description: suggested.description,
        })
      }
    }
  }, [storeGroups, updateGroup])

  function toggleJoin(groupId: string): void {
    setGroups((prev) =>
      prev.map((group) => {
        if (group.id !== groupId) return group
        const nextJoined = !group.joined
        if (nextJoined) {
          addGroup({
            id: group.id,
            name: group.name,
            description: group.description,
            logoImage: group.logoImage,
            industry: ['Technology'],
            groupType: 'public',
            createdBy: user?.member_id ?? 'demo-member',
            createdAt: new Date().toISOString(),
            members: [user?.member_id ?? 'demo-member'],
            memberCount: group.members + 1,
          })
        } else {
          deleteGroup(group.id)
        }
        return {
          ...group,
          joined: nextJoined,
          members: nextJoined ? group.members + 1 : Math.max(0, group.members - 1),
        }
      }),
    )
  }

  if (pathname.startsWith('/groups')) {
    return (
      <>
        <Card>
          <Card.Header className="pb-2"><h2 className="text-base font-semibold">Groups you might be interested in</h2></Card.Header>
          <Card.Body className="p-0">
            {groups.map((group, index) => (
              <article key={group.id} className={`px-4 py-3 ${index < groups.length - 1 ? 'border-b border-border' : ''}`}>
                <div className="flex items-start gap-3">
                  <Link to={`/groups/${group.id}`} className="h-12 w-12 shrink-0 overflow-hidden rounded bg-surface">
                    {brokenLogos[group.id] ? (
                      <div className="flex h-full w-full items-center justify-center bg-slate-700 text-xs font-bold text-white">
                        {group.name
                          .split(' ')
                          .slice(0, 2)
                          .map((part) => part.charAt(0).toUpperCase())
                          .join('')
                          .replace(/[^A-Z0-9]/gi, '')
                          .slice(0, 2) || 'TG'}
                      </div>
                    ) : (
                      <img
                        src={group.logoImage}
                        alt={`${group.name} logo`}
                        className="h-full w-full object-cover"
                        onError={() => setBrokenLogos((prev) => ({ ...prev, [group.id]: true }))}
                      />
                    )}
                  </Link>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-sm font-semibold">
                      <Link to={`/groups/${group.id}`} className="hover:underline">
                        {group.name}
                      </Link>
                    </p>
                    <p className="text-xs text-text-secondary">{group.members.toLocaleString()} members</p>
                    <button
                      type="button"
                      className={`mt-2 rounded-full px-4 py-1 text-sm font-semibold ${
                        group.joined
                          ? 'border border-success bg-success/10 text-success'
                          : 'border border-text-primary text-text-primary'
                      }`}
                      onClick={() => toggleJoin(group.id)}
                    >
                      {group.joined ? 'Joined' : 'Join'}
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </Card.Body>
        </Card>
        <RailFooter />
      </>
    )
  }

  if (pathname.startsWith('/events')) {
    return <RailFooter />
  }

  return <RightRail />
}
