import { Bookmark, CalendarDays, Newspaper, Target, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { Member } from '../../types'
import { BrandMark } from './BrandMark'
import { Avatar, Skeleton } from '../ui'
import { cn } from '../../lib/cn'
import { useProfileStore } from '../../store/profileStore'

type LeftRailProps = {
  user: Member | null
  loading?: boolean
  profileViewers: number
  postImpressions: number
  statsLoading?: boolean
  isPremium?: boolean
  showPremiumLink?: boolean
}

function railCardClassName(extra?: string): string {
  return cn('overflow-hidden rounded-lg border border-border bg-white', extra)
}

function ProfileSummaryCard({
  user,
  isPremium = false,
}: {
  user: Member
  isPremium?: boolean
}): JSX.Element {
  const cover = user.cover_photo_url

  return (
    <div className={railCardClassName('relative')}>
      <div
        className={cn('relative h-14 w-full', !cover && 'bg-gradient-to-r from-orange-400 via-rose-500 to-slate-700')}
        style={
          cover
            ? { backgroundImage: `url(${cover})`, backgroundSize: 'cover', backgroundPosition: 'center' }
            : undefined
        }
      >
        {isPremium ? (
          <span
            className="absolute right-3 top-2 text-xs font-semibold text-white"
            style={{ textShadow: '0 1px 3px rgba(0,0,0,0.6)' }}
            aria-label="Premium member"
          >
            Premium
          </span>
        ) : null}
      </div>

      <div className="px-4 pb-3">
        <div className="relative -mt-10 ml-4">
          <Avatar
            name={user.full_name}
            imageAlt={`${user.full_name} profile photo`}
            size="lg"
            src={user.profile_photo_url}
            className="!h-[72px] !w-[72px] min-h-[72px] min-w-[72px] border-0 ring-4 ring-white"
          />
        </div>

        <div className="mt-2">
          <div className="flex items-center gap-1">
            <h2 className="text-lg font-bold leading-tight text-text-primary">{user.full_name}</h2>
            <span
              className="inline-flex h-4 w-4 shrink-0 items-center justify-center overflow-hidden rounded-[3px] [&_rect]:!fill-amber-800"
              aria-hidden="true"
              title="Member badge"
            >
              <BrandMark size={16} className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-1 line-clamp-2 text-sm leading-snug text-text-primary">
            {user.headline?.trim() ? user.headline : <span className="italic text-text-tertiary">Add a headline</span>}
          </p>
          {user.location ? (
            <p className="mt-1 text-sm text-text-secondary">{user.location}</p>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function formatStatValue(n: number, loading: boolean): string {
  if (loading) return ''
  if (n === 0) return '—'
  return String(n)
}

function ProfileStatsCard({
  profileViewers,
  postImpressions,
  statsLoading,
  showPremiumLink = false,
}: {
  profileViewers: number
  postImpressions: number
  statsLoading: boolean
  showPremiumLink?: boolean
}): JSX.Element {
  const pv = formatStatValue(profileViewers, statsLoading)
  const pi = formatStatValue(postImpressions, statsLoading)
  const pvLabel =
    profileViewers > 0 ? `${profileViewers} profile viewers in the last 7 days` : 'No profile viewers in the last 7 days'
  const piLabel =
    postImpressions > 0
      ? `${postImpressions} post impressions in the last 7 days`
      : 'No post impressions in the last 7 days'

  return (
    <div className={railCardClassName()}>
      <div className="px-4 py-3">
        <Link
          to="/analytics"
          className="-mx-4 flex items-center justify-between gap-2 px-4 py-1 transition hover:bg-black/[0.03]"
        >
          <span className="text-sm font-semibold text-text-primary">Profile viewers</span>
          {statsLoading ? (
            <Skeleton className="h-4 w-8" />
          ) : (
            <span className="text-sm font-semibold text-brand-primary" aria-label={pvLabel}>
              {pv}
            </span>
          )}
        </Link>
        <Link
          to="/analytics"
          className="-mx-4 flex items-center justify-between gap-2 px-4 py-1 transition hover:bg-black/[0.03]"
        >
          <span className="text-sm font-semibold text-text-primary">Post impressions</span>
          {statsLoading ? (
            <Skeleton className="h-4 w-8" />
          ) : (
            <span className="text-sm font-semibold text-brand-primary" aria-label={piLabel}>
              {pi}
            </span>
          )}
        </Link>
        {showPremiumLink ? (
          <>
            <div className="-mx-4 my-2 border-t border-border" />
            <Link
              to="/premium"
              className="-mx-4 flex items-center gap-2 px-4 py-1 transition hover:bg-black/[0.03]"
            >
              <span className="relative flex h-4 w-4 shrink-0" aria-hidden>
                <span className="absolute right-0 top-0 h-2.5 w-2.5 rounded-sm bg-amber-500" />
                <span className="absolute bottom-0 left-0 h-2.5 w-2.5 rounded-sm bg-amber-600" />
              </span>
              <span className="text-sm font-semibold text-text-primary">Your Premium features</span>
            </Link>
          </>
        ) : null}
      </div>
    </div>
  )
}

const quickLinkRowClass = '-mx-4 flex items-center gap-3 rounded-none px-4 py-1.5 transition hover:bg-black/[0.03]'

function QuickLinksCard(): JSX.Element {
  return (
    <div className={railCardClassName()}>
      <div className="flex flex-col gap-1 px-4 py-3">
        <Link to="/saved" className={quickLinkRowClass}>
          <Bookmark className="h-5 w-5 shrink-0 text-text-primary" strokeWidth={2} aria-hidden />
          <span className="text-sm font-semibold text-text-primary">Saved items</span>
        </Link>
        <Link to="/jobs/tracker" className={quickLinkRowClass}>
          <Target className="h-5 w-5 shrink-0 text-text-primary" strokeWidth={2} aria-hidden />
          <span className="text-sm font-semibold text-text-primary">Job Tracker</span>
        </Link>
        <Link to="/groups" className={quickLinkRowClass}>
          <Users className="h-5 w-5 shrink-0 text-text-primary" strokeWidth={2} aria-hidden />
          <span className="text-sm font-semibold text-text-primary">Groups</span>
        </Link>
        <Link to="/newsletters" className={quickLinkRowClass}>
          <Newspaper className="h-5 w-5 shrink-0 text-text-primary" strokeWidth={2} aria-hidden />
          <span className="text-sm font-semibold text-text-primary">Newsletters</span>
        </Link>
        <Link to="/events" className={quickLinkRowClass}>
          <CalendarDays className="h-5 w-5 shrink-0 text-text-primary" strokeWidth={2} aria-hidden />
          <span className="text-sm font-semibold text-text-primary">Events</span>
        </Link>
      </div>
    </div>
  )
}

function LeftRailSkeleton(): JSX.Element {
  const navCard = (
    <div className={railCardClassName()}>
      <div className="space-y-1 px-4 py-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 py-1.5">
            <Skeleton className="h-5 w-5" />
            <Skeleton className="h-4 w-24" />
          </div>
        ))}
      </div>
    </div>
  )
  return (
    <aside className="sticky top-[68px] hidden gap-2 self-start lg:col-span-3 lg:flex lg:flex-col">
      <div className={railCardClassName()}>
        <Skeleton className="h-14 w-full rounded-t-none" />
        <div className="px-4 pb-3">
          <div className="relative -mt-10 ml-4">
            <Skeleton className="h-[72px] w-[72px] rounded-full" />
          </div>
          <div className="mt-2 space-y-2 pl-0">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-[75%]" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        </div>
      </div>
      <div className={railCardClassName()}>
        <div className="space-y-2 px-4 py-3">
          <div className="flex justify-between">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-6" />
          </div>
          <div className="flex justify-between">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-6" />
          </div>
        </div>
      </div>
      {navCard}
    </aside>
  )
}

export function LeftRail({
  user,
  loading = false,
  profileViewers,
  postImpressions,
  statsLoading = false,
  isPremium = false,
  showPremiumLink = false,
}: LeftRailProps): JSX.Element {
  const profileFirstName = useProfileStore((s) => s.profile.first_name)
  const profileLastName = useProfileStore((s) => s.profile.last_name)
  const profileHeadline = useProfileStore((s) => s.profile.headline)
  const profileLocation = useProfileStore((s) => s.profile.location)
  const profileAvatar = useProfileStore((s) => s.profile.profile_photo_url)
  const profileCover = useProfileStore((s) => s.profile.cover_photo_url)
  const profileViews = useProfileStore((s) => s.profile.profile_views)
  const postViews = useProfileStore((s) => s.profile.post_impressions)

  if (loading || !user) {
    return <LeftRailSkeleton />
  }
  const fullName = `${profileFirstName} ${profileLastName}`.trim()
  const resolvedUser: Member = {
    ...user,
    full_name: fullName || user.full_name,
    headline: profileHeadline || user.headline,
    location: profileLocation || user.location,
    profile_photo_url: profileAvatar || user.profile_photo_url,
    cover_photo_url: profileCover || user.cover_photo_url,
    profile_views: profileViews,
    post_impressions: postViews,
  }
  const resolvedProfileViewers = profileViews || profileViewers
  const resolvedPostImpressions = postViews || postImpressions

  return (
    <aside className="sticky top-[68px] hidden gap-2 self-start lg:col-span-3 lg:flex lg:flex-col">
      <ProfileSummaryCard user={resolvedUser} isPremium={isPremium} />
      <ProfileStatsCard
        profileViewers={resolvedProfileViewers}
        postImpressions={resolvedPostImpressions}
        statsLoading={statsLoading}
        showPremiumLink={showPremiumLink}
      />
      <QuickLinksCard />
    </aside>
  )
}
