import { apiClient, unwrapApiData } from './client'
import type { ApiError } from '../types'
import type {
  CreatePostPayload,
  ListFeedParams,
  ListFeedResponse,
  Post,
  PostComment,
} from '../types/feed'
import { useAuthStore } from '../store/authStore'
import { useProfileStore } from '../store/profileStore'

/** Prefer JWT user id; fall back to hydrated profile (fixes mismatches after refresh / partial state). */
export function currentMemberId(): string | null {
  const fromAuth = useAuthStore.getState().user?.member_id
  if (fromAuth) return fromAuth
  const fromProfile = useProfileStore.getState().profile.member_id
  return fromProfile || null
}

function normalizeMemberKey(id: string | null | undefined): string {
  return String(id ?? '')
    .trim()
    .toLowerCase()
    .replace(/-/g, '')
}

/** UUID-safe equality for comparing DB ids with profile/auth stores (dash/case variants). */
export function memberIdsEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  if (a == null || b == null) return false
  if (String(a).trim() === '' || String(b).trim() === '') return false
  return normalizeMemberKey(a) === normalizeMemberKey(b)
}

/**
 * When auth.user.member_id and profile.member_id disagree, prefer whichever matches the post author
 * so delete authorisation matches the row the API checks.
 */
function memberIdForDelete(authorMemberIdFromPost?: string | null): string | null {
  const authId = useAuthStore.getState().user?.member_id?.trim() || null
  const profileId = useProfileStore.getState().profile.member_id?.trim() || null
  const hintKey = authorMemberIdFromPost ? normalizeMemberKey(authorMemberIdFromPost) : ''
  if (hintKey) {
    if (authId && normalizeMemberKey(authId) === hintKey) return authId
    if (profileId && normalizeMemberKey(profileId) === hintKey) return profileId
  }
  return authId || profileId || null
}

/** Upload a base64 data URL to MinIO via posts service; returns a stable HTTP URL for `media_url`. */
export async function uploadPostMedia(dataUrl: string): Promise<string> {
  const memberId = currentMemberId()
  if (!memberId) {
    throw new Error('You must be signed in to attach media.')
  }
  const resp = await apiClient.post<unknown>('/posts/upload-media', {
    data_url: dataUrl,
    member_id: memberId,
  })
  const data = unwrapApiData<{ url: string }>(resp.data)
  if (!data?.url) {
    throw new Error('Upload did not return a media URL.')
  }
  return data.url
}

export type ToggleLikeResult = {
  reactions_count: number
  liked_by_me: boolean
}

/** Persist like/unlike so counts sync for all viewers (stored in MySQL `post_likes` + `posts.reactions_count`). */
export type AddCommentResult = {
  comment: PostComment
  comments_count: number
}

/** Persist comment so all viewers see it under the post (MySQL `post_comments`). */
export async function addPostComment(postId: string, text: string): Promise<AddCommentResult> {
  const memberId = currentMemberId()
  if (!memberId) {
    throw new Error('You must be signed in to comment.')
  }
  const trimmed = text.trim()
  if (!trimmed) {
    throw new Error('Comment cannot be empty.')
  }
  const resp = await apiClient.post<unknown>('/posts/add-comment', {
    post_id: postId,
    member_id: memberId,
    text: trimmed,
  })
  return unwrapApiData<AddCommentResult>(resp.data)
}

export type DeleteCommentResult = {
  comment_id: string
  post_id: string
  comments_count: number
}

/** Remove own comment (author must match `member_id`). */
export async function deletePostComment(commentId: string): Promise<DeleteCommentResult> {
  const memberId = currentMemberId()
  if (!memberId) {
    throw new Error('You must be signed in to delete a comment.')
  }
  const resp = await apiClient.post<unknown>('/posts/delete-comment', {
    comment_id: commentId,
    member_id: memberId,
  })
  return unwrapApiData<DeleteCommentResult>(resp.data)
}

