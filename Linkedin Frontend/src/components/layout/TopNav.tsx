import {
  Bell,
  BriefcaseBusiness,
  ChevronDown,
  Grid3X3,
  Home,
  MessageSquare,
  MonitorPlay,
  Search,
  Users,
} from 'lucide-react'
import { cloneElement, isValidElement, useMemo, useRef, useState, type ReactElement } from 'react'
import { NavLink, Link, useLocation, useNavigate } from 'react-router-dom'
import { Avatar, Dropdown, Input } from '../ui'
import { BrandMark } from './BrandMark'
import { InternalNavLogo } from './InternalNavLogo'
import { ingestEvent } from '../../api/analytics'
import { useAuthStore } from '../../store/authStore'
import { useProfileStore } from '../../store/profileStore'
import { cn } from '../../lib/cn'
import { useClickOutside } from '../../hooks/useClickOutside'
import { DIRECTORY_MEMBERS } from '../../lib/profileDirectory'
import { MOCK_JOBS } from '../../lib/jobsMockData'

type SearchSuggestion = {
  id: string
  title: string
  subtitle: string
  typeLabel: 'People' | 'Jobs' | 'Events' | 'News' | 'Groups' | 'Newsletters'
  to: string
  memberId?: string
}

function NavItem({
  to,
  label,
  icon,
  preload,
}: {
  to: string
  label: string
  icon: ReactElement<{ className?: string }>
  preload?: () => Promise<unknown>
}): JSX.Element {
  return (
    <NavLink
      to={to}
      onMouseEnter={() => {
        void preload?.()
      }}
      className={({ isActive }) =>
        cn(
          'relative flex h-[58px] min-w-[80px] max-w-[100px] flex-col items-center justify-center gap-0.5 border-b-[3px] border-transparent px-1.5 text-center text-[12px] leading-tight text-[#666666] transition hover:text-[#1f1f1f]',
          isActive && 'border-b-black font-semibold text-[#1f1f1f]',
        )
      }
    >
      {({ isActive }) => {
        const iconNode = isValidElement(icon)
          ? cloneElement(icon, {
              className: cn('h-6 w-6 shrink-0', isActive ? 'text-[#1f1f1f]' : 'text-[#666666]'),
            })
          : icon
        return (
          <>
            <span className="inline-flex">{iconNode}</span>
            <span
              className={cn(
                'max-w-full break-words text-center',
                isActive ? 'font-semibold text-[#1f1f1f]' : 'font-normal text-[#666666]',
              )}
            >
              {label}
            </span>
          </>
        )
      }}
    </NavLink>
  )
}

