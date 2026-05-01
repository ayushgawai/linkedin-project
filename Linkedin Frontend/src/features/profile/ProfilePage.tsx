import { Suspense, lazy, memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  BarChart3,
  Camera,
  ChevronRight,
  Diamond,
  Eye,
  ExternalLink,
  FolderOpen,
  Globe2,
  MessageCircle,
  Pencil,
  Plus,
  Repeat2,
  Search,
  Send,
  Sparkles,
  Target,
  ThumbsUp,
  Users,
  X,
} from 'lucide-react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { createPost } from '../../api/posts'
import { ingestEvent } from '../../api/analytics'
import { getMember } from '../../api/profile'
import { listConnections, requestConnection } from '../../api/connections'
import { openThread } from '../../api/messaging'
import { BrandMark } from '../../components/layout/BrandMark'
import { FEED_QUERY_KEY } from '../../components/feed/PostFeed'
import { PostOptionsMenu } from '../../components/feed/PostOptionsMenu'
import { Avatar, Button, Card, Dropdown, Input, Modal, Skeleton, Textarea } from '../../components/ui'
import { cn } from '../../lib/cn'
import { useAuthStore } from '../../store/authStore'
import { useProfileStore } from '../../store/profileStore'
import { useGroupsStore } from '../../store/groupsStore'
import { useNewslettersStore } from '../../store/newslettersStore'
import type { Member } from '../../types'
import type { ListFeedResponse, Post } from '../../types/feed'
import { ProfileModals, type ProfileModalKey } from './ProfileModals'

const CreatePostModal = lazy(async () => {
  const m = await import('../../components/feed/CreatePostModal')
  return { default: m.CreatePostModal }
})

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join('') || '?'
}