export async function togglePostLike(postId: string): Promise<ToggleLikeResult> {
  const memberId = currentMemberId()
  if (!memberId) {
    throw new Error('You must be signed in to react to a post.')
  }
  const resp = await apiClient.post<unknown>('/posts/toggle-like', { post_id: postId, member_id: memberId })
  return unwrapApiData<ToggleLikeResult>(resp.data)
}

export type PostActivityNotificationRow = {
  kind: 'post_like' | 'post_comment'
  dedupe_id: string
  post_id: string
  actor_member_id: string | null
  actor_name: string
  created_at: string
  post_snippet: string
  comment_preview: string | null
}

/** Likes and comments on posts you authored (posts service). */
export async function fetchPostActivityNotifications(memberId: string): Promise<PostActivityNotificationRow[]> {
  const resp = await apiClient.post<unknown>('/posts/activity-notifications', {
    member_id: memberId,
    limit: 50,
  })
  const data = unwrapApiData<{ items?: PostActivityNotificationRow[] }>(resp.data)
  return Array.isArray(data?.items) ? data.items : []
}

export async function deletePost(postId: string, authorMemberIdHint?: string | null): Promise<void> {
  const memberId = memberIdForDelete(authorMemberIdHint)
  if (!memberId) {
    throw new Error('You must be signed in to delete a post.')
  }
  try {
    await apiClient.post('/posts/delete', { post_id: postId, member_id: memberId })
  } catch (e) {
    const err = e as ApiError
    // Idempotent: feed/profile can be out of sync; still treat as removed for the UI.
    if (err.status === 404) return
    throw e
  }
}

export async function listFeed(params: ListFeedParams): Promise<ListFeedResponse> {
  const viewerId = currentMemberId()
  const resp = await apiClient.post<ListFeedResponse>('/posts/list', {
    ...params,
    viewer_member_id: viewerId,
  })
  return unwrapApiData<ListFeedResponse>(resp.data)
}

/** Profile activity feed: newest posts authored by the target member. */
export async function listPostsByAuthor(
  authorMemberId: string,
  page = 1,
  pageSize = 20,
): Promise<ListFeedResponse> {
  const viewerId = currentMemberId()
  try {
    const resp = await apiClient.post<ListFeedResponse>('/posts/list-by-author', {
      author_member_id: authorMemberId,
      page,
      pageSize,
      viewer_member_id: viewerId,
    })
    return unwrapApiData<ListFeedResponse>(resp.data)
  } catch (error) {
    const apiErr = error as ApiError
    // Graceful fallback when backend route is not deployed yet.
    if (apiErr.status !== 404) throw error
    const collected: Post[] = []
    let cursor = page
    let hasMore = true
    // Bounded scan so profile pages still render quickly.
    while (hasMore && collected.length < pageSize && cursor < page + 10) {
      const resp = await apiClient.post<ListFeedResponse>('/posts/list', {
        page: cursor,
        pageSize: 50,
        tab: 'for_you',
        sort: 'recent',
        viewer_member_id: viewerId,
      })
      const feed = unwrapApiData<ListFeedResponse>(resp.data)
      collected.push(
        ...(feed.posts ?? []).filter((p) => memberIdsEqual(p.author_member_id, authorMemberId)),
      )
      hasMore = Boolean(feed.has_more)
      cursor += 1
    }
    return {
      posts: collected.slice(0, pageSize),
      page,
      has_more: hasMore,
    }
  }
}

/** Full post + comments for profile activity (matches feed card shape). */
export async function getPostById(postId: string): Promise<Post | null> {
  const viewerId = currentMemberId()
  try {
    const resp = await apiClient.post<Post>('/posts/get', {
      post_id: postId,
      viewer_member_id: viewerId,
    })
    return unwrapApiData<Post>(resp.data)
  } catch (e) {
    const err = e as ApiError
    if (err.status === 404) return null
    throw e
  }
}

export async function createPost(payload: CreatePostPayload): Promise<Post> {
  const memberId = currentMemberId()
  if (!memberId) {
    throw new Error('You must be signed in to create a post.')
  }
  const resp = await apiClient.post<Post>('/posts/create', {
    ...payload,
    author_member_id: memberId,
  })
  return unwrapApiData<Post>(resp.data)
}
