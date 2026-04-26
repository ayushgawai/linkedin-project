import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, ChevronUp, Image as ImageIcon, Paperclip, PenSquare, Smile, X } from 'lucide-react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ingestEvent } from '../../api/analytics'
import { listConnections } from '../../api/connections'
import {
  listMessages,
  listThreadsByUser,
  markThreadRead,
  sendMessage,
} from '../../api/messaging'
import { broadcastMessagingThreadUpdate, subscribeMessagingThreadUpdates } from '../../lib/messagingCrossTab'
import { useClickOutside } from '../../hooks/useClickOutside'
import { useAuthStore } from '../../store/authStore'
import type { MessageRecord, ThreadListItem } from '../../types/messaging'
import { Avatar, Button, Input, Textarea } from '../ui'

const DOCK_EMOJIS = ['😀', '😊', '👍', '🙏', '💼', '✅', '🔥', '💡']
const MAX_IMAGE_BYTES = 1.4 * 1024 * 1024
const MAX_ATTACH_BYTES = 900 * 1024

function readFileAsDataUrl(file: File, maxBytes: number): Promise<string> {
  return new Promise((resolve, reject) => {
    if (file.size > maxBytes) {
      reject(new Error('File is too large for this demo.'))
      return
    }
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Could not read file'))
    reader.readAsDataURL(file)
  })
}

const Bubble = memo(function Bubble({ message, mine }: { message: MessageRecord; mine: boolean }): JSX.Element {
  const hasText = Boolean(message.text?.trim())
  return (
    <div
      className={`max-w-[90%] rounded-2xl px-2.5 py-1.5 text-xs ${mine ? 'bg-brand-primary text-white' : 'bg-black/5 text-text-primary'}`}
    >
      {message.image_url ? (
        <img src={message.image_url} alt="" className="mb-1 max-h-32 w-full rounded-md object-contain" />
      ) : null}
      {message.attachment_url ? (
        <a
          href={message.attachment_url}
          download={message.attachment_filename ?? 'file'}
          className={`mb-1 block truncate text-[10px] underline ${mine ? 'text-white/95' : 'text-brand-primary'}`}
        >
          📎 {message.attachment_filename ?? 'File'}
        </a>
      ) : null}
      {hasText ? <p className="whitespace-pre-wrap">{message.text}</p> : null}
    </div>
  )
})

type MiniChatProps = {
  threadId: string
  thread: ThreadListItem | undefined
  onClose: () => void
}

