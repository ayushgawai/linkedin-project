import { CalendarDays, File, ImageIcon, PartyPopper, PlaySquare, Vote, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { currentMemberId, uploadPostMedia } from '../../api/posts'
import { readFileAsDataUrl, readImageFileAsDataUrl } from '../../lib/imageUpload'
import { Avatar, Button, Modal, Select, Textarea, useToast } from '../ui'
import { useProfileStore } from '../../store/profileStore'
import type { CreatePostPayload } from '../../types/feed'

type CreatePostModalProps = {
  isOpen: boolean
  onClose: () => void
  onCreatePost: (payload: CreatePostPayload) => void
  isSubmitting: boolean
}

export function CreatePostModal({ isOpen, onClose, onCreatePost, isSubmitting }: CreatePostModalProps): JSX.Element {
  const { toast } = useToast()
  const [content, setContent] = useState('')
  const [visibility, setVisibility] = useState<'anyone' | 'connections'>('anyone')
  const [activeTool, setActiveTool] = useState<'image' | 'video' | 'event' | 'celebrate' | 'poll' | 'article' | null>(null)
  /** Pasted or resolved HTTPS URL (not a blob preview). */
  const [pastedMediaUrl, setPastedMediaUrl] = useState('')
  const [pendingImageFile, setPendingImageFile] = useState<File | null>(null)
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null)
  const [pendingVideoFile, setPendingVideoFile] = useState<File | null>(null)
  const [articleTitle, setArticleTitle] = useState('')
  const [articleSource, setArticleSource] = useState('')
  const [pollOptionA, setPollOptionA] = useState('')
  const [pollOptionB, setPollOptionB] = useState('')
  const [eventDate, setEventDate] = useState('')
  const [eventLabel, setEventLabel] = useState('')
  const [localSubmitting, setLocalSubmitting] = useState(false)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const videoInputRef = useRef<HTMLInputElement>(null)
  const docInputRef = useRef<HTMLInputElement>(null)
  const firstName = useProfileStore((s) => s.profile.first_name)
  const lastName = useProfileStore((s) => s.profile.last_name)
  const avatar = useProfileStore((s) => s.profile.profile_photo_url)
  const displayName = `${firstName} ${lastName}`.trim() || 'You'

  const mediaActions = [
    { key: 'image', label: 'Photo', icon: ImageIcon },
    { key: 'video', label: 'Video', icon: PlaySquare },
    { key: 'event', label: 'Event', icon: CalendarDays },
    { key: 'celebrate', label: 'Celebrate', icon: PartyPopper },
    { key: 'poll', label: 'Poll', icon: Vote },
    { key: 'article', label: 'Article', icon: File },
  ] as const

  function revokePreview(): void {
    if (imagePreviewUrl?.startsWith('blob:')) {
      URL.revokeObjectURL(imagePreviewUrl)
    }
    setImagePreviewUrl(null)
  }

  useEffect(() => {
    if (!isOpen) {
      setContent('')
      setVisibility('anyone')
      setActiveTool(null)
      setPastedMediaUrl('')
      setPendingImageFile(null)
      revokePreview()
      setPendingVideoFile(null)
      setArticleTitle('')
      setArticleSource('')
      setPollOptionA('')
      setPollOptionB('')
      setEventDate('')
      setEventLabel('')
      setLocalSubmitting(false)
    }
  }, [isOpen])

  function buildPayload(resolvedMediaUrl?: string): CreatePostPayload {
    const trimmed = content.trim()
    const payload: CreatePostPayload = { content: trimmed, visibility }
    const mediaUrl = resolvedMediaUrl ?? pastedMediaUrl.trim()

    if (activeTool === 'image' && mediaUrl) {
      payload.media_type = 'image'
      payload.media_url = mediaUrl
    } else if (activeTool === 'video' && mediaUrl) {
      payload.media_type = 'article'
      payload.media_url = mediaUrl
      payload.article_title = articleTitle || 'Video'
      payload.article_source = articleSource || 'Uploaded from composer'
    } else if (activeTool === 'article' && (articleTitle || mediaUrl)) {
      payload.media_type = 'article'
      payload.media_url = mediaUrl || undefined
      payload.article_title = articleTitle || 'Shared document'
      payload.article_source = articleSource || 'LinkedIn'
    } else if (activeTool === 'poll' && pollOptionA.trim() && pollOptionB.trim()) {
      payload.media_type = 'poll'
      payload.poll_options = [
        { id: 'opt-1', label: pollOptionA.trim(), votes: 0 },
        { id: 'opt-2', label: pollOptionB.trim(), votes: 0 },
      ]
    }
    return payload
  }

  async function handleSubmit(): Promise<void> {
    const trimmed = content.trim()
    if (!trimmed) return
    if (!currentMemberId()) {
      toast({ variant: 'error', title: 'Sign in required', description: 'You need to be logged in to post.' })
      return
    }

    let resolvedMediaUrl: string | undefined

    try {
      if (activeTool === 'image') {
        if (pendingImageFile) {
          setLocalSubmitting(true)
          const { url: dataUrl, error: readErr } = await readImageFileAsDataUrl(pendingImageFile, 12)
          if (readErr || !dataUrl) {
            toast({ variant: 'error', title: 'Could not read image', description: readErr ?? 'Unknown error' })
            setLocalSubmitting(false)
            return
          }
          resolvedMediaUrl = await uploadPostMedia(dataUrl)
        } else if (pastedMediaUrl.trim()) {
          const u = pastedMediaUrl.trim()
          if (u.startsWith('blob:')) {
            toast({
              variant: 'error',
              title: 'Invalid image',
              description: 'Re-select your photo with Upload — preview links cannot be saved.',
            })
            return
          }
          resolvedMediaUrl = u
        }
      }

      if (activeTool === 'video') {
        if (pendingVideoFile) {
          setLocalSubmitting(true)
          const { url: dataUrl, error: readErr } = await readFileAsDataUrl(pendingVideoFile, 35)
          if (readErr || !dataUrl) {
            toast({ variant: 'error', title: 'Could not read video', description: readErr ?? 'Unknown error' })
            setLocalSubmitting(false)
            return
          }
          resolvedMediaUrl = await uploadPostMedia(dataUrl)
        } else if (pastedMediaUrl.trim()) {
          const u = pastedMediaUrl.trim()
          if (u.startsWith('blob:')) {
            toast({ variant: 'error', title: 'Invalid video', description: 'Upload again or paste a hosted video URL.' })
            return
          }
          resolvedMediaUrl = u
        }
      }

      const payload = buildPayload(resolvedMediaUrl)
      if (!payload.content.trim()) return

      onCreatePost(payload)
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'message' in err ? String((err as { message: string }).message) : 'Upload failed'
      toast({ variant: 'error', title: 'Could not publish post', description: msg })
    } finally {
      setLocalSubmitting(false)
    }
  }

  const busy = isSubmitting || localSubmitting

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Create a post" size="lg">
      <Modal.Header>Create a post</Modal.Header>
      <Modal.Body className="space-y-4">
        <div className="flex items-center gap-3">
          <Avatar size="md" name={displayName} src={avatar || undefined} />
          <div>
            <p className="text-sm font-semibold text-text-primary">{displayName}</p>
            <div className="mt-1 w-44">
              <Select
                variant="native"
                value={visibility}
                onValueChange={(value) => setVisibility(value as 'anyone' | 'connections')}
                options={[
                  { value: 'anyone', label: 'Anyone' },
                  { value: 'connections', label: 'Connections only' },
                ]}
                className="h-8 text-xs"
              />
            </div>
          </div>
        </div>

        <Textarea
          autoResize
          value={content}
          onChange={(event) => setContent(event.target.value)}
          placeholder="What do you want to talk about?"
          className="min-h-40 border-0 p-0 text-base shadow-none focus-visible:ring-0"
        />

        {activeTool ? (
          <div className="rounded-md border border-border bg-surface p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">{activeTool} options</p>
              <button
                type="button"
                className="rounded-full p-1 text-text-secondary hover:bg-black/5"
                onClick={() => {
                  setActiveTool(null)
                  setPastedMediaUrl('')
                  setPendingImageFile(null)
                  setPendingVideoFile(null)
                  revokePreview()
                }}
                aria-label="Clear selected tool"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>

            {activeTool === 'image' ? (
              <div className="space-y-2">
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    revokePreview()
                    setPendingImageFile(file)
                    setPastedMediaUrl('')
                    setImagePreviewUrl(URL.createObjectURL(file))
                  }}
                />
                <Button variant="secondary" size="sm" onClick={() => imageInputRef.current?.click()}>
                  Upload image
                </Button>
                {imagePreviewUrl ? (
                  <div className="overflow-hidden rounded-md border border-border">
                    <img src={imagePreviewUrl} alt="" className="max-h-48 w-full object-cover" />
                  </div>
                ) : null}
                <input
                  className="w-full rounded-md border border-border bg-surface-raised px-3 py-2 text-sm"
                  placeholder="or paste image URL (https://…)"
                  value={pastedMediaUrl}
                  onChange={(e) => {
                    setPastedMediaUrl(e.target.value)
                    setPendingImageFile(null)
                    revokePreview()
                  }}
                />
              </div>
            ) : null}

            {activeTool === 'video' ? (
              <div className="space-y-2">
                <input
                  ref={videoInputRef}
                  type="file"
                  accept="video/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    setPendingVideoFile(file)
                    setPastedMediaUrl('')
                  }}
                />
                <Button variant="secondary" size="sm" onClick={() => videoInputRef.current?.click()}>
                  Upload video
                </Button>
                {pendingVideoFile ? <p className="text-xs text-text-secondary">Selected: {pendingVideoFile.name}</p> : null}
                <input
                  className="w-full rounded-md border border-border bg-surface-raised px-3 py-2 text-sm"
                  placeholder="Video title"
                  value={articleTitle}
                  onChange={(e) => setArticleTitle(e.target.value)}
                />
                <input
                  className="w-full rounded-md border border-border bg-surface-raised px-3 py-2 text-sm"
                  placeholder="Source (optional)"
                  value={articleSource}
                  onChange={(e) => setArticleSource(e.target.value)}
                />
                <input
                  className="w-full rounded-md border border-border bg-surface-raised px-3 py-2 text-sm"
                  placeholder="or paste hosted video URL"
                  value={pastedMediaUrl}
                  onChange={(e) => {
                    setPastedMediaUrl(e.target.value)
                    setPendingVideoFile(null)
                  }}
                />
              </div>
            ) : null}

            {activeTool === 'article' ? (
              <div className="space-y-2">
                <input
                  ref={docInputRef}
                  type="file"
                  accept=".pdf,.doc,.docx,.ppt,.pptx"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) {
                      setArticleTitle(file.name)
                      setPastedMediaUrl('')
                    }
                  }}
                />
                <Button variant="secondary" size="sm" onClick={() => docInputRef.current?.click()}>
                  Attach document
                </Button>
                <input
                  className="w-full rounded-md border border-border bg-surface-raised px-3 py-2 text-sm"
                  placeholder="Article/document title"
                  value={articleTitle}
                  onChange={(e) => setArticleTitle(e.target.value)}
                />
                <input
                  className="w-full rounded-md border border-border bg-surface-raised px-3 py-2 text-sm"
                  placeholder="Preview image URL (optional)"
                  value={pastedMediaUrl}
                  onChange={(e) => setPastedMediaUrl(e.target.value)}
                />
                <input
                  className="w-full rounded-md border border-border bg-surface-raised px-3 py-2 text-sm"
                  placeholder="Source (optional)"
                  value={articleSource}
                  onChange={(e) => setArticleSource(e.target.value)}
                />
              </div>
            ) : null}

            {activeTool === 'poll' ? (
              <div className="space-y-2">
                <input
                  className="w-full rounded-md border border-border bg-surface-raised px-3 py-2 text-sm"
                  placeholder="Option 1"
                  value={pollOptionA}
                  onChange={(e) => setPollOptionA(e.target.value)}
                />
                <input
                  className="w-full rounded-md border border-border bg-surface-raised px-3 py-2 text-sm"
                  placeholder="Option 2"
                  value={pollOptionB}
                  onChange={(e) => setPollOptionB(e.target.value)}
                />
              </div>
            ) : null}

            {activeTool === 'event' || activeTool === 'celebrate' ? (
              <div className="space-y-2">
                <input
                  className="w-full rounded-md border border-border bg-surface-raised px-3 py-2 text-sm"
                  placeholder={activeTool === 'event' ? 'Event title' : 'What are you celebrating?'}
                  value={eventLabel}
                  onChange={(e) => setEventLabel(e.target.value)}
                />
                <input
                  type="date"
                  className="w-full rounded-md border border-border bg-surface-raised px-3 py-2 text-sm"
                  value={eventDate}
                  onChange={(e) => setEventDate(e.target.value)}
                />
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    const label = eventLabel.trim() || (activeTool === 'event' ? 'Event' : 'Celebration')
                    const date = eventDate ? ` on ${eventDate}` : ''
                    setContent((prev) => `${prev.trim()}\n${activeTool === 'event' ? '📅' : '🎉'} ${label}${date}`.trim())
                  }}
                >
                  Add to post text
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="flex items-center gap-2 border-t border-border pt-3">
          {mediaActions.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`inline-flex h-9 w-9 items-center justify-center rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 ${activeTool === item.key ? 'bg-brand-primary/15 text-brand-primary' : 'text-text-secondary hover:bg-black/5'}`}
              aria-label={item.label}
              onClick={() => setActiveTool((prev) => (prev === item.key ? null : item.key))}
            >
              <item.icon className="h-5 w-5" aria-hidden />
            </button>
          ))}
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button disabled={!content.trim()} loading={busy} onClick={() => void handleSubmit()}>
          Post
        </Button>
      </Modal.Footer>
    </Modal>
  )
}
