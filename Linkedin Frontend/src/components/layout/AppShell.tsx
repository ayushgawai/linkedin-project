import type { ReactNode } from 'react'
import { useMemo } from 'react'
import { useSessionPresenceSync } from '../../hooks/useSessionPresenceSync'
import { useQuery } from '@tanstack/react-query'
import { matchPath, Navigate, Outlet, useLocation } from 'react-router-dom'
import { getMemberDashboard } from '../../api/analytics'
import { cn } from '../../lib/cn'
import { isJobsHubMinimalRailsPath } from '../../lib/jobsLayoutPaths'
import { useAuthStore } from '../../store/authStore'
import { toMemberProfile, useProfileStore } from '../../store/profileStore'
import type { Member } from '../../types'
import { LeftRail } from './LeftRail'
import { ProfileLeftRail } from './ProfileLeftRail'
import { SavedLeftRail } from './SavedLeftRail'
import { SavedPromotedRail } from './SavedPromotedRail'
import { MobileBottomNav } from './MobileBottomNav'
import { PageContainer } from './PageContainer'
import { RightRail } from './RightRail'
import { TopNav } from './TopNav'
import { FloatingMessagingDock } from '../messaging/FloatingMessagingDock'

type AppShellProps = {
  leftRail?: ReactNode | null
  rightRail?: ReactNode | null
  protectedRoute?: boolean
  mainColumnClassName?: string
}

/** Fallback before auth resolves; not shown as a real user profile. */
const DEMO_MEMBER: Member = {
  member_id: 'pending',
  email: '',
  full_name: 'Member',
  headline: null,
  bio: null,
  location: null,
  skills: [],
  profile_photo_url: null,
  cover_photo_url: null,
  is_premium: false,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
}

function AppLeftRail({ user: authUser }: { user: Member }): JSX.Element {
  const profile = useProfileStore((s) => s.profile)
  const mergedUser = useMemo(() => {
    if (profile.member_id && authUser.member_id === profile.member_id) {
      const fromStore = toMemberProfile(profile)
      return { ...fromStore, role: (authUser as Member & { role?: 'member' | 'recruiter' }).role }
    }
    return authUser
  }, [authUser, profile])

  const { data, isPending } = useQuery({
    queryKey: ['member-dashboard', mergedUser.member_id, '7d'],
    queryFn: () => getMemberDashboard(mergedUser.member_id, '7d'),
    staleTime: 60_000,
  })
  return (
    <LeftRail
      user={mergedUser}
      profileViewers={data?.kpis.profile_views.value ?? 0}
      postImpressions={data?.kpis.post_impressions.value ?? 0}
      statsLoading={isPending}
      isPremium={mergedUser.is_premium === true}
      showPremiumLink={mergedUser.is_premium === true}
    />
  )
}

export function AppShell({ leftRail, rightRail, protectedRoute = true, mainColumnClassName }: AppShellProps): JSX.Element {
  const user = useAuthStore((state) => state.user)
  useSessionPresenceSync(user?.member_id)
  const location = useLocation()
  const pathWithoutTrailingSlash = useMemo(
    () => location.pathname.replace(/\/+$/, '') || '/',
    [location.pathname],
  )
  const isProfileRoute = useMemo(
    () => matchPath({ path: '/in/:memberId', end: true, caseSensitive: false }, pathWithoutTrailingSlash) != null,
    [pathWithoutTrailingSlash],
  )
  const isSavedRoute = useMemo(
    () => matchPath({ path: '/saved', end: true, caseSensitive: false }, pathWithoutTrailingSlash) != null,
    [pathWithoutTrailingSlash],
  )
  const isJobTrackerRoute = useMemo(
    () => matchPath({ path: '/jobs/tracker', end: true, caseSensitive: false }, pathWithoutTrailingSlash) != null,
    [pathWithoutTrailingSlash],
  )
  const isJobsHubRoute = useMemo(() => isJobsHubMinimalRailsPath(pathWithoutTrailingSlash), [pathWithoutTrailingSlash])

  if (protectedRoute && !user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  const noSidebars = isJobTrackerRoute || (leftRail === null && rightRail === null)
  const hideLeftRailColumn =
    (leftRail === null && rightRail !== null) ||
    (leftRail === undefined && isJobsHubRoute && rightRail !== null)
  const hideRightRailColumn = isJobsHubRoute && rightRail === undefined

  return (
    <div className="min-h-screen bg-surface pb-20 lg:pb-0">
      <TopNav />
      {noSidebars ? (
        <PageContainer className="pt-4">
          <main
            id="main-content"
            className={cn('col-span-12 min-h-[calc(100vh-90px)]', mainColumnClassName)}
          >
            <Outlet />
          </main>
        </PageContainer>
      ) : (
        <PageContainer className="pt-4">
          {!hideLeftRailColumn ? (
            <div className="hidden lg:col-span-3 lg:block">
              {leftRail === undefined ? (
                isProfileRoute ? (
                  <ProfileLeftRail />
                ) : isSavedRoute ? (
                  <SavedLeftRail />
                ) : (
                  <AppLeftRail user={user ?? DEMO_MEMBER} />
                )
              ) : (
                leftRail
              )}
            </div>
          ) : null}
          <main
            id="main-content"
            className={cn(
              'col-span-12 min-h-[calc(100vh-90px)] md:col-span-8',
              hideLeftRailColumn && hideRightRailColumn
                ? 'lg:col-span-12'
                : hideLeftRailColumn
                  ? 'lg:col-span-8'
                  : 'lg:col-span-6',
              mainColumnClassName,
            )}
          >
            <Outlet />
          </main>
          {!hideRightRailColumn ? (
            <div className={cn('col-span-4 hidden md:block', hideLeftRailColumn ? 'lg:col-span-4' : 'lg:col-span-3')}>
              {rightRail === undefined ? (isSavedRoute ? <SavedPromotedRail /> : <RightRail />) : rightRail}
            </div>
          ) : null}
        </PageContainer>
      )}
      <MobileBottomNav />
      {user ? <FloatingMessagingDock /> : null}
    </div>
  )
}
