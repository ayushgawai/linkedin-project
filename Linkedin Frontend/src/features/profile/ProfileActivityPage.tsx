import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, Navigate, useParams } from 'react-router-dom'
import { getMember } from '../../api/profile'
import { listPostsByAuthor } from '../../api/posts'
import { ActivityFeedPost } from '../../components/feed/ActivityFeedPost'
import { Card, Skeleton } from '../../components/ui'
import { useAuthStore } from '../../store/authStore'
import { useProfileStore } from '../../store/profileStore'
import type { Member } from '../../types'
import type { Post } from '../../types/feed'

function ActivitySkeleton(): JSX.Element {
  return (
    <Card>
      <Card.Body className="space-y-3 p-4">
        <Skeleton className="h-7 w-36" />
        <Skeleton className="h-6 w-72" />
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 w-full" />
        ))}
      </Card.Body>
    </Card>
  )
}

function toActivityPost(post: Post): { id: string; text: string; image?: string | null; reactions: number; comments: number } {
  return {
    id: post.post_id,
    text: post.content,
    image: post.media_type === 'image' ? (post.media_url ?? null) : null,
    reactions: post.reactions_count,
    comments: post.comments_count,
  }
}

export default function ProfileActivityPage(): JSX.Element {
  const { memberId = '' } = useParams<{ memberId: string }>()
  const authUser = useAuthStore((s) => s.user)
  const profile = useProfileStore((s) => s.profile)
  const [tab, setTab] = useState<'Posts' | 'Comments' | 'Images' | 'Reactions'>('Posts')

  const isOwnProfile = Boolean(memberId && profile.member_id && memberId === profile.member_id)
  const otherQuery = useQuery({
    queryKey: ['member', memberId],
    queryFn: () => getMember(memberId),
    enabled: Boolean(memberId) && !isOwnProfile,
  })
  const authoredPostsQuery = useQuery({
    queryKey: ['posts', 'author', memberId],
    queryFn: async () => listPostsByAuthor(memberId, 1, 100),
    enabled: Boolean(memberId),
  })

  if (memberId === 'me') {
    const target = profile.member_id || authUser?.member_id
    if (target) return <Navigate to={`/in/${target}/activity`} replace />
    return <Navigate to="/feed" replace />
  }
  if (!memberId) return <Navigate to="/404" replace />
  if (!isOwnProfile && otherQuery.isPending) return <ActivitySkeleton />
  if (!isOwnProfile && (otherQuery.isError || !otherQuery.data)) return <Navigate to="/404" replace />

  const display: Member = isOwnProfile
    ? {
        ...authUser,
        member_id: profile.member_id || authUser?.member_id || memberId,
        email: profile.email,
        full_name: `${profile.first_name} ${profile.last_name}`.trim() || 'Member',
        headline: profile.headline || null,
        bio: profile.about || null,
        location: profile.location || null,
        skills: profile.skills.map((s) => s.name),
        profile_photo_url: profile.profile_photo_url || null,
        cover_photo_url: profile.cover_photo_url || null,
        activity_posts: profile.activity_posts,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
    : (otherQuery.data as Member)

  const allPostsFromFeed = (authoredPostsQuery.data?.posts ?? []).map(toActivityPost)
  const allPosts = allPostsFromFeed.length > 0 ? allPostsFromFeed : (display.activity_posts ?? [])

  return (
    <Card>
      <Card.Header className="space-y-2">
        <h1 className="text-3xl font-semibold text-text-primary">All activity</h1>
        <div className="flex flex-wrap gap-2">
          {(['Posts', 'Comments', 'Images', 'Reactions'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={tab === t ? 'rounded-full bg-success px-3 py-1 text-sm font-semibold text-white' : 'rounded-full border border-border px-3 py-1 text-sm'}
            >
              {t}
            </button>
          ))}
        </div>
      </Card.Header>
      <Card.Body className="space-y-3">
        <p className="text-sm text-text-secondary">
          <Link to={`/in/${memberId}`} className="font-semibold text-brand-primary hover:underline">
            Back to profile
          </Link>
        </p>
        {tab !== 'Posts' ? (
          <p className="rounded-md border border-border p-3 text-sm text-text-secondary">
            {tab} view is coming soon. Posts are fully available below.
          </p>
        ) : null}
        {allPosts.length === 0 ? (
          <p className="py-8 text-center text-sm text-text-secondary">No posts yet.</p>
        ) : (
          allPosts.map((ap) => (
            <ActivityFeedPost
              key={ap.id}
              activity={ap}
              display={{
                member_id: display.member_id,
                full_name: display.full_name,
                headline: display.headline,
                profile_photo_url: display.profile_photo_url,
              }}
            />
          ))
        )}
      </Card.Body>
    </Card>
  )
}
