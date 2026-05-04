import { Globe2, MessageCircle, Send, ThumbsUp, Repeat2, Trash2, X } from 'lucide-react'
import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import type { ApiError } from '../../types'
import type { Post } from '../../types/feed'
import { addPostComment, deletePost, deletePostComment, memberIdsEqual, togglePostLike } from '../../api/posts'
import { ingestEvent } from '../../api/analytics'
import { rewriteMinioUrlForApiGateway } from '../../lib/mediaUrl'
import { PostOptionsMenu } from './PostOptionsMenu'
import { Avatar, Button, Card, Divider, Input, Modal } from '../ui'
import { useProfileStore } from '../../store/profileStore'
import { FEED_QUERY_KEY } from './PostFeed'
import type { ListFeedResponse } from '../../types/feed'
import { useToast } from '../ui/Toast'
import { useAuthStore } from '../../store/authStore'

type PostCardProps = {
  post: Post
  /** Hide feed-only “dismiss” control (e.g. profile / activity pages). */
  showDismiss?: boolean
  /** Open the comment thread when the post has comments (e.g. profile activity matches feed). */
  expandCommentsIfPresent?: boolean
}

function ReactionIcons(): JSX.Element {
  return (
    <div className="flex items-center -space-x-1">
      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-white bg-brand-primary text-[10px] text-white">👍</span>
      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-white bg-success text-[10px] text-white">🎉</span>
      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-white bg-warning text-[10px] text-white">💡</span>
    </div>
  )
}