function MiniChatPanel({ threadId, thread, onClose }: MiniChatProps): JSX.Element {
  const queryClient = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const imageRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const emojiRef = useRef<HTMLDivElement>(null)
  const [text, setText] = useState('')
  const [pendingImage, setPendingImage] = useState<string | null>(null)
  const [pendingAttach, setPendingAttach] = useState<{ url: string; filename: string } | null>(null)
  const [emojiOpen, setEmojiOpen] = useState(false)

  useClickOutside(emojiRef, () => setEmojiOpen(false), emojiOpen)

  const messagesQuery = useQuery({
    queryKey: ['messages', threadId],
    queryFn: () => listMessages(threadId, { page: 1, pageSize: 100 }),
    enabled: Boolean(threadId) && Boolean(user),
    staleTime: 5_000,
  })

  useEffect(() => {
    if (!user?.member_id || !threadId) return
    void markThreadRead(threadId, user.member_id).then(() => {
      void queryClient.invalidateQueries({ queryKey: ['threads', user.member_id] })
      void queryClient.invalidateQueries({ queryKey: ['threads'] })
    })
  }, [threadId, user?.member_id, queryClient])

  const sendMutation = useMutation({
    mutationFn: async (vars: {
      text: string
      image_url?: string | null
      attachment_url?: string | null
      attachment_filename?: string | null
      clientIdempotencyKey: string
    }) => {
      if (!user) throw new Error('Not signed in')
      return sendMessage(threadId, user.member_id, vars.text, vars.clientIdempotencyKey, {
        image_url: vars.image_url ?? undefined,
        attachment_url: vars.attachment_url ?? undefined,
        attachment_filename: vars.attachment_filename ?? undefined,
      })
    },
    onSuccess: () => {
      setText('')
      setPendingImage(null)
      setPendingAttach(null)
      void queryClient.invalidateQueries({ queryKey: ['messages', threadId] })
      void queryClient.invalidateQueries({ queryKey: ['threads', user?.member_id] })
      void queryClient.invalidateQueries({ queryKey: ['threads'] })
      broadcastMessagingThreadUpdate(threadId)
      void ingestEvent({
        event_type: 'message.sent',
        trace_id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        actor_id: user!.member_id,
        entity: { entity_type: 'thread', entity_id: threadId },
        idempotency_key: `dock-msg-${Date.now()}`,
      })
    },
  })

  const messages = messagesQuery.data?.messages ?? []
  const scrollRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages.length])

  const canSend = Boolean(text.trim() || pendingImage || pendingAttach)

  const onPickImage = useCallback(async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file?.type.startsWith('image/')) return
    try {
      setPendingImage(await readFileAsDataUrl(file, MAX_IMAGE_BYTES))
      setPendingAttach(null)
    } catch {
      /* ignore */
    }
  }, [])

  const onPickFile = useCallback(async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      setPendingAttach({ url: await readFileAsDataUrl(file, MAX_ATTACH_BYTES), filename: file.name })
      setPendingImage(null)
    } catch {
      /* ignore */
    }
  }, [])

  return (
    <div className="flex h-[min(420px,55vh)] w-[min(288px,92vw)] flex-col overflow-hidden rounded-t-lg border border-border bg-surface-raised shadow-lg">
      <div className="flex items-center gap-2 border-b border-border px-2 py-2">
        <Avatar size="sm" name={thread?.participant.full_name ?? 'Chat'} src={thread?.participant.profile_photo_url ?? undefined} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-text-primary">{thread?.participant.full_name ?? 'Chat'}</p>
          <Link to={`/messaging/${threadId}`} className="text-[10px] text-brand-primary hover:underline">
            Open in inbox
          </Link>
        </div>
        <button type="button" className="rounded-full p-1 text-text-secondary hover:bg-black/5" aria-label="Close chat" onClick={onClose}>
          <X className="h-4 w-4" />
        </button>
      </div>
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto px-2 py-2">
        {messagesQuery.isLoading ? <p className="text-xs text-text-secondary">Loading…</p> : null}
        {messages.map((m) => {
          const mine = m.sender_id === user?.member_id
          return (
            <div key={m.message_id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div className="flex max-w-[95%] items-center gap-1.5">
                {!mine ? <Avatar size="xs" name={m.sender_name} /> : null}
                <Bubble message={m} mine={mine} />
                {mine && m.status === 'sending' ? (
                  <span className="shrink-0 text-[9px] text-text-tertiary">Sending…</span>
                ) : null}
                {mine && (m.status === 'delivered' || m.status === 'sent') ? (
                  <span className="shrink-0 text-[9px] text-text-tertiary">Delivered</span>
                ) : null}
                {mine && m.status === 'read' ? <span className="shrink-0 text-[9px] text-text-tertiary">Read</span> : null}
              </div>
            </div>
          )
        })}
      </div>
      <div className="border-t border-border p-2">
        <input ref={imageRef} type="file" accept="image/*" className="hidden" onChange={onPickImage} />
        <input ref={fileRef} type="file" className="hidden" onChange={onPickFile} />
        {pendingImage || pendingAttach ? (
          <div className="mb-1 flex items-center gap-1 rounded border border-border p-1 text-[10px]">
            {pendingImage ? <img src={pendingImage} alt="" className="h-8 w-8 rounded object-cover" /> : <span className="truncate">📎 {pendingAttach?.filename}</span>}
            <button type="button" className="ml-auto text-text-secondary hover:text-text-primary" onClick={() => { setPendingImage(null); setPendingAttach(null) }}>
              ×
            </button>
          </div>
        ) : null}
        <div ref={emojiRef} className="relative mb-1 flex gap-0.5">
          <button type="button" className="rounded p-1 hover:bg-black/5" aria-label="Image" onClick={() => imageRef.current?.click()}>
            <ImageIcon className="h-3.5 w-3.5 text-text-secondary" />
          </button>
          <button type="button" className="rounded p-1 hover:bg-black/5" aria-label="Attach" onClick={() => fileRef.current?.click()}>
            <Paperclip className="h-3.5 w-3.5 text-text-secondary" />
          </button>
          <button type="button" className="rounded p-1 hover:bg-black/5" aria-label="Emoji" onClick={() => setEmojiOpen((o) => !o)}>
            <Smile className="h-3.5 w-3.5 text-text-secondary" />
          </button>
          {emojiOpen ? (
            <div className="absolute bottom-full left-0 z-10 mb-1 rounded border border-border bg-surface-raised p-1 shadow">
              <div className="grid max-h-28 grid-cols-8 gap-0.5 overflow-y-auto">
                {DOCK_EMOJIS.map((em) => (
                  <button key={em} type="button" className="p-0.5 text-base leading-none hover:bg-black/5" onClick={() => { setText((t) => t + em); setEmojiOpen(false) }}>
                    {em}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
        <div className="flex gap-1">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Write a message…"
            autoResize
            className="min-h-9 max-h-24 flex-1 text-xs"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                if (canSend) {
                  sendMutation.mutate({
                    text: text.trim(),
                    image_url: pendingImage,
                    attachment_url: pendingAttach?.url ?? null,
                    attachment_filename: pendingAttach?.filename ?? null,
                    clientIdempotencyKey: crypto.randomUUID(),
                  })
                }
              }
            }}
          />
          <Button
            size="sm"
            className="shrink-0 self-end"
            disabled={!canSend || sendMutation.isPending}
            onClick={() =>
              sendMutation.mutate({
                text: text.trim(),
                image_url: pendingImage,
                attachment_url: pendingAttach?.url ?? null,
                attachment_filename: pendingAttach?.filename ?? null,
                clientIdempotencyKey: crypto.randomUUID(),
              })
            }
          >
            Send
          </Button>
        </div>
      </div>
    </div>
  )
}

export function FloatingMessagingDock(): JSX.Element | null {
  const user = useAuthStore((s) => s.user)
  const location = useLocation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [listOpen, setListOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<'Focused' | 'Other'>('Focused')
  const [openThreadIds, setOpenThreadIds] = useState<string[]>([])

  const onFullMessaging = location.pathname.startsWith('/messaging')

  useEffect(() => {
    return subscribeMessagingThreadUpdates((updatedThreadId) => {
      void queryClient.invalidateQueries({ queryKey: ['messages', updatedThreadId] })
      void queryClient.invalidateQueries({ queryKey: ['threads', user?.member_id] })
      void queryClient.invalidateQueries({ queryKey: ['threads'] })
    })
  }, [queryClient, user?.member_id])

  const connectionsQuery = useQuery({
    queryKey: ['connections', user?.member_id, 'dock'],
    queryFn: () => listConnections(user!.member_id),
    enabled: Boolean(user) && !onFullMessaging,
    staleTime: 20_000,
  })

  const connectionSet = useMemo(() => {
    const uid = user?.member_id
    if (!uid) return new Set<string>()
    return new Set(
      (connectionsQuery.data ?? [])
        .filter((c) => c.status === 'accepted')
        .map((c) => (c.addressee_member_id === uid ? c.requester_member_id : c.addressee_member_id)),
    )
  }, [connectionsQuery.data, user?.member_id])

  const threadsQuery = useQuery({
    queryKey: ['threads', user?.member_id],
    queryFn: () => listThreadsByUser(user!.member_id),
    enabled: Boolean(user) && !onFullMessaging,
    staleTime: 10_000,
  })

  const filteredThreads = useMemo(() => {
    const list = threadsQuery.data ?? []
    const byTab = tab === 'Other' ? list.filter((t) => !connectionSet.has(t.participant.member_id)) : list
    const q = search.trim().toLowerCase()
    if (!q) return byTab
    return byTab.filter((t) => t.participant.full_name.toLowerCase().includes(q))
  }, [threadsQuery.data, tab, connectionSet, search])

  const threadById = useMemo(() => {
    const map = new Map<string, ThreadListItem>()
    for (const t of threadsQuery.data ?? []) map.set(t.thread_id, t)
    return map
  }, [threadsQuery.data])

  const openChat = useCallback((threadId: string) => {
    setListOpen(true)
    setOpenThreadIds((prev) => {
      const next = prev.filter((id) => id !== threadId)
      next.unshift(threadId)
      return next.slice(0, 3)
    })
  }, [])

  const closeChat = useCallback((threadId: string) => {
    setOpenThreadIds((prev) => prev.filter((id) => id !== threadId))
  }, [])

  if (!user || onFullMessaging) return null

  return (
    <div className="pointer-events-none fixed bottom-0 right-2 z-[85] hidden flex-col items-end gap-1 lg:flex" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div className="pointer-events-auto flex flex-row-reverse items-end gap-2">
        {openThreadIds.map((id) => (
          <MiniChatPanel key={id} threadId={id} thread={threadById.get(id)} onClose={() => closeChat(id)} />
        ))}
        {listOpen ? (
          <div className="flex h-[min(420px,55vh)] w-[min(320px,94vw)] flex-col overflow-hidden rounded-t-lg border border-border bg-surface-raised shadow-lg">
            <div className="border-b border-border px-2 py-2">
              <Input placeholder="Search messages" value={search} onChange={(e) => setSearch(e.target.value)} className="text-xs" />
              <div className="mt-2 flex gap-1 text-xs font-semibold">
                <button
                  type="button"
                  className={tab === 'Focused' ? 'border-b-2 border-brand-primary pb-0.5 text-text-primary' : 'text-text-secondary'}
                  onClick={() => setTab('Focused')}
                >
                  Focused
                </button>
                <button
                  type="button"
                  className={tab === 'Other' ? 'border-b-2 border-brand-primary pb-0.5 text-text-primary' : 'text-text-secondary'}
                  onClick={() => setTab('Other')}
                >
                  Other
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {filteredThreads.length === 0 ? (
                <p className="px-3 py-6 text-center text-xs text-text-secondary">No conversations</p>
              ) : (
                filteredThreads.map((t) => (
                  <button
                    key={t.thread_id}
                    type="button"
                    className="flex w-full items-start gap-2 border-b border-border px-2 py-2 text-left hover:bg-black/[0.04]"
                    onClick={() => openChat(t.thread_id)}
                  >
                    <Avatar size="sm" name={t.participant.full_name} src={t.participant.profile_photo_url ?? undefined} />
                    <div className="min-w-0 flex-1">
                      <div className="flex justify-between gap-1">
                        <span className="truncate text-xs font-semibold text-text-primary">{t.participant.full_name}</span>
                        <span className="shrink-0 text-[10px] text-text-tertiary">{t.last_message_time}</span>
                      </div>
                      <p className="truncate text-[11px] text-text-secondary">{t.last_message_preview}</p>
                    </div>
                    {t.unread_count > 0 ? <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-brand-primary" /> : null}
                  </button>
                ))
              )}
            </div>
            <div className="border-t border-border px-2 py-2">
              <Link to="/messaging" className="text-xs font-semibold text-brand-primary hover:underline">
                Go to inbox
              </Link>
            </div>
          </div>
        ) : null}
      </div>

      <div className="pointer-events-auto flex min-w-[220px] max-w-[92vw] items-center gap-2 rounded-t-lg border border-b-0 border-border bg-surface-raised px-3 py-2 shadow-lg">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          onClick={() => setListOpen(true)}
          aria-label="Open messaging list"
        >
          <span className="relative shrink-0">
            <Avatar size="sm" name={user.full_name} src={user.profile_photo_url ?? undefined} />
            <span className="absolute bottom-0 right-0 h-2 w-2 rounded-full border border-white bg-success" aria-hidden />
          </span>
          <span className="truncate text-sm font-semibold text-text-primary">Messaging</span>
        </button>
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            className="rounded-full p-1.5 text-text-secondary hover:bg-black/5"
            aria-label="Open full inbox"
            onClick={(e) => {
              e.stopPropagation()
              navigate('/messaging')
            }}
          >
            <PenSquare className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="rounded-full p-1.5 text-text-secondary hover:bg-black/5"
            aria-label={listOpen ? 'Collapse inbox' : 'Expand inbox'}
            onClick={(e) => {
              e.stopPropagation()
              setListOpen((o) => !o)
            }}
          >
            {listOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>
  )
}
