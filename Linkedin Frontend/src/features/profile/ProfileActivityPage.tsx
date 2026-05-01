import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Globe2, MessageCircle, Repeat2, Send, ThumbsUp } from 'lucide-react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { getMember } from '../../api/profile'
import { PostOptionsMenu } from '../../components/feed/PostOptionsMenu'
import { BrandMark } from '../../components/layout/BrandMark'
import { Avatar, Card, Skeleton } from '../../components/ui'
import { useAuthStore } from '../../store/authStore'
import { useProfileStore } from '../../store/profileStore'
import type { Member } from '../../types'

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

  const allPosts = display.activity_posts ?? []
  const isOwn = Boolean(display.member_id && profile.member_id && display.member_id === profile.member_id)

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
          allPosts.map((post) => (
            <article key={post.id} className="overflow-hidden rounded-xl border border-border bg-white">
              <div className="flex items-start justify-between gap-2 px-4 pt-4">
                <div className="flex items-start gap-3">
                  <Avatar size="md" name={display.full_name} src={display.profile_photo_url ?? undefined} />
                  <div>
                    <p className="text-base font-semibold leading-tight text-text-primary">
                      {display.full_name}{' '}
                      <BrandMark size={16} className="inline-block h-4 w-4 align-[-2px]" />
                      {isOwn ? <span className="font-normal text-text-secondary"> · You</span> : null}
                    </p>
                    <p className="line-clamp-1 text-sm text-text-secondary">{display.headline || 'Add your headline'}</p>
                    <p className="mt-0.5 flex items-center gap-1 text-sm text-text-tertiary">
                      7mo · Edited · <Globe2 className="h-3.5 w-3.5" aria-hidden />
                    </p>
                  </div>
                </div>
                <PostOptionsMenu
                  variant="feed"
                  post={{
                    post_id: post.id,
                    author_member_id: display.member_id,
                    author_name: display.full_name,
                    author_degree: '1st',
                    author_headline: display.headline ?? 'Member',
                    author_avatar_url: display.profile_photo_url ?? null,
                    created_time_ago: '7mo',
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
                  isOwnPost={isOwn}
                />
              </div>

              <div className="px-4 pt-3">
                <p className="line-clamp-3 text-base text-text-primary" style={{ WebkitLineClamp: 3 }}>
                  {post.text}
                </p>
                <button type="button" className="text-sm text-text-secondary hover:text-text-primary">
                  ...more
                </button>
              </div>

              <div className="mt-2 border-y border-border bg-surface">
                {post.image ? (
                  <img src={post.image} alt="" className="h-[420px] w-full object-cover" loading="lazy" />
                ) : (
                  <div className="h-[420px] w-full bg-gradient-to-br from-slate-200 to-slate-300" />
                )}
              </div>

              <div className="flex items-center justify-between px-4 py-2 text-sm text-text-secondary">
                <span>{post.reactions} reactions</span>
                <span>{post.comments} comments</span>
              </div>

              <div className="grid grid-cols-4 border-y border-border px-2 py-1.5 text-text-secondary">
                <button type="button" className="inline-flex items-center justify-center gap-1 rounded-md py-2 text-base font-semibold hover:bg-black/5">
                  <ThumbsUp className="h-5 w-5" /> Like
                </button>
                <button type="button" className="inline-flex items-center justify-center gap-1 rounded-md py-2 text-base font-semibold hover:bg-black/5">
                  <MessageCircle className="h-5 w-5" /> Comment
                </button>
                <button type="button" className="inline-flex items-center justify-center gap-1 rounded-md py-2 text-base font-semibold hover:bg-black/5">
                  <Repeat2 className="h-5 w-5" /> Repost
                </button>
                <button type="button" className="inline-flex items-center justify-center gap-1 rounded-md py-2 text-base font-semibold hover:bg-black/5">
                  <Send className="h-5 w-5" /> Send
                </button>
              </div>

              <div className="flex items-center justify-between px-4 py-3 text-sm">
                <span className="font-semibold text-text-secondary">{(post.reactions + 1657).toLocaleString()} impressions</span>
                <Link to="/analytics" className="font-semibold text-brand-primary hover:underline">
                  View analytics
                </Link>
              </div>
            </article>
          ))
        )}
      </Card.Body>
    </Card>
  )
}

