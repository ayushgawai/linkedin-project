import { apiClient } from './client'
import type { CreatePostPayload, ListFeedParams, ListFeedResponse, Post } from '../types/feed'
import { useAuthStore } from '../store/authStore'

export async function listFeed(params: ListFeedParams): Promise<ListFeedResponse> {
  const viewerId = useAuthStore.getState().user?.member_id ?? null
  const resp = await apiClient.post<ListFeedResponse>('/posts/list', {
    ...params,
    viewer_member_id: viewerId,
  })
  return resp.data
}

export async function createPost(payload: CreatePostPayload): Promise<Post> {
  const memberId = useAuthStore.getState().user?.member_id ?? null
  const resp = await apiClient.post<Post>('/posts/create', {
    ...payload,
    author_member_id: memberId,
  })
  return resp.data
}