function SectionHeader({
  title,
  own,
  onAdd,
  onEdit,
}: {
  title: string
  own: boolean
  onAdd?: () => void
  onEdit?: () => void
}): JSX.Element {
  return (
    <Card.Header className="flex items-center justify-between">
      <h2 className="text-xl font-semibold text-text-primary">{title}</h2>
      {own ? (
        <div className="flex items-center gap-1">
          {onAdd ? (
            <button type="button" className="rounded-full p-1.5 hover:bg-black/5" onClick={onAdd} aria-label={`Add ${title}`}>
              <Plus className="h-4 w-4" />
            </button>
          ) : null}
          {onEdit ? (
            <button type="button" className="rounded-full p-1.5 hover:bg-black/5" onClick={onEdit} aria-label={`Edit ${title}`}>
              <Pencil className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      ) : null}
    </Card.Header>
  )
}

const ProfileSkeleton = memo(function ProfileSkeleton(): JSX.Element {
  return (
    <div className="space-y-4">
      <Card>
        <Skeleton className="h-[180px] w-full rounded-b-none md:h-[200px]" />
        <Card.Body>
          <Skeleton className="h-20 w-20 rounded-full -mt-10" />
          <Skeleton className="mt-3 h-6 w-1/3" />
        </Card.Body>
      </Card>
    </div>
  )
})

export default function ProfilePage(): JSX.Element {
  const { memberId = '' } = useParams<{ memberId: string }>()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const authUser = useAuthStore((s) => s.user)
  const profile = useProfileStore((s) => s.profile)
  const completionPct = useProfileStore((s) => s.completionPercentage())
  const completionDismissed = useProfileStore((s) => s.completionCardDismissed)
  const setCompletionDismissed = useProfileStore((s) => s.setCompletionCardDismissed)
  const dismissSuggestion = useProfileStore((s) => s.dismissSuggestion)
  const isSuggestionDismissed = useProfileStore((s) => s.isSuggestionDismissed)
  const [modal, setModal] = useState<ProfileModalKey>(null)
  const [editId, setEditId] = useState<string | null>(null)
  const [editingPostId, setEditingPostId] = useState<string | null>(null)
  const [editingPostText, setEditingPostText] = useState('')
  const [editingPostImage, setEditingPostImage] = useState('')
  const [deletingPostId, setDeletingPostId] = useState<string | null>(null)
  const editImageInputRef = useRef<HTMLInputElement>(null)
  const [postOpen, setPostOpen] = useState(false)
  const createPostMutation = useMutation({
    mutationFn: createPost,
    onSuccess: (newPost) => {
      queryClient.setQueriesData<{ pages: ListFeedResponse[]; pageParams: number[] }>(
        { queryKey: [FEED_QUERY_KEY] },
        (existing) => {
          if (!existing || existing.pages.length === 0) {
            return existing
          }
          const [firstPage, ...restPages] = existing.pages
          return {
            ...existing,
            pages: [
              {
                ...firstPage,
                posts: [newPost, ...firstPage.posts],
              },
              ...restPages,
            ],
          }
        },
      )
      void queryClient.invalidateQueries({ queryKey: [FEED_QUERY_KEY] })
      setPostOpen(false)
    },
  })
  const [activityTab, setActivityTab] = useState<'Posts' | 'Comments' | 'Images'>('Posts')
  const [interestsTab, setInterestsTab] = useState<'Companies' | 'Groups' | 'Newsletters'>('Companies')
  const groups = useGroupsStore((s) => s.groups)
  const newsletters = useNewslettersStore((s) => s.newsletters)
  const followedCompanyIds = useProfileStore((s) => s.followedCompanyIds)

  const ownsByStore = Boolean(profile.member_id && memberId === profile.member_id)
  const ownsByAuth =
    Boolean(authUser?.member_id && memberId === authUser.member_id) &&
    (!profile.member_id || profile.member_id === authUser?.member_id)
  const isOwnProfile = Boolean(memberId && (ownsByStore || ownsByAuth))

  const otherQuery = useQuery({
    queryKey: ['member', memberId],
    queryFn: () => getMember(memberId),
    enabled: Boolean(memberId) && !isOwnProfile,
  })

  const connectionsQuery = useQuery({
    queryKey: ['connections', authUser?.member_id],
    queryFn: () => (authUser?.member_id ? listConnections(authUser.member_id) : Promise.resolve([])),
    enabled: Boolean(authUser?.member_id) && !isOwnProfile,
  })

  const [requestSent, setRequestSent] = useState(false)
  const connectMutation = useMutation({
    mutationFn: async () => {
      if (!authUser?.member_id) throw new Error('Not authenticated')
      await requestConnection(authUser.member_id, memberId)
    },
    onSuccess: () => {
      setRequestSent(true)
    },
    onError: () => {
      // If backend returns 409 for pending/connected, still show a stable state via connectionsQuery
      setRequestSent(true)
    },
  })

  // Reset "request sent" when navigating between profiles.
  useEffect(() => {
    setRequestSent(false)
  }, [memberId])

  const viewerId = authUser?.member_id || profile.member_id || ''
  const isConnected = useMemo(() => {
    if (!viewerId || !memberId) return false
    return (connectionsQuery.data ?? []).some((c) => {
      if (c.status !== 'accepted') return false
      const peerId = c.requester_member_id === viewerId ? c.addressee_member_id : c.requester_member_id
      return peerId === memberId
    })
  }, [connectionsQuery.data, memberId, viewerId])

  useEffect(() => {
    if (completionPct >= 100 && !completionDismissed) {
      setCompletionDismissed(true)
    }
  }, [completionPct, completionDismissed, setCompletionDismissed])

  useLayoutEffect(() => {
    if (!memberId || memberId === 'me') return
    const u = useAuthStore.getState().user
    if (!u?.member_id || u.member_id !== memberId) return
    if (!useProfileStore.getState().profile.member_id) {
      useProfileStore.getState().patchProfile({ member_id: u.member_id })
    }
  }, [memberId])

  useEffect(() => {
    if (!authUser?.member_id || !memberId) return
    if (isOwnProfile) return
    if (!otherQuery.data) return
    void ingestEvent({
      event_type: 'profile.viewed',
      trace_id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      actor_id: authUser.member_id,
      entity: { entity_type: 'member', entity_id: memberId },
      idempotency_key: `profile-viewed-${authUser.member_id}-${memberId}-${Date.now()}`,
      metadata: { source: 'profile-page' },
    })
  }, [authUser?.member_id, isOwnProfile, memberId, otherQuery.data])

  if (memberId === 'me') {
    const target = profile.member_id || authUser?.member_id
    if (target) return <Navigate to={`/in/${target}`} replace />
    return <Navigate to="/feed" replace />
  }

  if (!memberId) return <Navigate to="/404" replace />

  if (!isOwnProfile) {
    if (otherQuery.isPending) return <ProfileSkeleton />
    if (otherQuery.isError || !otherQuery.data) return <Navigate to="/404" replace />
  }

  const other = otherQuery.data
  const ownMemberId = profile.member_id || authUser?.member_id || memberId
  const display: Member = isOwnProfile
    ? {
        member_id: ownMemberId,
        email: profile.email,
        full_name: `${profile.first_name} ${profile.last_name}`.trim() || 'Member',
        headline: profile.headline || null,
        bio: profile.about || null,
        location: profile.location || null,
        skills: profile.skills.map((s) => s.name),
        profile_photo_url: profile.profile_photo_url || null,
        cover_photo_url: profile.cover_photo_url || null,
        is_premium: profile.is_premium,
        connections_count: profile.connections_count,
        followers_count: profile.followers_count,
        profile_views: profile.profile_views,
        post_impressions: profile.post_impressions,
        search_appearances: profile.search_appearances,
        is_open_to_work: profile.is_open_to_work,
        open_to_work_details: profile.open_to_work_details.location
          ? `${profile.open_to_work_details.location} · ${profile.open_to_work_details.workplace_type}`
          : undefined,
        experiences: profile.experience,
        educations: profile.education,
        licenses: profile.licenses,
        projects: profile.projects,
        courses: profile.courses,
        featured: profile.featured,
        activity_posts: profile.activity_posts,
        interests: {
          topVoices: profile.interests.top_voices,
          companies: profile.interests.companies,
          groups: profile.interests.groups,
          newsletters: profile.interests.newsletters,
          schools: profile.interests.schools,
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
    : other!

  const own = isOwnProfile
  const fullName = display.full_name
  const showCompletionCard = own && !completionDismissed && completionPct < 100
  const companyDirectory = [
    { id: 'co-f1', name: 'Nimbus Labs', tagline: 'Cloud analytics' },
    { id: 'co-f2', name: 'Vertex Forge', tagline: 'Developer tools' },
    { id: 'co-f3', name: 'Futura Stack', tagline: 'AI infrastructure' },
  ]
  const interestCompanies = own
    ? companyDirectory.filter((c) => followedCompanyIds.includes(c.id))
    : (display.interests?.companies ?? []).map((c) => ({ id: c.id, name: c.name, tagline: c.industry }))
  const interestGroups = groups.filter((g) => g.members.includes(display.member_id))
  const interestNewsletters = newsletters.filter((n) => n.createdBy === display.member_id)

  function mutateFeedPost(postId: string, updater: (p: Post) => Post | null): void {
    queryClient.setQueriesData<{ pages: ListFeedResponse[]; pageParams: number[] }>(
      { queryKey: [FEED_QUERY_KEY] },
      (existing) => {
        if (!existing) return existing
        return {
          ...existing,
          pages: existing.pages.map((page) => ({
            ...page,
            posts: page.posts
              .map((p) => (p.post_id === postId ? updater(p) : p))
              .filter((p): p is Post => Boolean(p)),
          })),
        }
      },
    )
  }

  function beginEditActivityPost(postId: string, text: string, image?: string | null): void {
    setEditingPostId(postId)
    setEditingPostText(text)
    setEditingPostImage(image ?? '')
  }

  function closeEditActivityPost(): void {
    setEditingPostId(null)
    setEditingPostText('')
    setEditingPostImage('')
  }

  function saveEditedActivityPost(): void {
    if (!editingPostId) return
    const nextText = editingPostText.trim()
    if (!nextText) return
    const nextImage = editingPostImage.trim()
    const state = useProfileStore.getState()
    state.patchProfile({
      activity_posts: state.profile.activity_posts.map((p) =>
        p.id === editingPostId
          ? {
              ...p,
              text: nextText,
              image: nextImage || undefined,
            }
          : p,
      ),
    })
    mutateFeedPost(editingPostId, (p) => ({
      ...p,
      content: nextText,
      media_type: nextImage ? 'image' : 'text',
      media_url: nextImage || undefined,
    }))
    closeEditActivityPost()
  }

  function confirmDeleteActivityPost(): void {
    if (!deletingPostId) return
    const state = useProfileStore.getState()
    state.patchProfile({
      activity_posts: state.profile.activity_posts.filter((p) => p.id !== deletingPostId),
    })
    mutateFeedPost(deletingPostId, () => null)
    setDeletingPostId(null)
  }

  const openModal = (m: ProfileModalKey, id: string | null = null): void => {
    setEditId(id)
    setModal(m)
  }

  return (
    <div className="space-y-4 pb-10">
      <div className="space-y-4">
        <Card>
          <div
            className={cn(
              'relative h-[140px] overflow-hidden rounded-t-lg md:h-[200px]',
              !display.cover_photo_url && 'bg-gradient-to-r from-sky-100 via-blue-50 to-indigo-100',
            )}
            style={
              display.cover_photo_url
                ? { backgroundImage: `url(${display.cover_photo_url})`, backgroundSize: 'cover', backgroundPosition: 'center' }
                : undefined
            }
          >
            {own ? (
              <button
                type="button"
                className="group absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/0 transition hover:bg-black/20"
                onClick={() => openModal('cover')}
                aria-label={display.cover_photo_url ? 'Change background photo' : 'Add a background photo'}
              >
                <Camera
                  className={cn(
                    'h-8 w-8 opacity-0 transition group-hover:opacity-100 md:h-9 md:w-9',
                    display.cover_photo_url ? 'text-white' : 'text-text-tertiary',
                  )}
                  aria-hidden
                />
                {display.cover_photo_url ? (
                  <span className="sr-only">Change background photo</span>
                ) : (
                  <span className="sr-only md:not-sr-only md:text-sm md:font-semibold md:text-white">Add a background photo</span>
                )}
              </button>
            ) : null}
            {own ? (
              <button
                type="button"
                className="absolute right-3 top-3 rounded-full border border-white/60 bg-white/90 p-2 shadow-sm"
                onClick={() => openModal('cover')}
                aria-label="Edit cover"
              >
                <Pencil className="h-4 w-4" />
              </button>
            ) : null}
          </div>
          <Card.Body className="relative pt-0">
            <div className="absolute left-6 -top-10 md:-mt-[80px]">
              <button
                type="button"
                className={cn('relative rounded-full ring-4 ring-white', own && 'group')}
                onClick={() => own && openModal('avatar')}
                disabled={!own}
              >
                <Avatar
                  size="3xl"
                  name={fullName || display.full_name || 'Member'}
                  src={display.profile_photo_url}
                  imageAlt={`${fullName || display.full_name || 'Member'} profile photo`}
                  className="!h-[120px] !w-[120px] md:!h-[160px] md:!w-[160px]"
                />
                {own ? (
                  <span className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-full bg-black/0 text-sm font-semibold text-white opacity-0 transition group-hover:bg-black/40 group-hover:opacity-100">
                    Add photo
                  </span>
                ) : null}
              </button>
            </div>
            <div className="pt-16 md:pt-24">
              <div className="flex flex-wrap items-start justify-between gap-3 px-2 md:px-0">
                <div>
                  {own && !fullName.trim() ? (
                    <button type="button" className="text-2xl font-bold italic text-text-tertiary" onClick={() => openModal('intro')}>
                      Add your name
                    </button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <h1 className="text-2xl font-bold text-text-primary">{fullName}</h1>
                      <BrandMark size={20} className="h-5 w-5" />
                    </div>
                  )}
                  {own && !(display.headline ?? '').trim() ? (
                    <button type="button" className="mt-1 block text-left text-base italic text-text-tertiary" onClick={() => openModal('intro')}>
                      Add a headline to tell people what you do
                    </button>
                  ) : (
                    <p className="mt-1 text-base text-text-primary">{display.headline}</p>
                  )}
                  {own && !(display.location ?? '').trim() ? (
                    <button type="button" className="mt-1 text-sm text-text-tertiary hover:text-brand-primary" onClick={() => openModal('intro')}>
                      Add location
                    </button>
                  ) : (
                    <p className="mt-1 text-sm text-text-secondary">
                      {display.location ?? ''}{' '}
                      {own ? (
                        <>
                          ·{' '}
                          <button type="button" className="font-semibold text-brand-primary" onClick={() => openModal('contact')}>
                            Contact info
                          </button>
                        </>
                      ) : null}
                    </p>
                  )}
                  <Link to="/mynetwork" className="text-sm font-semibold text-brand-primary">
                    {display.connections_count ?? 0}+ connections
                  </Link>
                </div>
                {display.educations?.[0]?.school ? (
                  <div className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
                    <div className="flex h-8 w-8 items-center justify-center rounded bg-surface text-xs font-semibold text-brand-primary">
                      {initials(display.educations[0].school)}
                    </div>
                    <span>{display.educations[0].school}</span>
                  </div>
                ) : null}
              </div>
              {own ? (
                <div className="mt-4 flex flex-wrap gap-2 px-2 md:px-0">
                  <Button onClick={() => openModal('openToWork')}>Open to</Button>
                  <Dropdown.Root>
                    <Dropdown.Trigger showEndChevron className="inline-flex h-10 items-center rounded-full border border-border bg-white px-4 text-sm font-semibold text-text-primary shadow-sm">
                      Add profile section
                    </Dropdown.Trigger>
                    <Dropdown.Content className="min-w-52">
                      <Dropdown.Item onSelect={() => openModal('intro')}>Intro</Dropdown.Item>
                      <Dropdown.Item onSelect={() => openModal('about')}>About</Dropdown.Item>
                      <Dropdown.Item onSelect={() => { setEditId(null); openModal('experience') }}>Experience</Dropdown.Item>
                      <Dropdown.Item onSelect={() => { setEditId(null); openModal('education') }}>Education</Dropdown.Item>
                      <Dropdown.Item onSelect={() => { setEditId(null); openModal('license') }}>Licenses</Dropdown.Item>
                      <Dropdown.Item onSelect={() => { setEditId(null); openModal('project') }}>Projects</Dropdown.Item>
                      <Dropdown.Item onSelect={() => openModal('skill')}>Skills</Dropdown.Item>
                      <Dropdown.Item onSelect={() => openModal('course')}>Courses</Dropdown.Item>
                    </Dropdown.Content>
                  </Dropdown.Root>
                  <Button variant="secondary" onClick={() => openModal('customButton')}>
                    Add custom button
                  </Button>
                  <Button variant="tertiary" onClick={() => openModal('resources')}>
                    Resources
                  </Button>
                </div>
              ) : (
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    disabled={isConnected || connectMutation.isPending || requestSent}
                    loading={connectMutation.isPending}
                    onClick={() => connectMutation.mutate()}
                  >
                    {isConnected ? 'Connected' : requestSent ? 'Request sent' : 'Connect'}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      if (!viewerId || !memberId) return
                      void openThread([viewerId, memberId])
                        .then((r) => navigate(`/messaging/${r.thread_id}`))
                        .catch(() => undefined)
                    }}
                  >
                    Message
                  </Button>
                </div>
              )}
              {display.is_open_to_work && (display.open_to_work_details ?? '').trim() ? (
                <div className="mx-2 mt-4 rounded-md border-l-4 border-success bg-green-50 p-3 md:mx-0">
                  <p className="font-semibold text-success">Open to work</p>
                  <p className="text-sm text-text-secondary">{display.open_to_work_details}</p>
                  {own ? (
                    <button type="button" className="mt-1 text-sm font-semibold text-brand-primary" onClick={() => openModal('openToWork')}>
                      Edit
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          </Card.Body>
        </Card>

        {showCompletionCard ? (
          <Card>
            <Card.Header className="text-lg font-semibold">Complete your profile</Card.Header>
            <Card.Body>
              <div className="h-2 w-full rounded-full bg-gray-200">
                <div className="h-2 rounded-full bg-brand-primary transition-all" style={{ width: `${completionPct}%` }} />
              </div>
              <p className="mt-2 text-sm text-text-secondary">{completionPct}% complete</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {!profile.profile_photo_url ? (
                  <button type="button" className="rounded-full border border-brand-primary px-3 py-1 text-sm text-brand-primary hover:bg-brand-primary/10" onClick={() => openModal('avatar')}>
                    Add profile photo
                  </button>
                ) : null}
                {!profile.headline.trim() ? (
                  <button type="button" className="rounded-full border border-brand-primary px-3 py-1 text-sm text-brand-primary hover:bg-brand-primary/10" onClick={() => openModal('intro')}>
                    Add headline
                  </button>
                ) : null}
                {!profile.about.trim() ? (
                  <button type="button" className="rounded-full border border-brand-primary px-3 py-1 text-sm text-brand-primary hover:bg-brand-primary/10" onClick={() => openModal('about')}>
                    Add about
                  </button>
                ) : null}
                {profile.experience.length === 0 ? (
                  <button
                    type="button"
                    className="rounded-full border border-brand-primary px-3 py-1 text-sm text-brand-primary hover:bg-brand-primary/10"
                    onClick={() => openModal('experience')}
                  >
                    Add experience
                  </button>
                ) : null}
                {profile.education.length === 0 ? (
                  <button
                    type="button"
                    className="rounded-full border border-brand-primary px-3 py-1 text-sm text-brand-primary hover:bg-brand-primary/10"
                    onClick={() => openModal('education')}
                  >
                    Add education
                  </button>
                ) : null}
                {profile.skills.length === 0 ? (
                  <button type="button" className="rounded-full border border-brand-primary px-3 py-1 text-sm text-brand-primary hover:bg-brand-primary/10" onClick={() => openModal('skill')}>
                    Add skills
                  </button>
                ) : null}
              </div>
            </Card.Body>
          </Card>
        ) : null}

        {own && !isSuggestionDismissed('suggested-projects') && profile.projects.length === 0 ? (
          <Card>
            <SectionHeader title="Suggested for you" own={false} />
            <Card.Body>
              <p className="mb-2 inline-flex items-center gap-1 text-xs text-text-secondary">
                <Eye className="h-3.5 w-3.5" /> Private to you
              </p>
              <div className="flex items-start justify-between rounded-md border border-border p-3">
                <div className="flex gap-2">
                  <FolderOpen className="mt-0.5 h-4 w-4 text-text-secondary" />
                  <div>
                    <p className="text-sm font-semibold">Add projects that showcase your skills</p>
                    <Button size="sm" className="mt-2" onClick={() => openModal('project')}>
                      Add project
                    </Button>
                  </div>
                </div>
                <button type="button" onClick={() => dismissSuggestion('suggested-projects')} aria-label="Dismiss">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </Card.Body>
          </Card>
        ) : null}

        {own ? (
          <Card>
            <SectionHeader title="Analytics" own={false} />
            <Card.Body>
              <p className="mb-2 inline-flex items-center gap-1 text-xs text-text-secondary">
                <Eye className="h-3.5 w-3.5" /> Private to you
              </p>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="flex gap-3">
                  <Users className="mt-1 h-5 w-5 text-text-secondary" />
                  <div>
                    <p className="text-xl font-semibold">{profile.profile_views}</p>
                    <p className="text-sm text-text-secondary">Profile views</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <BarChart3 className="mt-1 h-5 w-5 text-text-secondary" />
                  <div>
                    <p className="text-xl font-semibold">{profile.post_impressions}</p>
                    <p className="text-sm text-text-secondary">Post impressions</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <Search className="mt-1 h-5 w-5 text-text-secondary" />
                  <div>
                    <p className="text-xl font-semibold">{profile.search_appearances}</p>
                    <p className="text-sm text-text-secondary">Search appearances</p>
                  </div>
                </div>
              </div>
            </Card.Body>
            <div className="border-t border-border px-4 py-2">
              <Link to="/analytics" className="block text-center text-sm font-semibold">
                Show all analytics →
              </Link>
            </div>
          </Card>
        ) : null}

        {own || (display.bio ?? '').trim() ? (
          <Card id="about">
            <SectionHeader title="About" own={own} onEdit={() => openModal('about')} />
            <Card.Body>
              {!(display.bio ?? '').trim() && own ? (
                <button type="button" className="flex w-full flex-col items-center gap-2 py-8 text-text-tertiary" onClick={() => openModal('about')}>
                  <Plus className="h-10 w-10" />
                  <span className="text-sm font-medium">Tell people about yourself</span>
                </button>
              ) : (
                <>
                  <p className="whitespace-pre-line text-base leading-7 text-text-primary">{display.bio}</p>
                  <div className="mt-4 flex items-center justify-between rounded-xl border border-border px-4 py-3">
                    <div>
                      <span className="inline-flex items-center gap-2 text-sm font-semibold text-text-primary">
                        <Diamond className="h-4 w-4 text-text-secondary" />
                        Top skills
                      </span>
                      <p className="mt-1 text-base text-text-primary">{(display.skills ?? []).slice(0, 5).join(' · ') || '—'}</p>
                    </div>
                    <ChevronRight className="h-5 w-5 text-text-secondary" />
                  </div>
                </>
              )}
            </Card.Body>
          </Card>
        ) : null}

        {own || (display.featured?.length ?? 0) > 0 ? (
          <Card>
            <SectionHeader title="Featured" own={own} onAdd={() => openModal('featured')} onEdit={() => openModal('featured')} />
            <Card.Body>
              {!(display.featured?.length ?? 0) && own ? (
                <button type="button" className="flex w-full flex-col items-center gap-2 py-8" onClick={() => openModal('featured')}>
                  <Sparkles className="h-8 w-8 text-text-tertiary" />
                  <p className="text-sm font-semibold text-text-secondary">Showcase your best work</p>
                  <Button size="sm">Add featured</Button>
                </button>
              ) : (
                <div className="flex snap-x gap-3 overflow-x-auto pb-2">
                  {(display.featured ?? []).map((item) => (
                    <article key={item.id} className="w-[280px] shrink-0 snap-start rounded-lg border border-border p-3">
                      <p className="text-xs text-text-tertiary">{item.type}</p>
                      <p className="mt-1 text-sm font-semibold">{item.title}</p>
                      <p className="text-xs text-text-secondary">{item.subtitle}</p>
                    </article>
                  ))}
                </div>
              )}
            </Card.Body>
          </Card>
        ) : null}

        <Card>
          <SectionHeader title="Activity" own={own} />
          <Card.Body>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-semibold text-brand-primary">{(display.followers_count ?? 0).toLocaleString()} followers</span>
              {own ? (
                <Button size="sm" onClick={() => setPostOpen(true)}>
                  Create a post
                </Button>
              ) : null}
            </div>
            <div className="mb-3 flex gap-2">
              {(['Posts', 'Comments', 'Images'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActivityTab(tab)}
                  className={activityTab === tab ? 'rounded-full bg-success px-3 py-1 text-sm font-semibold text-white' : 'rounded-full border border-border px-3 py-1 text-sm'}
                >
                  {tab}
                </button>
              ))}
            </div>
            {activityTab === 'Posts' && (display.activity_posts?.length ?? 0) === 0 && own ? (
              <p className="py-6 text-center text-sm text-text-secondary">You haven&apos;t posted yet</p>
            ) : null}
            <div className="grid gap-3 md:grid-cols-2">
              {(display.activity_posts ?? []).slice(0, 6).map((post) => (
                <article key={post.id} className="overflow-hidden rounded-xl border border-border bg-white">
                  <div className="flex items-start justify-between gap-2 px-3 pt-3">
                    <div className="flex items-start gap-2">
                      <Avatar
                        size="sm"
                        name={fullName || 'Member'}
                        src={display.profile_photo_url ?? undefined}
                        className="mt-0.5"
                      />
                      <div>
                        <p className="text-sm font-semibold text-text-primary">
                          {fullName || 'Member'} <BrandMark size={16} className="inline-block h-4 w-4 align-[-2px]" />{' '}
                          <span className="font-normal text-text-secondary">· You</span>
                        </p>
                        <p className="line-clamp-1 text-xs text-text-secondary">{display.headline || 'Add your headline'}</p>
                        <p className="mt-0.5 flex items-center gap-1 text-xs text-text-tertiary">
                          3w · <Globe2 className="h-3.5 w-3.5" aria-hidden />
                        </p>
                      </div>
                    </div>
                    <PostOptionsMenu
                      variant="feed"
                      isOwnPost={own}
                      post={{
                        post_id: post.id,
                        author_member_id: display.member_id,
                        author_name: fullName || 'You',
                        author_degree: '1st',
                        author_headline: display.headline ?? 'Add your headline',
                        author_avatar_url: display.profile_photo_url ?? null,
                        created_time_ago: 'now',
                        visibility: 'anyone',
                        content: post.text,
                        media_type: post.image ? 'image' : 'text',
                        media_url: post.image ?? undefined,
                        reactions_count: post.reactions,
                        comments_count: post.comments,
                        reposts_count: 0,
                        liked_by_me: false,
                        reaction_icons: ['like'],
                        comments: [],
                      }}
                      onEditPost={() => {
                        if (!own) return
                        beginEditActivityPost(post.id, post.text, post.image)
                      }}
                      onDeletePost={() => {
                        if (!own) return
                        setDeletingPostId(post.id)
                      }}
                    />
                  </div>
                  <div className="px-3 pt-2">
                    <p className="line-clamp-2 text-sm text-text-primary" style={{ WebkitLineClamp: 2 }}>
                      {post.text}
                    </p>
                    <Link to={`/in/${display.member_id}/activity`} className="text-sm text-text-secondary hover:text-text-primary">
                      ...more
                    </Link>
                  </div>
                  <div className="mt-2 border-y border-border bg-surface">
                    {post.image ? (
                      <img src={post.image} alt="" className="h-64 w-full object-cover" loading="lazy" />
                    ) : (
                      <div className="h-64 w-full bg-gradient-to-br from-slate-200 to-slate-300" />
                    )}
                  </div>
                  <div className="px-3 py-2 text-xs text-text-secondary">
                    {post.reactions} reactions{post.comments > 0 ? ` · ${post.comments} comments` : ''}
                  </div>
                  <div className="grid grid-cols-4 border-t border-border px-2 py-1.5 text-text-secondary">
                    <button type="button" className="inline-flex items-center justify-center rounded-md py-1.5 hover:bg-black/5">
                      <span className="sr-only">Like</span>
                      <ThumbsUp className="h-4 w-4" />
                    </button>
                    <button type="button" className="inline-flex items-center justify-center rounded-md py-1.5 hover:bg-black/5">
                      <span className="sr-only">Comment</span>
                      <MessageCircle className="h-4 w-4" />
                    </button>
                    <button type="button" className="inline-flex items-center justify-center rounded-md py-1.5 hover:bg-black/5">
                      <span className="sr-only">Repost</span>
                      <Repeat2 className="h-4 w-4" />
                    </button>
                    <button type="button" className="inline-flex items-center justify-center rounded-md py-1.5 hover:bg-black/5">
                      <span className="sr-only">Send</span>
                      <Send className="h-4 w-4" />
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </Card.Body>
          <div className="border-t border-border px-4 py-2">
            <Link to={`/in/${display.member_id}/activity`} className="block text-center text-sm font-semibold text-text-secondary hover:text-text-primary">
              Show all posts →
            </Link>
          </div>
        </Card>

        {own || (display.experiences?.length ?? 0) > 0 ? (
          <Card id="experience">
            <SectionHeader
              title="Experience"
              own={own}
              onAdd={() => {
                setEditId(null)
                openModal('experience')
              }}
              onEdit={() => {
                setEditId(null)
                openModal('experience')
              }}
            />
            <Card.Body className="space-y-4">
              {!(display.experiences?.length ?? 0) && own ? (
                <button type="button" className="flex w-full flex-col items-center gap-2 py-10" onClick={() => openModal('experience')}>
                  <Plus className="h-10 w-10 text-text-tertiary" />
                  <span className="text-sm font-semibold text-text-secondary">Add your work experience</span>
                </button>
              ) : (
                (display.experiences ?? []).map((exp, idx) => (
                  <div key={exp.id}>
                    <div className="flex gap-3">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded bg-surface font-semibold text-brand-primary">
                        {initials(exp.company)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-semibold">{exp.title}</p>
                          {own ? (
                            <button type="button" className="shrink-0 rounded-full p-1 hover:bg-black/5" onClick={() => openModal('experience', exp.id)}>
                              <Pencil className="h-4 w-4" />
                            </button>
                          ) : null}
                        </div>
                        <p className="text-sm text-text-secondary">
                          {exp.company} · {exp.employment_type}
                        </p>
                        <p className="text-xs text-text-tertiary">
                          {exp.start_date} - {exp.end_date ?? 'Present'} · {exp.location} · {exp.workplace}
                        </p>
                        <p className="mt-1 line-clamp-3 text-sm">{exp.description}</p>
                        <p className="mt-1 text-xs text-text-secondary">
                          <Diamond className="mr-1 inline h-3.5 w-3.5" />
                          {exp.skills.join(' · ')}
                        </p>
                      </div>
                    </div>
                    {idx < (display.experiences?.length ?? 0) - 1 ? <hr className="mt-3 border-border" /> : null}
                  </div>
                ))
              )}
            </Card.Body>
          </Card>
        ) : null}

        {own || (display.educations?.length ?? 0) > 0 ? (
          <Card id="education">
            <SectionHeader
              title="Education"
              own={own}
              onAdd={() => {
                setEditId(null)
                openModal('education')
              }}
              onEdit={() => openModal('education')}
            />
            <Card.Body className="space-y-4">
              {!(display.educations?.length ?? 0) && own ? (
                <button type="button" className="flex w-full flex-col items-center gap-2 py-10" onClick={() => openModal('education')}>
                  <Plus className="h-10 w-10 text-text-tertiary" />
                  <span className="text-sm font-semibold">Add education</span>
                </button>
              ) : (
                (display.educations ?? []).slice(0, 2).map((edu) => (
                  <div key={edu.id} className="flex gap-3">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded bg-surface font-semibold text-brand-primary">
                      {initials(edu.school)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex justify-between gap-2">
                        <p className="font-semibold">{edu.school}</p>
                        {own ? (
                          <button type="button" className="shrink-0 rounded-full p-1 hover:bg-black/5" onClick={() => openModal('education', edu.id)}>
                            <Pencil className="h-4 w-4" />
                          </button>
                        ) : null}
                      </div>
                      <p className="text-sm text-text-secondary">
                        {edu.degree}, {edu.field}
                      </p>
                      <p className="text-xs text-text-tertiary">
                        {edu.start_date} - {edu.end_date ?? 'Present'}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </Card.Body>
          </Card>
        ) : null}

        {own || (display.licenses?.length ?? 0) > 0 ? (
          <Card>
            <SectionHeader title="Licenses & certifications" own={own} onAdd={() => openModal('license')} onEdit={() => openModal('license')} />
            <Card.Body className="space-y-3">
              {!(display.licenses?.length ?? 0) && own ? (
                <button type="button" className="flex w-full flex-col items-center gap-2 py-8" onClick={() => openModal('license')}>
                  <Plus className="h-9 w-9" />
                  <span className="text-sm font-semibold">Add license</span>
                </button>
              ) : (
                (display.licenses ?? []).slice(0, 2).map((lic) => (
                  <article key={lic.id} className="rounded-md border border-border p-3">
                    <div className="flex justify-between gap-2">
                      <div>
                        <p className="font-semibold">{lic.name}</p>
                        <p className="text-sm text-text-secondary">{lic.org}</p>
                      </div>
                      {own ? (
                        <button type="button" className="shrink-0 rounded-full p-1 hover:bg-black/5" onClick={() => openModal('license', lic.id)}>
                          <Pencil className="h-4 w-4" />
                        </button>
                      ) : null}
                    </div>
                    {lic.preview_image ? <img src={lic.preview_image} alt="" className="mt-2 h-28 w-full rounded object-cover" loading="lazy" /> : null}
                    <button type="button" className="mt-2 inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 text-sm">
                      Show credential <ExternalLink className="h-3.5 w-3.5" />
                    </button>
                  </article>
                ))
              )}
            </Card.Body>
          </Card>
        ) : null}

        {own || (display.projects?.length ?? 0) > 0 ? (
          <Card>
            <SectionHeader title="Projects" own={own} onAdd={() => openModal('project')} onEdit={() => openModal('project')} />
            <Card.Body className="space-y-3">
              {!(display.projects?.length ?? 0) && own ? (
                <button type="button" className="flex w-full flex-col items-center gap-2 py-8" onClick={() => openModal('project')}>
                  <Plus className="h-9 w-9" />
                  <span className="text-sm font-semibold">Add project</span>
                </button>
              ) : (
                (display.projects ?? []).slice(0, 2).map((project) => (
                  <article key={project.id}>
                    <div className="flex justify-between gap-2">
                      <p className="font-semibold">{project.name}</p>
                      {own ? (
                        <button type="button" className="shrink-0 rounded-full p-1 hover:bg-black/5" onClick={() => openModal('project', project.id)}>
                          <Pencil className="h-4 w-4" />
                        </button>
                      ) : null}
                    </div>
                    <p className="text-xs text-text-tertiary">
                      {project.start_date} - {project.end_date ?? 'Present'}
                    </p>
                    {project.associated_with ? <p className="text-sm text-text-secondary">Associated with {project.associated_with}</p> : null}
                    <p className="mt-1 line-clamp-3 text-sm">{project.description}</p>
                  </article>
                ))
              )}
            </Card.Body>
          </Card>
        ) : null}

        {own || (display.skills?.length ?? 0) > 0 ? (
          <Card id="skills">
            <SectionHeader title="Skills" own={own} onAdd={() => openModal('skill')} onEdit={() => openModal('skillsManage')} />
            <Card.Body>
              {!(display.skills?.length ?? 0) && own ? (
                <button type="button" className="flex w-full flex-col items-center gap-2 py-8" onClick={() => openModal('skill')}>
                  <Target className="h-8 w-8 text-text-tertiary" />
                  <span className="text-sm font-semibold">Add skills to get found by recruiters</span>
                </button>
              ) : (
                <div className="space-y-2">
                  {(display.skills ?? []).map((skill) => (
                    <div key={skill} className="border-b border-border pb-2 last:border-b-0">
                      <p className="font-semibold">{skill}</p>
                    </div>
                  ))}
                </div>
              )}
            </Card.Body>
          </Card>
        ) : null}

        {own || (display.courses?.length ?? 0) > 0 ? (
          <Card>
            <SectionHeader title="Courses" own={own} onAdd={() => openModal('course')} onEdit={() => openModal('coursesManage')} />
            <Card.Body>
              {!(display.courses?.length ?? 0) && own ? (
                <button type="button" className="py-6 text-sm font-semibold text-brand-primary" onClick={() => openModal('course')}>
                  Add a course
                </button>
              ) : (
                <ul className="space-y-2">
                  {(display.courses ?? []).map((c, idx) => (
                    <li key={`${c}-${idx}`} className="font-semibold">
                      {c}
                    </li>
                  ))}
                </ul>
              )}
            </Card.Body>
          </Card>
        ) : null}

        <Card>
          <SectionHeader title="Interests" own={false} />
          <Card.Body>
            <div className="mb-3 flex flex-wrap border-b border-border">
              {(['Companies', 'Groups', 'Newsletters'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setInterestsTab(tab)}
                  className={`-mb-px px-3 py-2 text-sm ${interestsTab === tab ? 'border-b-2 border-success font-semibold text-success' : 'text-text-secondary'}`}
                >
                  {tab}
                </button>
              ))}
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {interestsTab === 'Companies'
                ? interestCompanies.map((item) => (
                    <article key={item.id} className="flex items-center justify-between rounded-md border border-border p-2">
                      <div>
                        <p className="text-sm font-semibold">{item.name}</p>
                        <p className="text-xs text-text-secondary">{item.tagline}</p>
                      </div>
                      <Button size="sm" variant="secondary" asChild>
                        <Link to={`/companies/${item.id}`}>View</Link>
                      </Button>
                    </article>
                  ))
                : null}
              {interestsTab === 'Groups'
                ? interestGroups.map((item) => (
                    <article key={item.id} className="flex items-center justify-between rounded-md border border-border p-2">
                      <div>
                        <p className="text-sm font-semibold">{item.name}</p>
                        <p className="text-xs text-text-secondary">{item.memberCount.toLocaleString()} members</p>
                      </div>
                      <Button size="sm" variant="secondary" asChild>
                        <Link to={`/groups/${item.id}`}>View</Link>
                      </Button>
                    </article>
                  ))
                : null}
              {interestsTab === 'Newsletters'
                ? interestNewsletters.map((item) => (
                    <article key={item.id} className="flex items-center justify-between rounded-md border border-border p-2">
                      <div>
                        <p className="text-sm font-semibold">{item.title}</p>
                        <p className="line-clamp-1 text-xs text-text-secondary">{item.description}</p>
                      </div>
                      <Button size="sm" variant="secondary" asChild>
                        <Link to="/newsletters">View</Link>
                      </Button>
                    </article>
                  ))
                : null}
            </div>
            {((interestsTab === 'Companies' && interestCompanies.length === 0) ||
              (interestsTab === 'Groups' && interestGroups.length === 0) ||
              (interestsTab === 'Newsletters' && interestNewsletters.length === 0)) ? (
              <p className="mt-2 text-sm text-text-secondary">No items yet in this section.</p>
            ) : null}
          </Card.Body>
        </Card>
      </div>

      <Modal isOpen={Boolean(editingPostId)} onClose={closeEditActivityPost} title="Edit post" size="lg">
        <Modal.Header>Edit post</Modal.Header>
        <Modal.Body className="space-y-4">
          <div className="flex items-center gap-3">
            <Avatar size="md" name={fullName || 'Member'} src={display.profile_photo_url || undefined} />
            <div>
              <p className="text-sm font-semibold text-text-primary">{fullName || 'Member'}</p>
              <p className="text-xs text-text-secondary">{display.headline || 'Add your headline'}</p>
            </div>
          </div>
          <Textarea
            autoResize
            value={editingPostText}
            onChange={(event) => setEditingPostText(event.target.value)}
            placeholder="What do you want to talk about?"
            className="min-h-28"
          />
          <div className="space-y-2 rounded-md border border-border p-3">
            <input
              ref={editImageInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) setEditingPostImage(URL.createObjectURL(file))
              }}
            />
            <div className="flex items-center gap-2">
              <Button size="sm" variant="secondary" onClick={() => editImageInputRef.current?.click()}>
                Upload image
              </Button>
              {editingPostImage ? (
                <Button size="sm" variant="tertiary" onClick={() => setEditingPostImage('')}>
                  Remove image
                </Button>
              ) : null}
            </div>
            <Input
              value={editingPostImage}
              onChange={(event) => setEditingPostImage(event.target.value)}
              placeholder="or paste image URL"
            />
            {editingPostImage.trim() ? (
              <img src={editingPostImage.trim()} alt="Preview" className="h-48 w-full rounded border border-border object-cover" />
            ) : null}
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="tertiary" onClick={closeEditActivityPost}>
            Cancel
          </Button>
          <Button onClick={saveEditedActivityPost} disabled={!editingPostText.trim()}>
            Save
          </Button>
        </Modal.Footer>
      </Modal>
      <Modal isOpen={Boolean(deletingPostId)} onClose={() => setDeletingPostId(null)} title="Delete post?" size="sm">
        <Modal.Header>Delete post?</Modal.Header>
        <Modal.Body>
          <p className="text-sm text-text-secondary">This action cannot be undone. This post will be removed from your profile and feed.</p>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="tertiary" onClick={() => setDeletingPostId(null)}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={confirmDeleteActivityPost}>
            Delete
          </Button>
        </Modal.Footer>
      </Modal>

      <ProfileModals active={modal} editId={editId} onClose={() => { setModal(null); setEditId(null) }} />

      <Suspense fallback={null}>
        <CreatePostModal
          isOpen={postOpen}
          onClose={() => setPostOpen(false)}
          isSubmitting={createPostMutation.isPending}
          onCreatePost={(payload) => createPostMutation.mutate(payload)}
        />
      </Suspense>
    </div>
  )
}