export function TopNav(): JSX.Element {
  const user = useAuthStore((state) => state.user)
  const clearAuth = useAuthStore((state) => state.clearAuth)
  const memberId = useProfileStore((s) => s.profile.member_id)
  const firstName = useProfileStore((s) => s.profile.first_name)
  const lastName = useProfileStore((s) => s.profile.last_name)
  const headline = useProfileStore((s) => s.profile.headline)
  const profilePhoto = useProfileStore((s) => s.profile.profile_photo_url)
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const jobsNavActive = pathname === '/jobs' || pathname.startsWith('/jobs/')
  const displayName = `${firstName} ${lastName}`.trim() || user?.full_name || 'Member'
  const profilePath = `/in/${memberId || user?.member_id || 'me'}`
  const activityPath = `${profilePath}/activity`
  const [searchQuery, setSearchQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const searchWrapRef = useRef<HTMLDivElement>(null)
  useClickOutside(searchWrapRef, () => setSearchOpen(false), searchOpen)

  const searchSuggestions = useMemo<SearchSuggestion[]>(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return []

    const ownMember = {
      member_id: memberId || user?.member_id || 'me',
      full_name: displayName,
      headline: headline || 'Add your headline',
    }
    const people = [ownMember, ...DIRECTORY_MEMBERS]
      .filter((m) => `${m.full_name} ${m.headline ?? ''}`.toLowerCase().includes(q))
      .slice(0, 3)
      .map((m) => ({
        id: `person-${m.member_id}`,
        title: m.full_name,
        subtitle: m.headline ?? 'Member',
        typeLabel: 'People' as const,
        to: `/in/${m.member_id}`,
        memberId: m.member_id,
      }))

    const jobs = MOCK_JOBS.filter((j) => `${j.title} ${j.company_name} ${j.location}`.toLowerCase().includes(q))
      .slice(0, 3)
      .map((j) => ({
        id: `job-${j.job_id}`,
        title: j.title,
        subtitle: `${j.company_name} · ${j.location}`,
        typeLabel: 'Jobs' as const,
        to: `/jobs/${j.job_id}`,
      }))

    const events = [
      { id: 'event-tech', title: 'Tech Networking Mixer', subtitle: 'San Jose · This week', to: '/events' },
      { id: 'event-ai', title: 'AI Builders Meetup', subtitle: 'Online · Friday', to: '/events' },
    ]
      .filter((e) => `${e.title} ${e.subtitle}`.toLowerCase().includes(q))
      .map((e) => ({ ...e, typeLabel: 'Events' as const }))

    const news = [
      { id: 'news-ai', title: 'Latest AI industry trends', subtitle: 'Top stories today', to: '/news' },
      { id: 'news-jobs', title: 'Hiring market updates', subtitle: 'Weekly snapshot', to: '/news' },
    ]
      .filter((n) => `${n.title} ${n.subtitle}`.toLowerCase().includes(q))
      .map((n) => ({ ...n, typeLabel: 'News' as const }))

    const groups = [
      { id: 'group-main', title: 'Professional Groups', subtitle: 'Communities and discussions', to: '/groups' },
    ]
      .filter((g) => `${g.title} ${g.subtitle}`.toLowerCase().includes(q))
      .map((g) => ({ ...g, typeLabel: 'Groups' as const }))

    const newsletters = [
      { id: 'letter-main', title: 'Career Newsletters', subtitle: 'Creators you can follow', to: '/newsletters' },
    ]
      .filter((n) => `${n.title} ${n.subtitle}`.toLowerCase().includes(q))
      .map((n) => ({ ...n, typeLabel: 'Newsletters' as const }))

    return [...people, ...jobs, ...events, ...news, ...groups, ...newsletters].slice(0, 10)
  }, [displayName, headline, memberId, searchQuery, user?.member_id])

  function navigateFromSearch(item: SearchSuggestion): void {
    navigate(item.to)
    setSearchOpen(false)
    setSearchQuery('')
    if (item.typeLabel === 'People' && item.memberId && user?.member_id) {
      void ingestEvent({
        event_type: 'profile.searched',
        trace_id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        actor_id: user.member_id,
        entity: { entity_type: 'member', entity_id: item.memberId },
        idempotency_key: `profile-searched-${user.member_id}-${item.memberId}-${Date.now()}`,
        metadata: { query: searchQuery.trim() },
      })
    }
  }

  return (
    <header className="sticky top-0 z-40 h-[58px] border-b border-border bg-white">
      <div className="mx-auto flex h-full max-w-[1128px] items-center justify-between gap-1 px-3 lg:px-0">
        <div className="flex min-w-0 flex-1 items-center gap-1 sm:gap-2">
          <Link to="/feed" className="shrink-0" aria-label="Go to feed">
            <InternalNavLogo />
          </Link>
          <div ref={searchWrapRef} className="relative hidden min-w-0 max-w-[280px] flex-1 md:block">
            <Input
              aria-label="Search"
              placeholder="I'm looking for…"
              leftIcon={<Search className="h-4 w-4" />}
              value={searchQuery}
              onFocus={() => setSearchOpen(true)}
              onChange={(e) => {
                setSearchQuery(e.target.value)
                setSearchOpen(true)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setSearchOpen(false)
                }
                if (e.key === 'Enter' && searchSuggestions.length > 0) {
                  e.preventDefault()
                  const first = searchSuggestions[0]
                  if (first) {
                    navigateFromSearch(first)
                  }
                }
              }}
              className="h-10 rounded-full border border-[#d0d0d0] bg-white pl-10 text-sm placeholder:text-[#666666] focus:border-[#0a66c2]"
            />
            {searchOpen && searchQuery.trim() ? (
              <div className="absolute left-0 right-0 top-[44px] z-50 overflow-hidden rounded-xl border border-[#d0d0d0] bg-white shadow-[0_4px_12px_rgba(0,0,0,0.15)]">
                {searchSuggestions.length > 0 ? (
                  <ul className="max-h-[360px] overflow-y-auto py-1">
                    {searchSuggestions.map((item) => (
                      <li key={item.id}>
                        <button
                          type="button"
                          className="flex w-full items-start justify-between gap-2 px-3 py-2 text-left hover:bg-[#f3f2ef]"
                          onClick={() => {
                            navigateFromSearch(item)
                          }}
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-semibold text-[#1f1f1f]">{item.title}</span>
                            <span className="block truncate text-xs text-[#666666]">{item.subtitle}</span>
                          </span>
                          <span className="shrink-0 rounded-full bg-[#eef3f8] px-2 py-0.5 text-[11px] text-[#0a66c2]">
                            {item.typeLabel}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="px-3 py-3 text-sm text-[#666666]">No matches found.</p>
                )}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            aria-label="Search"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#666666] hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0a66c2] focus-visible:ring-offset-2 md:hidden"
          >
            <Search className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <nav className="flex h-full min-w-0 items-center">
          <NavItem
            to="/feed"
            label="Home"
            icon={<Home aria-hidden />}
            preload={() => import('../../features/feed/FeedPage')}
          />
          <NavItem
            to="/mynetwork"
            label="My Network"
            icon={<Users aria-hidden />}
            preload={() => import('../../features/network/NetworkPage')}
          />
          <Dropdown.Root>
            <Dropdown.Trigger
              showEndChevron
              className={cn(
                'relative flex h-[58px] min-w-[80px] max-w-[100px] flex-col items-center justify-center gap-0.5 rounded-none border-b-[3px] border-transparent px-1.5 text-[12px] leading-tight text-center shadow-none hover:bg-transparent',
                jobsNavActive ? 'border-b-black font-semibold text-[#1f1f1f]' : 'font-normal text-[#666666] hover:text-[#1f1f1f]',
              )}
            >
              <BriefcaseBusiness
                className={cn('h-6 w-6 shrink-0', jobsNavActive ? 'text-[#1f1f1f]' : 'text-[#666666]')}
                aria-hidden
              />
              <span
                className={cn(
                  'inline-flex max-w-full items-center justify-center gap-0.5 break-words',
                  jobsNavActive ? 'font-semibold text-[#1f1f1f]' : 'font-normal text-[#666666]',
                )}
              >
                Jobs
              </span>
            </Dropdown.Trigger>
            <Dropdown.Content className="left-0 right-auto min-w-44">
              <Dropdown.Item
                onSelect={() => {
                  void import('../../features/jobs/JobsDiscoveryPage')
                  navigate('/jobs')
                }}
              >
                Search jobs
              </Dropdown.Item>
              <Dropdown.Item
                onSelect={() => {
                  void import('../../features/jobs/JobTrackerPage')
                  navigate('/jobs/tracker')
                }}
              >
                Job Tracker
              </Dropdown.Item>
            </Dropdown.Content>
          </Dropdown.Root>
          <NavItem
            to="/messaging"
            label="Messaging"
            icon={<MessageSquare aria-hidden />}
            preload={() => import('../../features/messaging/MessagingPage')}
          />
          <NavItem
            to="/notifications"
            label="Notifications"
            icon={<Bell aria-hidden />}
            preload={() => import('../../features/notifications/NotificationsPage')}
          />

          <Dropdown.Root>
            <Dropdown.Trigger
              showEndChevron={false}
              className="h-[58px] min-w-[64px] max-w-[80px] flex-col justify-center gap-0.5 rounded-none border-b-[3px] border-transparent px-1.5 py-0 text-[12px] text-[#666666] hover:bg-transparent hover:text-[#1f1f1f]"
            >
              <Avatar size="xs" name={displayName} src={profilePhoto || user?.profile_photo_url || undefined} />
              <span className="inline-flex items-center gap-0.5 font-normal">
                Me
                <ChevronDown className="h-3 w-3 shrink-0" aria-hidden />
              </span>
            </Dropdown.Trigger>
            <Dropdown.Content className="left-auto right-0 w-[min(100vw-1rem,300px)] min-w-[288px] py-0 shadow-[0_0_0_1px_rgba(0,0,0,0.08),0_4px_12px_rgba(0,0,0,0.15)]">
              <div className="flex gap-3 border-b border-[#e0e0e0] px-4 py-3">
                <Avatar
                  size="md"
                  name={displayName}
                  src={profilePhoto || user?.profile_photo_url || undefined}
                  className="shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="text-base font-semibold leading-tight text-[#1f1f1f]">{displayName}</p>
                    <span className="inline-flex shrink-0" aria-hidden title="Member badge">
                      <BrandMark size={18} className="h-[18px] w-[18px]" />
                    </span>
                  </div>
                  <p className="mt-1.5 text-sm leading-snug text-[#1f1f1f]">{headline || 'Add your headline'}</p>
                </div>
              </div>

              <div className="border-b border-[#e0e0e0] px-4 py-3">
                <Dropdown.Item
                  className="rounded-full border border-[#0a66c2] bg-white py-2.5 !text-center font-semibold text-[#0a66c2] hover:bg-[#70b5f9]/15 focus-visible:ring-[#0a66c2]"
                  onSelect={() => navigate(profilePath)}
                >
                  View profile
                </Dropdown.Item>
              </div>

              <div className="py-1" role="presentation">
                <p className="px-4 pb-1 pt-2 text-xs font-semibold text-[#1f1f1f]">Account</p>
                <Dropdown.Item
                  className="font-normal text-[#666666] hover:text-[#1f1f1f]"
                  onSelect={() => navigate('/premium')}
                >
                  <span className="flex items-center gap-2">
                    <span
                      className="h-4 w-4 shrink-0 rounded-sm bg-gradient-to-br from-amber-300 to-amber-700"
                      aria-hidden
                    />
                    Premium features
                  </span>
                </Dropdown.Item>
                <Dropdown.Item
                  className="font-normal text-[#666666] hover:text-[#1f1f1f]"
                  onSelect={() => navigate('/settings')}
                >
                  Settings &amp; Privacy
                </Dropdown.Item>
                <Dropdown.Item className="font-normal text-[#666666] hover:text-[#1f1f1f]" onSelect={() => navigate('/help')}>
                  Help
                </Dropdown.Item>
              </div>

              <div className="border-t border-[#e0e0e0] py-1" role="presentation">
                <p className="px-4 pb-1 pt-2 text-xs font-semibold text-[#1f1f1f]">Manage</p>
                <Dropdown.Item className="font-normal text-[#666666] hover:text-[#1f1f1f]" onSelect={() => navigate(activityPath)}>
                  Posts &amp; Activity
                </Dropdown.Item>
                <Dropdown.Item
                  className="font-normal text-[#666666] hover:text-[#1f1f1f]"
                  onSelect={() => navigate('/job-posting-activity')}
                >
                  Job posting activity
                </Dropdown.Item>
              </div>

              <div className="border-t border-[#e0e0e0] py-1">
                <Dropdown.Item
                  className="font-normal text-[#666666] hover:text-[#1f1f1f]"
                  onSelect={() => {
                    clearAuth()
                    navigate('/login')
                  }}
                >
                  Sign Out
                </Dropdown.Item>
              </div>
            </Dropdown.Content>
          </Dropdown.Root>

          <div className="mx-1.5 hidden h-8 w-px self-center bg-border lg:block" />

          <div className="hidden items-center gap-1 lg:flex">
            <Dropdown.Root>
              <Dropdown.Trigger
                showEndChevron={false}
                className="flex h-[58px] min-w-[100px] max-w-[120px] flex-col items-center justify-center gap-1 rounded-none border-b-[3px] border-transparent px-2 py-0 text-[12px] font-normal text-[#666666] shadow-none hover:bg-transparent hover:text-[#1f1f1f] focus-visible:ring-0 focus-visible:ring-offset-0"
              >
                <Grid3X3 className="h-6 w-6 shrink-0 text-[#666666]" strokeWidth={1.75} aria-hidden />
                <span className="inline-flex max-w-full items-center justify-center gap-0.5 whitespace-nowrap leading-tight">
                  For Business
                  <ChevronDown className="h-2.5 w-2.5 shrink-0 text-[#666666]" strokeWidth={2.5} aria-hidden />
                </span>
              </Dropdown.Trigger>
              <Dropdown.Content>
                <Dropdown.Item>Services coming soon</Dropdown.Item>
              </Dropdown.Content>
            </Dropdown.Root>

            <NavLink
              to="/learning"
              className={({ isActive }) =>
                cn(
                  'flex h-[58px] min-w-[80px] max-w-[100px] flex-col items-center justify-center gap-0.5 border-b-[3px] border-transparent px-1.5 text-center text-[12px] leading-tight text-[#666666] transition hover:text-[#1f1f1f]',
                  isActive && 'border-b-black font-semibold text-[#1f1f1f]',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <MonitorPlay className={cn('h-6 w-6 shrink-0', isActive ? 'text-[#1f1f1f]' : 'text-[#666666]')} strokeWidth={1.75} aria-hidden />
                  <span className={isActive ? 'font-semibold text-[#1f1f1f]' : 'font-normal text-[#666666]'}>Learning</span>
                </>
              )}
            </NavLink>
          </div>
        </nav>
      </div>
    </header>
  )
}