function PostCardComponent({ post, showDismiss = true, expandCommentsIfPresent = false }: PostCardProps): JSX.Element {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const authUser = useAuthStore((s) => s.user)
  const [localPost, setLocalPost] = useState(post)
  const [deleted, setDeleted] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [likeBusy, setLikeBusy] = useState(false)
  const [commentBusy, setCommentBusy] = useState(false)
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null)
  const [commentsOpen, setCommentsOpen] = useState(false)
  const [commentText, setCommentText] = useState('')
  const [replyInputOpen, setReplyInputOpen] = useState<string | null>(null)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deleteBusy, setDeleteBusy] = useState(false)

  // Merge server identity when the feed refetches so author_member_id stays correct for delete, without
  // clobbering local optimistic edits (content, counts) on unrelated parent re-renders.
  useEffect(() => {
    setLocalPost((prev) => {
      if (prev.post_id !== post.post_id) return post
      return {
        ...prev,
        author_member_id: post.author_member_id ?? prev.author_member_id,
        author_name: post.author_name,
        author_headline: post.author_headline,
        author_avatar_url: post.author_avatar_url ?? prev.author_avatar_url,
        reactions_count: post.reactions_count,
        comments_count: post.comments_count,
        liked_by_me: post.liked_by_me,
        comments: Array.isArray(post.comments) ? post.comments : prev.comments,
      }
    })
  }, [post])

  const didAutoExpandForPost = useRef<string | null>(null)
  useEffect(() => {
    if (!expandCommentsIfPresent) return
    if (didAutoExpandForPost.current === localPost.post_id) return
    if (localPost.comments.length > 0 || localPost.comments_count > 0) {
      setCommentsOpen(true)
      didAutoExpandForPost.current = localPost.post_id
    }
  }, [expandCommentsIfPresent, localPost.comments.length, localPost.comments_count, localPost.post_id])

  const imageDisplayUrl = useMemo(() => {
    const u = localPost.media_url
    if (!u || localPost.media_type !== 'image') return null
    return rewriteMinioUrlForApiGateway(u) ?? u
  }, [localPost.media_url, localPost.media_type])

  const contentShouldClamp = localPost.content.length > 180
  const displayedReactions = localPost.reactions_count
  const memberId = useProfileStore((s) => s.profile.member_id)
  const firstName = useProfileStore((s) => s.profile.first_name)
  const lastName = useProfileStore((s) => s.profile.last_name)
  const headline = useProfileStore((s) => s.profile.headline)
  const avatarUrl = useProfileStore((s) => s.profile.profile_photo_url)
  const profileName = `${firstName} ${lastName}`.trim()
  /** Strict id match (profile or auth) — required for delete/edit. */
  const canModifyPost =
    memberIdsEqual(localPost.author_member_id, memberId) ||
    memberIdsEqual(localPost.author_member_id, authUser?.member_id)
  const isOwnPost =
    canModifyPost ||
    (localPost.author_degree === '1st' && (localPost.author_name === 'You' || localPost.author_name === profileName))
  /** Match profile Activity tab when the feed marks this as your post but `author_member_id` was omitted. */
  const shouldSyncProfileActivity = canModifyPost || (isOwnPost && Boolean(authUser?.member_id))

  // When the feed refetches (e.g. someone else commented), keep profile Activity cards aligned.
  useEffect(() => {
    const authId = authUser?.member_id
    if (!authId) return
    const feedSaysOwn =
      memberIdsEqual(post.author_member_id, authId) ||
      memberIdsEqual(post.author_member_id, memberId) ||
      (post.author_degree === '1st' && (post.author_name === 'You' || post.author_name === profileName))
    if (!feedSaysOwn) return
    const state = useProfileStore.getState()
    if (!state.profile.activity_posts.some((a) => a.id === post.post_id)) return
    const nextComments = post.comments_count
    const nextReactions = post.reactions_count
    state.patchProfile({
      activity_posts: state.profile.activity_posts.map((a) =>
        a.id === post.post_id
          ? a.comments === nextComments && a.reactions === nextReactions
            ? a
            : { ...a, comments: nextComments, reactions: nextReactions }
          : a,
      ),
    })
  }, [
    authUser?.member_id,
    memberId,
    post.author_degree,
    post.author_member_id,
    post.author_name,
    post.comments_count,
    post.post_id,
    post.reactions_count,
    profileName,
  ])

  const authorName = isOwnPost ? profileName || 'You' : localPost.author_name
  const authorHeadline = isOwnPost ? headline || 'Add your headline' : localPost.author_headline
  const authorAvatar = isOwnPost ? avatarUrl || undefined : localPost.author_avatar_url ?? undefined
  const authorMemberId = isOwnPost ? (memberId || authUser?.member_id || null) : (localPost.author_member_id || null)
  const isFollowingAuthor = isOwnPost || localPost.author_degree === '1st'

  function invalidateFeedAndPostDetail(postId: string): void {
    void queryClient.invalidateQueries({ queryKey: [FEED_QUERY_KEY] })
    void queryClient.invalidateQueries({ queryKey: ['post', postId] })
  }

  function updateCaches(mutator: (p: Post) => Post | null): void {
    queryClient.setQueriesData<{ pages: ListFeedResponse[]; pageParams: number[] }>({ queryKey: [FEED_QUERY_KEY] }, (existing) => {
      if (!existing) return existing
      return {
        ...existing,
        pages: existing.pages.map((page) => ({
          ...page,
          posts: page.posts
            .map((p) => mutator(p))
            .filter((p): p is Post => Boolean(p)),
        })),
      }
    })
  }

  function onEditPost(): void {
    const nextContent = window.prompt('Edit post text', localPost.content)
    if (nextContent == null) return
    const trimmed = nextContent.trim()
    if (!trimmed) {
      toast({ variant: 'error', title: 'Post content cannot be empty.' })
      return
    }
    setLocalPost((prev) => ({ ...prev, content: trimmed }))
    updateCaches((p) => (p.post_id === localPost.post_id ? { ...p, content: trimmed } : p))
    if (canModifyPost) {
      const state = useProfileStore.getState()
      state.patchProfile({
        activity_posts: state.profile.activity_posts.map((ap) =>
          ap.id === localPost.post_id ? { ...ap, text: trimmed } : ap,
        ),
      })
    }
    toast({ variant: 'success', title: 'Post updated.' })
  }

  function onDeletePost(): void {
    setDeleteConfirmOpen(true)
  }

  function dismissPost(): void {
    setDeleted(true)
    updateCaches((p) => (p.post_id === localPost.post_id ? null : p))
  }

  async function confirmDeletePost(): Promise<void> {
    setDeleteBusy(true)
    try {
      await deletePost(localPost.post_id, localPost.author_member_id)
      setDeleted(true)
      updateCaches((p) => (p.post_id === localPost.post_id ? null : p))
      invalidateFeedAndPostDetail(localPost.post_id)
      if (canModifyPost) {
        const state = useProfileStore.getState()
        state.patchProfile({
          activity_posts: state.profile.activity_posts.filter((ap) => ap.id !== localPost.post_id),
        })
      }
      toast({ variant: 'success', title: 'Post deleted.' })
      setDeleteConfirmOpen(false)
    } catch (err: unknown) {
      const ae = err as Partial<ApiError>
      let desc = typeof ae.message === 'string' ? ae.message : 'Could not delete post.'
      const d = ae.details
      if (d && typeof d === 'object' && d !== null) {
        const raw = d as Record<string, unknown>
        if (typeof raw.details === 'string' && raw.details) desc = `${desc} — ${raw.details}`
        else if (typeof raw.hint === 'string' && raw.hint) desc = `${desc} — ${raw.hint}`
        else if (typeof raw.upstream_target === 'string') desc = `${desc} (${raw.upstream_target})`
      }
      toast({ variant: 'error', title: 'Delete failed', description: desc })
    } finally {
      setDeleteBusy(false)
    }
  }

  async function submitComment(): Promise<void> {
    if (!commentText.trim()) return
    if (!authUser?.member_id) {
      toast({ variant: 'error', title: 'Sign in to comment.' })
      return
    }
    const nextText = commentText.trim()
    setCommentBusy(true)
    try {
      const out = await addPostComment(localPost.post_id, nextText)
      setCommentText('')
      setLocalPost((prev) => ({
        ...prev,
        comments_count: out.comments_count,
        comments: [out.comment, ...prev.comments.filter((c) => c.comment_id !== out.comment.comment_id)].slice(0, 8),
      }))
      updateCaches((p) =>
        p.post_id === localPost.post_id
          ? {
              ...p,
              comments_count: out.comments_count,
              comments: [out.comment, ...p.comments.filter((c) => c.comment_id !== out.comment.comment_id)].slice(0, 8),
            }
          : p,
      )
      invalidateFeedAndPostDetail(localPost.post_id)
      void queryClient.invalidateQueries({ queryKey: ['notifications'], exact: false })
      if (shouldSyncProfileActivity) {
        const state = useProfileStore.getState()
        state.patchProfile({
          activity_posts: state.profile.activity_posts.map((ap) =>
            ap.id === localPost.post_id ? { ...ap, comments: out.comments_count } : ap,
          ),
        })
      }
      if (localPost.author_member_id) {
        void ingestEvent({
          event_type: 'post.engagement',
          trace_id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          actor_id: authUser.member_id,
          entity: { entity_type: 'post', entity_id: localPost.post_id },
          idempotency_key: `post-comment-${authUser.member_id}-${localPost.post_id}-${Date.now()}`,
          metadata: { action: 'comment', target_member_id: localPost.author_member_id, text_length: nextText.length },
        })
      }
    } catch (err: unknown) {
      const ae = err as Partial<ApiError>
      toast({
        variant: 'error',
        title: 'Could not post comment',
        description: typeof ae.message === 'string' ? ae.message : 'Try again.',
      })
    } finally {
      setCommentBusy(false)
    }
  }

  function canDeleteCommentRow(c: Post['comments'][number]): boolean {
    return (
      memberIdsEqual(c.author_member_id, memberId) || memberIdsEqual(c.author_member_id, authUser?.member_id)
    )
  }

  async function removeComment(commentId: string): Promise<void> {
    if (!authUser?.member_id) return
    const postId = localPost.post_id
    setDeletingCommentId(commentId)
    try {
      const out = await deletePostComment(commentId)
      setLocalPost((prev) => ({
        ...prev,
        comments_count: out.comments_count,
        comments: prev.comments.filter((c) => c.comment_id !== commentId).slice(0, 8),
      }))
      updateCaches((p) =>
        p.post_id === postId
          ? {
              ...p,
              comments_count: out.comments_count,
              comments: p.comments.filter((c) => c.comment_id !== commentId).slice(0, 8),
            }
          : p,
      )
      invalidateFeedAndPostDetail(postId)
      if (shouldSyncProfileActivity) {
        const state = useProfileStore.getState()
        state.patchProfile({
          activity_posts: state.profile.activity_posts.map((ap) =>
            ap.id === postId ? { ...ap, comments: out.comments_count } : ap,
          ),
        })
      }
      toast({ variant: 'success', title: 'Comment deleted.' })
    } catch (err: unknown) {
      const ae = err as Partial<ApiError>
      toast({
        variant: 'error',
        title: 'Could not delete comment',
        description: typeof ae.message === 'string' ? ae.message : 'Try again.',
      })
    } finally {
      setDeletingCommentId(null)
    }
  }

  async function toggleLike(): Promise<void> {
    if (!authUser?.member_id) {
      toast({ variant: 'error', title: 'Sign in to like posts.' })
      return
    }
    setLikeBusy(true)
    try {
      const out = await togglePostLike(localPost.post_id)
      setLocalPost((p) => ({
        ...p,
        reactions_count: out.reactions_count,
        liked_by_me: out.liked_by_me,
      }))
      updateCaches((p) =>
        p.post_id === localPost.post_id
          ? { ...p, reactions_count: out.reactions_count, liked_by_me: out.liked_by_me }
          : p,
      )
      invalidateFeedAndPostDetail(localPost.post_id)
      if (out.liked_by_me) {
        void queryClient.invalidateQueries({ queryKey: ['notifications'], exact: false })
      }
      if (localPost.author_member_id) {
        void ingestEvent({
          event_type: 'post.engagement',
          trace_id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          actor_id: authUser.member_id,
          entity: { entity_type: 'post', entity_id: localPost.post_id },
          idempotency_key: `post-like-${authUser.member_id}-${localPost.post_id}-${Date.now()}`,
          metadata: {
            action: out.liked_by_me ? 'like' : 'unlike',
            target_member_id: localPost.author_member_id,
          },
        })
      }
      if (shouldSyncProfileActivity) {
        const state = useProfileStore.getState()
        state.patchProfile({
          activity_posts: state.profile.activity_posts.map((ap) =>
            ap.id === localPost.post_id ? { ...ap, reactions: out.reactions_count } : ap,
          ),
        })
      }
    } catch (err: unknown) {
      const ae = err as Partial<ApiError>
      toast({
        variant: 'error',
        title: 'Could not update like',
        description: typeof ae.message === 'string' ? ae.message : 'Try again.',
      })
    } finally {
      setLikeBusy(false)
    }
  }

  if (deleted) return <></>

  return (
    <>
    <Card>
      <Card.Body className="space-y-3 p-4">
        <header className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-3">
            {authorMemberId ? (
              <Link to={`/in/${authorMemberId}`} className="flex items-start gap-3">
                <Avatar size="md" name={authorName} src={authorAvatar} />
                <div>
                  <p className="text-sm font-semibold text-text-primary hover:underline">
                    {authorName} <span className="font-normal text-text-secondary">• {localPost.author_degree}</span>
                  </p>
                  <p className="text-xs text-text-secondary">{authorHeadline}</p>
                  <p className="flex items-center gap-1 text-xs text-text-tertiary">
                    {localPost.created_time_ago}
                    <span>•</span>
                    <Globe2 className="h-3.5 w-3.5" aria-hidden />
                  </p>
                </div>
              </Link>
            ) : (
              <>
                <Avatar size="md" name={authorName} src={authorAvatar} />
                <div>
                  <p className="text-sm font-semibold text-text-primary">
                    {authorName} <span className="font-normal text-text-secondary">• {localPost.author_degree}</span>
                  </p>
                  <p className="text-xs text-text-secondary">{authorHeadline}</p>
                  <p className="flex items-center gap-1 text-xs text-text-tertiary">
                    {localPost.created_time_ago}
                    <span>•</span>
                    <Globe2 className="h-3.5 w-3.5" aria-hidden />
                  </p>
                </div>
              </>
            )}
          </div>
          <div className="flex items-center gap-1">
            <PostOptionsMenu
              variant="feed"
              post={localPost}
              isOwnPost={canModifyPost}
              onEditPost={onEditPost}
              onDeletePost={onDeletePost}
            />
            {showDismiss && !isFollowingAuthor ? (
              <button
                type="button"
                onClick={dismissPost}
                className="rounded-full p-1.5 text-text-secondary transition hover:bg-black/5"
                aria-label="Dismiss post"
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            ) : null}
          </div>
        </header>

        <div className="space-y-2">
          <p className={expanded || !contentShouldClamp ? 'text-sm text-text-primary' : 'text-sm text-text-primary [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:3] overflow-hidden'}>
            {localPost.content}
          </p>
          {contentShouldClamp ? (
            <button type="button" onClick={() => setExpanded((prev) => !prev)} className="text-xs font-semibold text-text-secondary hover:text-text-primary">
              {expanded ? 'See less' : '...see more'}
            </button>
          ) : null}
        </div>

        {localPost.media_type === 'image' && imageDisplayUrl ? (
          <div className="overflow-hidden rounded-md border border-border bg-black/5" style={{ aspectRatio: '16 / 9' }}>
            <img src={imageDisplayUrl} alt="Post media" className="h-full w-full object-cover" />
          </div>
        ) : null}

        {localPost.media_type === 'article' ? (
          <a href="#" className="block overflow-hidden rounded-md border border-border bg-surface hover:bg-black/[0.03]">
            <div className="flex flex-col sm:flex-row">
              {localPost.media_url ? (
                <img
                  src={rewriteMinioUrlForApiGateway(localPost.media_url) ?? localPost.media_url}
                  alt="Article preview"
                  className="h-28 w-full object-cover sm:w-44"
                />
              ) : null}
              <div className="p-3">
                <p className="text-sm font-semibold text-text-primary">{localPost.article_title}</p>
                <p className="mt-1 text-xs text-text-secondary">{localPost.article_source}</p>
              </div>
            </div>
          </a>
        ) : null}

        {localPost.media_type === 'poll' && localPost.poll_options ? (
          <div className="space-y-2 rounded-md border border-border p-3">
            {localPost.poll_options.map((option) => {
              const total = localPost.poll_options?.reduce((sum, item) => sum + item.votes, 0) ?? 1
              const percentage = Math.round((option.votes / total) * 100)
              return (
                <div key={option.id}>
                  <div className="mb-1 flex justify-between text-xs text-text-secondary">
                    <span>{option.label}</span>
                    <span>{percentage}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-black/10">
                    <div className="h-full rounded-full bg-brand-primary/60" style={{ width: `${percentage}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        ) : null}

        <div className="flex items-center justify-between text-xs text-text-secondary">
          <div className="flex items-center gap-2">
            <ReactionIcons />
            <span>{displayedReactions}</span>
          </div>
          <span>{localPost.comments_count} comments • {localPost.reposts_count} reposts</span>
        </div>

        <Divider className="my-0" />

        <div className="grid grid-cols-4 gap-1">
          <button
            type="button"
            disabled={likeBusy}
            onClick={() => void toggleLike()}
            className="flex items-center justify-center gap-1 rounded-md py-2 text-sm font-semibold text-text-secondary transition hover:bg-black/5 disabled:cursor-wait disabled:opacity-60"
          >
            <ThumbsUp
              className={`h-4 w-4 transition ${localPost.liked_by_me ? 'scale-110 text-brand-primary' : ''}`}
              aria-hidden
            />
            <span className={localPost.liked_by_me ? 'text-brand-primary' : ''}>Like</span>
          </button>
          <button type="button" onClick={() => setCommentsOpen((prev) => !prev)} className="flex items-center justify-center gap-1 rounded-md py-2 text-sm font-semibold text-text-secondary transition hover:bg-black/5">
            <MessageCircle className="h-4 w-4" aria-hidden /> Comment
          </button>
          <button type="button" className="flex items-center justify-center gap-1 rounded-md py-2 text-sm font-semibold text-text-secondary transition hover:bg-black/5">
            <Repeat2 className="h-4 w-4" aria-hidden /> Repost
          </button>
          <button type="button" className="flex items-center justify-center gap-1 rounded-md py-2 text-sm font-semibold text-text-secondary transition hover:bg-black/5">
            <Send className="h-4 w-4" aria-hidden /> Send
          </button>
        </div>

        {commentsOpen ? (
          <div className="space-y-3 pt-1">
            <div className="flex items-center gap-2">
              <Avatar size="sm" name="You" />
              <Input
                placeholder="Add a comment..."
                value={commentText}
                onChange={(event) => setCommentText(event.target.value)}
                onKeyDown={(event) => {
                  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                    void submitComment()
                  }
                }}
              />
              <Button size="sm" loading={commentBusy} disabled={commentBusy} onClick={() => void submitComment()}>
                Post
              </Button>
            </div>

            {localPost.comments.slice(0, 8).map((comment) => (
              <div key={comment.comment_id} className="space-y-2">
                <div className="flex items-start gap-2">
                  {comment.author_member_id ? (
                    <Link to={`/in/${comment.author_member_id}`} className="shrink-0">
                      <Avatar size="sm" name={comment.author_name} src={comment.author_avatar_url ?? undefined} />
                    </Link>
                  ) : (
                    <Avatar size="sm" name={comment.author_name} src={comment.author_avatar_url ?? undefined} />
                  )}
                  <div className="min-w-0 flex-1 rounded-lg bg-surface p-2">
                    {comment.author_member_id ? (
                      <Link to={`/in/${comment.author_member_id}`} className="text-xs font-semibold text-text-primary hover:underline">
                        {comment.author_name}
                      </Link>
                    ) : (
                      <p className="text-xs font-semibold text-text-primary">{comment.author_name}</p>
                    )}
                    <p className="text-xs text-text-tertiary">{comment.author_headline}</p>
                    <p className="mt-1 text-sm text-text-primary">{comment.text}</p>
                  </div>
                </div>
                <div className="ml-10 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    className="text-xs font-semibold text-text-secondary hover:text-text-primary"
                    onClick={() => setReplyInputOpen(replyInputOpen === comment.comment_id ? null : comment.comment_id)}
                  >
                    Reply
                  </button>
                  {canDeleteCommentRow(comment) ? (
                    <button
                      type="button"
                      disabled={deletingCommentId === comment.comment_id}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-danger hover:text-danger/90 disabled:cursor-wait disabled:opacity-50"
                      onClick={() => void removeComment(comment.comment_id)}
                    >
                      <Trash2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      Delete
                    </button>
                  ) : null}
                </div>
                {replyInputOpen === comment.comment_id ? (
                  <div className="ml-10 flex items-center gap-2">
                    <Input placeholder="Write a reply..." />
                    <Button size="sm">Send</Button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
      </Card.Body>
    </Card>
    <Modal isOpen={deleteConfirmOpen} onClose={() => setDeleteConfirmOpen(false)} title="Delete post?" size="sm">
      <Modal.Header>Delete post?</Modal.Header>
      <Modal.Body>
        <p className="text-sm text-text-secondary">This action cannot be undone. This post will be removed from your profile and feed.</p>
      </Modal.Body>
      <Modal.Footer>
        <Button type="button" variant="tertiary" onClick={() => setDeleteConfirmOpen(false)}>
          Cancel
        </Button>
        <Button type="button" variant="destructive" loading={deleteBusy} onClick={() => void confirmDeletePost()}>
          Delete
        </Button>
      </Modal.Footer>
    </Modal>
    </>
  )
}

export const PostCard = memo(PostCardComponent)
