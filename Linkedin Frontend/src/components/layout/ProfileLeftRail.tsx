import { useQuery } from '@tanstack/react-query'
import { Bookmark } from 'lucide-react'
import { Link, useParams, useLocation } from 'react-router-dom'
import { getMember } from '../../api/profile'
import { Avatar, Skeleton } from '../ui'
import { useProfileStore } from '../../store/profileStore'
import { cn } from '../../lib/cn'

const cardClass = 'overflow-hidden rounded-[10px] border border-[#e0e0e0] bg-white'

function memberIdFromPath(pathname: string, params: { memberId?: string }): string {
  if (params.memberId) {
    return params.memberId
  }
  const normalized = pathname.replace(/\/+$/, '')
  return normalized.match(/^\/in\/([^/]+)$/)?.[1] ?? ''
}

export function ProfileLeftRail(): JSX.Element | null {
  const { pathname: pathName } = useLocation()
  const params = useParams()
  const memberId = memberIdFromPath(pathName, params)
  const profile = useProfileStore((s) => s.profile)
  const isOwnProfile = Boolean(memberId && profile.member_id && memberId === profile.member_id)

  const memberQuery = useQuery({
    queryKey: ['member', memberId],
    queryFn: () => getMember(memberId),
    enabled: Boolean(memberId) && !isOwnProfile,
    staleTime: 60_000,
  })

  if (!memberId) {
    return null
  }

  if (!isOwnProfile && (memberQuery.isLoading || !memberQuery.data)) {
    return (
      <aside className="sticky top-[74px] w-full space-y-3 self-start font-sans lg:col-span-3">
        <div className={cardClass}>
          <div className="px-4 pt-4">
            <Skeleton className="mx-auto h-16 w-16 rounded-full" />
            <Skeleton className="mx-auto mt-3 h-4 w-32" />
            <Skeleton className="mx-auto mt-2 h-3 w-40" />
          </div>
          <div className="mt-2 border-t border-[#e0e0e0] p-4">
            <Skeleton className="h-4 w-full" />
          </div>
        </div>
        <div className={cardClass}>
          <Skeleton className="m-4 h-4 w-24" />
        </div>
      </aside>
    )
  }

  const displayName = isOwnProfile
    ? `${profile.first_name} ${profile.last_name}`.trim() || 'Complete your profile'
    : (memberQuery.data?.full_name ?? 'Member')
  const headline = isOwnProfile
    ? profile.headline.trim() || 'Add a headline'
    : (memberQuery.data?.headline ?? '')
  const loc = isOwnProfile ? profile.location.trim() || 'Add location' : (memberQuery.data?.location ?? '')
  const photo = isOwnProfile ? profile.profile_photo_url || null : (memberQuery.data?.profile_photo_url ?? null)
  const other = memberQuery.data
  const profileViews = isOwnProfile ? profile.profile_views : (other?.profile_views ?? 0)
  const postImpressions = isOwnProfile ? profile.post_impressions : (other?.post_impressions ?? 0)

  return (
    <aside
      className="sticky top-[74px] w-full space-y-3 self-start font-sans antialiased lg:col-span-3"
      style={{ color: 'rgba(0,0,0,0.9)' }}
    >
      <div className={cardClass}>
        <div className="px-4 pb-1 pt-4 text-center">
          <Avatar size="lg" name={displayName} src={photo ?? undefined} className="mx-auto h-16 w-16 text-lg" />
          <h2 className="mt-2.5 text-base font-bold text-[#000000e6]">{displayName}</h2>
          <p className="mt-0.5 text-sm font-normal text-[#00000099]">{headline}</p>
          <p className="mt-1.5 text-xs text-[#00000099]">{loc}</p>
        </div>

        <div className="mt-2 border-t border-[#e0e0e0] px-4 py-3">
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="shrink-0 pr-1 text-left text-[#00000099]">Who viewed your profile</span>
            <span className="shrink-0 text-right text-sm font-bold tabular-nums text-[#0a66c2]">{profileViews}</span>
          </div>
          <div className="mt-3 flex items-center justify-between gap-2 text-sm">
            <span className="shrink-0 pr-1 text-left text-[#00000099]">Impressions of your post</span>
            <span className="shrink-0 text-right text-sm font-bold tabular-nums text-[#0a66c2]">{postImpressions}</span>
          </div>
        </div>
      </div>

      <div className={cardClass}>
        <Link
          to="/feed"
          className={cn(
            'flex w-full items-center gap-2.5 border-0 bg-transparent px-4 py-3.5',
            'text-left text-sm font-bold text-[#000000e6] no-underline',
            'transition hover:bg-[#f3f2ef] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0a66c2]/30',
          )}
        >
          <Bookmark className="h-5 w-5 shrink-0 text-[#1f1f1f]" strokeWidth={1.8} aria-hidden />
          My items
        </Link>
      </div>
    </aside>
  )
}
