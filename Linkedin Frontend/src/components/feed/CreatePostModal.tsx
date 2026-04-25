import { CalendarDays, File, ImageIcon, PartyPopper, PlaySquare, Vote, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Avatar, Button, Modal, Select, Textarea } from '../ui'
import { useProfileStore } from '../../store/profileStore'
import type { CreatePostPayload } from '../../types/feed'

type CreatePostModalProps = {
  isOpen: boolean
  onClose: () => void
  onCreatePost: (payload: CreatePostPayload) => void
  isSubmitting: boolean
}

export function CreatePostModal({ isOpen, onClose, onCreatePost, isSubmitting }: CreatePostModalProps): JSX.Element {
  const [content, setContent] = useState('')
  const [visibility, setVisibility] = useState<'anyone' | 'connections'>('anyone')
  const [activeTool, setActiveTool] = useState<'image' | 'video' | 'event' | 'celebrate' | 'poll' | 'article' | null>(null)
  const [mediaUrl, setMediaUrl] = useState('')
  const [articleTitle, setArticleTitle] = useState('')
  const [articleSource, setArticleSource] = useState('')
  const [pollOptionA, setPollOptionA] = useState('')
  const [pollOptionB, setPollOptionB] = useState('')
  const [eventDate, setEventDate] = useState('')
  const [eventLabel, setEventLabel] = useState('')
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

  useEffect(() => {
    if (!isOpen) {
      setContent('')
      setVisibility('anyone')
      setActiveTool(null)
      setMediaUrl('')
      setArticleTitle('')
      setArticleSource('')
      setPollOptionA('')
      setPollOptionB('')
      setEventDate('')
      setEventLabel('')
    }
  }, [isOpen])

  function buildPayload(): CreatePostPayload {
    const trimmed = content.trim()
    const payload: CreatePostPayload = { content: trimmed, visibility }
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

  function submit(): void {
    const payload = buildPayload()
    if (!payload.content.trim()) return
    onCreatePost(payload)
  }

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
                  setMediaUrl('')
                }}
                aria-label="Clear selected tool"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {activeTool === 'image' ? (
              <div className="space-y-2">
                <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) setMediaUrl(URL.createObjectURL(file))
                }} />
                <Button variant="secondary" size="sm" onClick={() => imageInputRef.current?.click()}>Upload image</Button>
                <input
                  className="w-full rounded-md border border-border bg-surface-raised px-3 py-2 text-sm"
                  placeholder="or paste image URL"
                  value={mediaUrl}
                  onChange={(e) => setMediaUrl(e.target.value)}
                />
              </div>
            ) : null}

            {activeTool === 'video' ? (
              <div className="space-y-2">
                <input ref={videoInputRef} type="file" accept="video/*" className="hidden" onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) setMediaUrl(URL.createObjectURL(file))
                }} />
                <Button variant="secondary" size="sm" onClick={() => videoInputRef.current?.click()}>Upload video</Button>
                <input className="w-full rounded-md border border-border bg-surface-raised px-3 py-2 text-sm" placeholder="Video title" value={articleTitle} onChange={(e) => setArticleTitle(e.target.value)} />
                <input className="w-full rounded-md border border-border bg-surface-raised px-3 py-2 text-sm" placeholder="Source (optional)" value={articleSource} onChange={(e) => setArticleSource(e.target.value)} />
              </div>
            ) : null}

            {activeTool === 'article' ? (
              <div className="space-y-2">
                <input ref={docInputRef} type="file" accept=".pdf,.doc,.docx,.ppt,.pptx" className="hidden" onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) {
                    setArticleTitle(file.name)
                    setMediaUrl('')
                  }
                }} />
                <Button variant="secondary" size="sm" onClick={() => docInputRef.current?.click()}>Attach document</Button>
                <input className="w-full rounded-md border border-border bg-surface-raised px-3 py-2 text-sm" placeholder="Article/document title" value={articleTitle} onChange={(e) => setArticleTitle(e.target.value)} />
                <input className="w-full rounded-md border border-border bg-surface-raised px-3 py-2 text-sm" placeholder="Preview image URL (optional)" value={mediaUrl} onChange={(e) => setMediaUrl(e.target.value)} />
                <input className="w-full rounded-md border border-border bg-surface-raised px-3 py-2 text-sm" placeholder="Source (optional)" value={articleSource} onChange={(e) => setArticleSource(e.target.value)} />
              </div>
            ) : null}

            {activeTool === 'poll' ? (
              <div className="space-y-2">
                <input className="w-full rounded-md border border-border bg-surface-raised px-3 py-2 text-sm" placeholder="Option 1" value={pollOptionA} onChange={(e) => setPollOptionA(e.target.value)} />
                <input className="w-full rounded-md border border-border bg-surface-raised px-3 py-2 text-sm" placeholder="Option 2" value={pollOptionB} onChange={(e) => setPollOptionB(e.target.value)} />
              </div>
            ) : null}

            {activeTool === 'event' || activeTool === 'celebrate' ? (
              <div className="space-y-2">
                <input className="w-full rounded-md border border-border bg-surface-raised px-3 py-2 text-sm" placeholder={activeTool === 'event' ? 'Event title' : 'What are you celebrating?'} value={eventLabel} onChange={(e) => setEventLabel(e.target.value)} />
                <input type="date" className="w-full rounded-md border border-border bg-surface-raised px-3 py-2 text-sm" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
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
        <Button
          disabled={!content.trim()}
          loading={isSubmitting}
          onClick={submit}
        >
          Post
        </Button>
      </Modal.Footer>
    </Modal>
  )
}
