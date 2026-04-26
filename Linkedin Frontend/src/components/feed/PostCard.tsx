import { Globe2, MessageCircle, Send, ThumbsUp, Repeat2, X } from 'lucide-react'
import { memo, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { Post } from '../../types/feed'
import { ingestEvent } from '../../api/analytics'
import { PostOptionsMenu } from './PostOptionsMenu'
import { Avatar, Button, Card, Divider, Input, Modal } from '../ui'
import { useProfileStore } from '../../store/profileStore'
import { FEED_QUERY_KEY } from './PostFeed'
import type { ListFeedResponse } from '../../types/feed'
import { useToast } from '../ui/Toast'
import { useAuthStore } from '../../store/authStore'

type PostCardProps = {
  post: Post
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

function PostCardComponent({ post }: PostCardProps): JSX.Element {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const authUser = useAuthStore((s) => s.user)
  const [localPost, setLocalPost] = useState(post)
  const [deleted, setDeleted] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [liked, setLiked] = useState(post.liked_by_me)
  const [commentsOpen, setCommentsOpen] = useState(false)
  const [commentText, setCommentText] = useState('')
  const [replyInputOpen, setReplyInputOpen] = useState<string | null>(null)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)

  const contentShouldClamp = localPost.content.length > 180
  const displayedReactions = useMemo(() => (liked ? localPost.reactions_count + 1 : localPost.reactions_count), [liked, localPost.reactions_count])
  const memberId = useProfileStore((s) => s.profile.member_id)
  const firstName = useProfileStore((s) => s.profile.first_name)
  const lastName = useProfileStore((s) => s.profile.last_name)
  const headline = useProfileStore((s) => s.profile.headline)
  const avatarUrl = useProfileStore((s) => s.profile.profile_photo_url)
  const profileName = `${firstName} ${lastName}`.trim()
  const isOwnPost =
    Boolean(memberId && localPost.author_member_id && localPost.author_member_id === memberId) ||
    (localPost.author_degree === '1st' && (localPost.author_name === 'You' || localPost.author_name === profileName))
  const authorName = isOwnPost ? profileName || 'You' : localPost.author_name
  const authorHeadline = isOwnPost ? headline || 'Add your headline' : localPost.author_headline
  const authorAvatar = isOwnPost ? avatarUrl || undefined : localPost.author_avatar_url ?? undefined
  const isFollowingAuthor = isOwnPost || localPost.author_degree === '1st'

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
    if (isOwnPost) {
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

  function confirmDeletePost(): void {
    setDeleted(true)
    updateCaches((p) => (p.post_id === localPost.post_id ? null : p))
    if (isOwnPost) {
      const state = useProfileStore.getState()
      state.patchProfile({
        activity_posts: state.profile.activity_posts.filter((ap) => ap.id !== localPost.post_id),
      })
    }
    toast({ variant: 'success', title: 'Post deleted.' })
    setDeleteConfirmOpen(false)
  }

  function submitComment(): void {
    if (!commentText.trim()) return
    const nextText = commentText.trim()
    setLocalPost((prev) => ({ ...prev, comments_count: prev.comments_count + 1 }))
    if (isOwnPost) {
      const state = useProfileStore.getState()
      state.patchProfile({
        activity_posts: state.profile.activity_posts.map((ap) =>
          ap.id === localPost.post_id ? { ...ap, comments: ap.comments + 1 } : ap,
        ),
      })
    }
    if (authUser?.member_id && localPost.author_member_id) {
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
    setCommentText('')
  }

  function toggleLike(): void {
    setLiked((prev) => {
      const next = !prev
      if (next && authUser?.member_id && localPost.author_member_id) {
        void ingestEvent({
          event_type: 'post.engagement',
          trace_id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          actor_id: authUser.member_id,
          entity: { entity_type: 'post', entity_id: localPost.post_id },
          idempotency_key: `post-like-${authUser.member_id}-${localPost.post_id}-${Date.now()}`,
          metadata: { action: 'like', target_member_id: localPost.author_member_id },
        })
      }
      if (isOwnPost) {
        const state = useProfileStore.getState()
        state.patchProfile({
          activity_posts: state.profile.activity_posts.map((ap) =>
            ap.id === localPost.post_id ? { ...ap, reactions: Math.max(0, ap.reactions + (next ? 1 : -1)) } : ap,
          ),
        })
      }
      return next
    })
  }

  if (deleted) return <></>

  return (
    <>
    <Card>
      <Card.Body className="space-y-3 p-4">
        <header className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-3">
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
          </div>
          <div className="flex items-center gap-1">
            <PostOptionsMenu variant="feed" post={localPost} isOwnPost={isOwnPost} onEditPost={onEditPost} onDeletePost={onDeletePost} />
            {!isFollowingAuthor ? (
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

        {localPost.media_type === 'image' && localPost.media_url ? (
          <div className="overflow-hidden rounded-md border border-border bg-black/5" style={{ aspectRatio: '16 / 9' }}>
            <img src={localPost.media_url} alt="Post media" className="h-full w-full object-cover" />
          </div>
        ) : null}

        {localPost.media_type === 'article' ? (
          <a href="#" className="block overflow-hidden rounded-md border border-border bg-surface hover:bg-black/[0.03]">
            <div className="flex flex-col sm:flex-row">
              {localPost.media_url ? <img src={localPost.media_url} alt="Article preview" className="h-28 w-full object-cover sm:w-44" /> : null}
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
            onClick={toggleLike}
            className="flex items-center justify-center gap-1 rounded-md py-2 text-sm font-semibold text-text-secondary transition hover:bg-black/5"
          >
            <ThumbsUp className={`h-4 w-4 transition ${liked ? 'scale-110 text-brand-primary' : ''}`} aria-hidden />
            <span className={liked ? 'text-brand-primary' : ''}>Like</span>
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
                    submitComment()
                  }
                }}
              />
              <Button size="sm" onClick={submitComment}>Post</Button>
            </div>

            {localPost.comments.slice(0, 2).map((comment) => (
              <div key={comment.comment_id} className="space-y-2">
                <div className="flex items-start gap-2">
                  <Avatar size="sm" name={comment.author_name} src={comment.author_avatar_url ?? undefined} />
                  <div className="rounded-lg bg-surface p-2">
                    <p className="text-xs font-semibold text-text-primary">{comment.author_name}</p>
                    <p className="text-xs text-text-tertiary">{comment.author_headline}</p>
                    <p className="mt-1 text-sm text-text-primary">{comment.text}</p>
                  </div>
                </div>
                <button type="button" className="ml-10 text-xs font-semibold text-text-secondary hover:text-text-primary" onClick={() => setReplyInputOpen(replyInputOpen === comment.comment_id ? null : comment.comment_id)}>
                  Reply
                </button>
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
        <Button variant="tertiary" onClick={() => setDeleteConfirmOpen(false)}>
          Cancel
        </Button>
        <Button variant="destructive" onClick={confirmDeletePost}>
          Delete
        </Button>
      </Modal.Footer>
    </Modal>
    </>
  )
}

export const PostCard = memo(PostCardComponent)
