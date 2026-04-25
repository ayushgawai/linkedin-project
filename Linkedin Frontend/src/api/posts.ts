// ============================================
// INTEGRATION CONTRACT — Posts Service
// ============================================
// Current mode: MOCK-FIRST (frontend-only feed with local data)
// To integrate: preserve signatures and replace API internals.
//
// Endpoints (proposed):
//   POST /posts/list     → listFeed(params)
//   POST /posts/create   → createPost(payload)
//
// Auth: Bearer token via src/api/client.ts interceptor
// ============================================

import { MOCK_POSTS } from '../lib/mockData'
import { USE_MOCKS, apiClient, mockDelay } from './client'
import type { CreatePostPayload, ListFeedParams, ListFeedResponse, Post } from '../types/feed'
import { useProfileStore } from '../store/profileStore'
import { useAuthStore } from '../store/authStore'

let inMemoryPosts: Post[] = [...MOCK_POSTS]

export async function listFeed(params: ListFeedParams): Promise<ListFeedResponse> {
  if (!USE_MOCKS) {
    const response = await apiClient.post<ListFeedResponse>('/posts/list', params)
    return response.data
  }
  await mockDelay(300)
  const { page, pageSize, sort } = params
  const viewerId = useAuthStore.getState().user?.member_id

  const visiblePosts = inMemoryPosts.filter((post) => {
    const isOwn = Boolean(viewerId && post.author_member_id && post.author_member_id === viewerId)
    const isConnection = post.author_degree === '1st'
    if (post.visibility === 'connections' && !isOwn && !isConnection) {
      return false
    }
    if (params.tab === 'following') {
      return isOwn || isConnection
    }
    return true
  })

  const source = sort === 'recent' ? [...visiblePosts] : [...visiblePosts].sort((a, b) => b.reactions_count - a.reactions_count)
  const start = (page - 1) * pageSize
  const end = start + pageSize

  return {
    posts: source.slice(start, end),
    page,
    has_more: end < source.length,
  }
}

export async function createPost(payload: CreatePostPayload): Promise<Post> {
  if (!USE_MOCKS) {
    const response = await apiClient.post<Post>('/posts/create', payload)
    return response.data
  }
  await mockDelay(300)
  const profile = useProfileStore.getState().profile
  const authorName = `${profile.first_name} ${profile.last_name}`.trim() || 'You'
  const authorHeadline = profile.headline || 'Add your headline'

  const newPost: Post = {
    post_id: `post-${Date.now()}`,
    author_member_id: profile.member_id || null,
    author_name: authorName,
    author_degree: '1st',
    author_headline: authorHeadline,
    author_avatar_url: profile.profile_photo_url || null,
    created_time_ago: 'now',
    visibility: payload.visibility,
    content: payload.content,
    media_type: payload.media_type ?? 'text',
    media_url: payload.media_url,
    article_title: payload.article_title,
    article_source: payload.article_source,
    poll_options: payload.poll_options,
    reactions_count: 0,
    comments_count: 0,
    reposts_count: 0,
    liked_by_me: false,
    reaction_icons: ['like'],
    comments: [],
  }

  useProfileStore.getState().addActivityPost({
    id: newPost.post_id,
    text: newPost.content,
    image: newPost.media_type === 'image' ? (newPost.media_url ?? null) : null,
    reactions: 0,
    comments: 0,
  })
  inMemoryPosts = [newPost, ...inMemoryPosts]
  return newPost
}
