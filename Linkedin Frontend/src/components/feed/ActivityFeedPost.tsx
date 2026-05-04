import { memo, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getPostById } from '../../api/posts'
import type { ActivityPost } from '../../store/profileStore'
import type { Member } from '../../types'
import type { ListFeedResponse, Post } from '../../types/feed'
import { FEED_QUERY_KEY } from './PostFeed'
import { PostCard } from './PostCard'

export type ActivityFeedPostDisplay = Pick<Member, 'member_id' | 'full_name' | 'headline' | 'profile_photo_url'>

function buildFallbackPost(activity: ActivityPost, display: ActivityFeedPostDisplay): Post {
  return {
    post_id: activity.id,
    author_member_id: display.member_id,
    author_name: display.full_name,
    author_degree: '1st',
    author_headline: display.headline ?? 'Professional',
    author_avatar_url: display.profile_photo_url ?? null,
    created_time_ago: 'now',
    visibility: 'anyone',
    content: activity.text,
    media_type: activity.image ? 'image' : 'text',
    media_url: activity.image ?? undefined,
    reactions_count: activity.reactions,
    comments_count: activity.comments,
    reposts_count: 0,
    liked_by_me: false,
    reaction_icons: ['like', 'celebrate', 'insightful'],
    comments: [],
  }
}

/** Same post as home feed: scan infinite-feed cache when /posts/get is unavailable. */
function findPostInFeedCaches(queryClient: ReturnType<typeof useQueryClient>, postId: string): Post | undefined {
  const matches = queryClient.getQueriesData<{ pages: ListFeedResponse[] }>({
    queryKey: [FEED_QUERY_KEY],
    exact: false,
  })
  for (const [, value] of matches) {
    if (!value?.pages) continue
    for (const page of value.pages) {
      const hit = page.posts.find((p) => p.post_id === postId)
      if (hit) return hit
    }
  }
  return undefined
}

type ActivityFeedPostProps = {
  activity: ActivityPost
  display: ActivityFeedPostDisplay
}

/** Same interactive post as the feed; resolves API → feed cache → profile snapshot. */
function ActivityFeedPostComponent({ activity, display }: ActivityFeedPostProps): JSX.Element {
  const queryClient = useQueryClient()
  const fallback = useMemo(() => buildFallbackPost(activity, display), [activity, display])

  const { data: resolved } = useQuery({
    queryKey: ['post', activity.id],
    queryFn: async (): Promise<Post> => {
      const fromApi = await getPostById(activity.id).catch(() => null)
      if (fromApi) return fromApi
      const fromFeed = findPostInFeedCaches(queryClient, activity.id)
      return fromFeed ?? fallback
    },
    placeholderData: fallback,
    staleTime: 15_000,
  })

  const post = resolved ?? fallback
  return <PostCard post={post} showDismiss={false} expandCommentsIfPresent />
}

export const ActivityFeedPost = memo(ActivityFeedPostComponent)
