import { Bookmark, Code2, Copy, Eye, Flag, MessageCircleQuestion, MoreHorizontal, Pencil, Send, Star, Trash2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { buildPostEmbedFragment, getSavedEntryPermalink } from '../../lib/savedPostPermalink'
import { useSavedPostsStore } from '../../store/savedPostsStore'
import type { Post } from '../../types/feed'
import type { SavedPostEntry } from '../../types/saved'
import { Dropdown } from '../ui'
import { useToast } from '../ui/Toast'

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

type FeedProps = { variant: 'feed'; post: Post }
type SavedProps = { variant: 'saved'; entry: SavedPostEntry }

type PostOptionsMenuProps = (FeedProps | SavedProps) & {
  triggerClassName?: string
  isOwnPost?: boolean
  onEditPost?: () => void
  onDeletePost?: () => void
}

export function PostOptionsMenu(props: PostOptionsMenuProps): JSX.Element {
  const { variant, triggerClassName, isOwnPost = false, onEditPost, onDeletePost } = props
  const post = props.variant === 'feed' ? props.post : props.entry.post
  const savedEntry: SavedPostEntry | undefined = props.variant === 'saved' ? props.entry : undefined

  const save = useSavedPostsStore((s) => s.save)
  const remove = useSavedPostsStore((s) => s.remove)
  const isSaved = useSavedPostsStore((s) => s.isSaved(post.post_id))
  const { toast } = useToast()
  const navigate = useNavigate()

  const permalink = savedEntry
    ? getSavedEntryPermalink(savedEntry)
    : `${window.location.origin}/feed?post=${encodeURIComponent(post.post_id)}`

  async function onCopyLink(): Promise<void> {
    const ok = await copyText(permalink)
    toast({
      variant: ok ? 'success' : 'error',
      title: ok ? 'Link copied' : 'Could not copy link',
    })
  }

  function onSendMessage(): void {
    const draft = `Check out this post: ${permalink}`
    void copyText(draft).then((ok) => {
      toast({
        variant: ok ? 'success' : 'info',
        title: ok ? 'Message draft copied' : 'Opening messaging',
        description: ok ? 'Paste it into a conversation, or use the composer on the next screen.' : undefined,
      })
    })
    sessionStorage.setItem('messaging:shareDraft', draft)
    navigate('/messaging')
  }

  async function onEmbed(): Promise<void> {
    if (!savedEntry) {
      return
    }
    const html = buildPostEmbedFragment(savedEntry)
    const ok = await copyText(html)
    toast({
      variant: ok ? 'success' : 'error',
      title: ok ? 'Embed code copied' : 'Could not copy embed',
    })
  }

  function onReport(): void {
    toast({ variant: 'info', title: "Thanks for letting us know. We'll review this report." })
  }

  return (
    <Dropdown.Root>
      <Dropdown.Trigger
        showEndChevron={false}
        className={triggerClassName ?? '!rounded-full !p-1.5 !px-1.5 text-text-secondary'}
        aria-label="Post options"
      >
        <MoreHorizontal className="h-5 w-5" aria-hidden />
      </Dropdown.Trigger>
      <Dropdown.Content className="min-w-56">
        {variant === 'feed' ? (
          <>
            {isOwnPost ? (
              <Dropdown.Item onSelect={() => toast({ variant: 'success', title: 'Featured on top of profile.' })}>
                <span className="flex items-center gap-2">
                  <Star className="h-4 w-4 shrink-0" aria-hidden />
                  Feature on top of profile
                </span>
              </Dropdown.Item>
            ) : null}
            <Dropdown.Item
              onSelect={() => {
                if (isSaved) {
                  remove(post.post_id)
                } else {
                  save(post)
                }
              }}
            >
              <span className="flex items-center gap-2">
                <Bookmark className="h-4 w-4 shrink-0" aria-hidden fill={isSaved ? 'currentColor' : 'none'} />
                {isSaved ? 'Unsave' : 'Save'}
              </span>
            </Dropdown.Item>
            <Dropdown.Item onSelect={() => void onCopyLink()}>
              <span className="flex items-center gap-2">
                <Copy className="h-4 w-4 shrink-0" aria-hidden />
                Copy link to post
              </span>
            </Dropdown.Item>
            <Dropdown.Item
              onSelect={() =>
                toast({
                  variant: 'info',
                  title: 'Embed is available in Saved posts view.',
                })
              }
            >
              <span className="flex items-center gap-2">
                <Code2 className="h-4 w-4 shrink-0" aria-hidden />
                Embed this post
              </span>
            </Dropdown.Item>
            {isOwnPost ? (
              <Dropdown.Item onSelect={() => onEditPost?.()}>
                <span className="flex items-center gap-2">
                  <Pencil className="h-4 w-4 shrink-0" aria-hidden />
                  Edit post
                </span>
              </Dropdown.Item>
            ) : null}
            {isOwnPost ? (
              <Dropdown.Item onSelect={() => onDeletePost?.()}>
                <span className="flex items-center gap-2 text-danger">
                  <Trash2 className="h-4 w-4 shrink-0" aria-hidden />
                  Delete post
                </span>
              </Dropdown.Item>
            ) : null}
            <Dropdown.Item
              onSelect={() =>
                toast({
                  variant: 'info',
                  title: 'Comment settings are not connected yet.',
                })
              }
            >
              <span className="flex items-center gap-2">
                <MessageCircleQuestion className="h-4 w-4 shrink-0" aria-hidden />
                Who can comment on this post?
              </span>
            </Dropdown.Item>
            <Dropdown.Item
              onSelect={() =>
                toast({
                  variant: 'info',
                  title: `Visibility: ${post.visibility === 'anyone' ? 'Anyone' : 'Connections only'}`,
                })
              }
            >
              <span className="flex items-center gap-2">
                <Eye className="h-4 w-4 shrink-0" aria-hidden />
                Who can see this post?
              </span>
            </Dropdown.Item>
            <Dropdown.Item onSelect={onReport}>
              <span className="flex items-center gap-2">
                <Flag className="h-4 w-4 shrink-0" aria-hidden />
                Report this post
              </span>
            </Dropdown.Item>
          </>
        ) : (
          <>
            <Dropdown.Item
              onSelect={() => {
                if (savedEntry) {
                  remove(savedEntry.post.post_id)
                }
              }}
            >
              <span className="flex items-center gap-2">
                <Bookmark className="h-4 w-4 shrink-0" aria-hidden fill="currentColor" />
                Unsave
              </span>
            </Dropdown.Item>
            <Dropdown.Item onSelect={onSendMessage}>
              <span className="flex items-center gap-2">
                <Send className="h-4 w-4 shrink-0" aria-hidden />
                Send in a private message
              </span>
            </Dropdown.Item>
            <Dropdown.Item onSelect={() => void onCopyLink()}>
              <span className="flex items-center gap-2">
                <Copy className="h-4 w-4 shrink-0" aria-hidden />
                Copy link to post
              </span>
            </Dropdown.Item>
            <Dropdown.Item onSelect={() => void onEmbed()}>
              <span className="flex items-center gap-2">
                <Code2 className="h-4 w-4 shrink-0" aria-hidden />
                Embed this post
              </span>
            </Dropdown.Item>
            <Dropdown.Item onSelect={onReport}>
              <span className="flex items-center gap-2">
                <Flag className="h-4 w-4 shrink-0" aria-hidden />
                Report this post
              </span>
            </Dropdown.Item>
          </>
        )}
      </Dropdown.Content>
    </Dropdown.Root>
  )
}
