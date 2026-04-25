export type FeedTab = 'for_you' | 'following'
export type FeedSort = 'top' | 'recent'

export type PostMediaType = 'text' | 'image' | 'article' | 'poll'

export type PostComment = {
  comment_id: string
  author_name: string
  author_headline: string
  author_avatar_url: string | null
  text: string
  time_ago: string
}

export type PostPollOption = {
  id: string
  label: string
  votes: number
}

export type Post = {
  post_id: string
  /** When set, feed cards can treat as current user for live name/headline/avatar from profileStore. */
  author_member_id?: string | null
  author_name: string
  author_degree: '1st' | '2nd' | '3rd'
  author_headline: string
  author_avatar_url: string | null
  created_time_ago: string
  visibility: 'anyone' | 'connections'
  content: string
  media_type: PostMediaType
  media_url?: string
  article_title?: string
  article_source?: string
  poll_options?: PostPollOption[]
  reactions_count: number
  comments_count: number
  reposts_count: number
  liked_by_me: boolean
  reaction_icons: Array<'like' | 'celebrate' | 'insightful'>
  comments: PostComment[]
}

export type ListFeedParams = {
  page: number
  pageSize: number
  tab: FeedTab
  sort: FeedSort
}

export type ListFeedResponse = {
  posts: Post[]
  page: number
  has_more: boolean
}

export type CreatePostPayload = {
  content: string
  visibility: 'anyone' | 'connections'
  media_type?: PostMediaType
  media_url?: string
  article_title?: string
  article_source?: string
  poll_options?: PostPollOption[]
}
