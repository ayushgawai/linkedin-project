import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Ellipsis, Image as ImageIcon, MoreHorizontal, Paperclip, PenSquare, Phone, Search, Smile, Star, Video } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ingestEvent } from '../../api/analytics'
import { listConnections } from '../../api/connections'
import {
  deleteMessage,
  deleteThreadForUser,
  editMessage,
  listMessages,
  listThreadsByUser,
  markThreadRead,
  sendMessage,
  toggleStarThread,
} from '../../api/messaging'
import { useMessagingSocket } from '../../hooks/useMessagingSocket'
import { MOCK_MESSAGES_BY_THREAD } from '../../lib/messagingMockData'
import { broadcastMessagingThreadUpdate, subscribeMessagingThreadUpdates } from '../../lib/messagingCrossTab'
import { useClickOutside } from '../../hooks/useClickOutside'
import { useMemberPresence } from '../../hooks/useMemberPresence'
import { useActionToast } from '../../hooks/useActionToast'
import { useAuthStore } from '../../store/authStore'
import type { MessageRecord, ThreadListItem } from '../../types/messaging'
import { Avatar, Button, Card, ConfirmModal, Dropdown, Input, Textarea, useToast } from '../../components/ui'
import { ComposeMessageModal } from '../../components/messaging/ComposeMessageModal'

const threadFilters = ['Focused', 'Other', 'Unread', 'My Connections'] as const

const COMPOSER_EMOJIS = ['😀', '😃', '😄', '😊', '😍', '🤔', '👍', '👎', '🙏', '👏', '💼', '✅', '❌', '🔥', '💡', '🎉', '📌', '✨']

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

const MessageBubble = memo(function MessageBubble({
  message,
  mine,
}: {
  message: MessageRecord
  mine: boolean
}): JSX.Element {
  const hasText = Boolean(message.text?.trim())
  return (
    <div
      className={`w-fit max-w-full rounded-2xl px-3 py-2 text-sm ${mine ? 'bg-brand-primary text-white' : 'bg-black/5 text-text-primary'}`}
    >
      {message.image_url ? (
        <img
          src={message.image_url}
          alt=""
          className={`mb-2 max-h-48 max-w-full rounded-md object-contain ${mine ? 'ring-1 ring-white/30' : 'ring-1 ring-black/10'}`}
        />
      ) : null}
      {message.attachment_url ? (
        <a
          href={message.attachment_url}
          download={message.attachment_filename ?? 'attachment'}
          className={`mb-2 block truncate text-xs font-semibold underline ${mine ? 'text-white/95 hover:text-white' : 'text-brand-primary hover:underline'}`}
        >
          📎 {message.attachment_filename ?? 'Attachment'}
        </a>
      ) : null}
      {hasText ? <p className="whitespace-pre-wrap">{message.text}</p> : null}
      {message.edited_at ? (
        <p className={`mt-1 text-[10px] ${mine ? 'text-white/70' : 'text-text-tertiary'}`}>Edited</p>
      ) : null}
    </div>
  )
})

function formatChunkLabel(iso: string): string {
  const date = new Date(iso)
  const now = new Date()
  const diffDays = Math.floor((now.getTime() - date.getTime()) / 86400000)
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

const MessagingSidebarThreadRow = memo(function MessagingSidebarThreadRow({
  thread,
  active,
  onSelect,
}: {
  thread: ThreadListItem
  active: boolean
  onSelect: () => void
}): JSX.Element {
  const presenceOnline = useMemberPresence(thread.participant.member_id, thread.participant.online)
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`mb-1 flex w-full items-start gap-2 rounded-md px-2 py-2 text-left ${active ? 'bg-black/5' : 'hover:bg-black/5'}`}
    >
      <div className="relative">
        <Avatar
          size="md"
          name={thread.participant.full_name}
          src={thread.participant.profile_photo_url ?? undefined}
          online={presenceOnline}
        />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex justify-between gap-2">
          <p
            className={`flex min-w-0 items-center gap-1 truncate text-sm ${thread.unread_count > 0 ? 'font-semibold text-text-primary' : 'text-text-primary'}`}
          >
            {thread.starred ? (
              <Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-500" aria-label="Starred conversation" />
            ) : null}
            <span className="truncate">{thread.participant.full_name}</span>
          </p>
          <span className="shrink-0 text-xs text-text-tertiary">{thread.last_message_time}</span>
        </div>
        <p className="truncate text-xs text-text-secondary">{thread.last_message_preview}</p>
      </div>
      {thread.unread_count > 0 ? <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-brand-primary" /> : null}
    </button>
  )
})

export default function MessagingPage(): JSX.Element {
  const { toast } = useToast()
  const actionToast = useActionToast()
  const { threadId } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const user = useAuthStore((state) => state.user)
  const token = useAuthStore((state) => state.token)

  const [activeFilter, setActiveFilter] = useState<(typeof threadFilters)[number]>('Focused')
  const [search, setSearch] = useState('')
  const [composerText, setComposerText] = useState('')
  const [typingByThread, setTypingByThread] = useState<Record<string, string | null>>({})
  const [composeOpen, setComposeOpen] = useState(false)
  const [pollingEnabled, setPollingEnabled] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState('')
  const [deletingMessageId, setDeletingMessageId] = useState<string | null>(null)
  const [deleteChatOpen, setDeleteChatOpen] = useState(false)
  const [pendingImageUrl, setPendingImageUrl] = useState<string | null>(null)
  const [pendingAttachment, setPendingAttachment] = useState<{ url: string; filename: string } | null>(null)
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const emojiWrapRef = useRef<HTMLDivElement>(null)
  const closeEmojiPicker = useCallback(() => setEmojiPickerOpen(false), [])

  useClickOutside(emojiWrapRef, closeEmojiPicker, emojiPickerOpen)

  const connectionsQuery = useQuery({
    queryKey: ['connections', user?.member_id],
    queryFn: async () => listConnections(user!.member_id),
    enabled: Boolean(user),
    staleTime: 15_000,
  })

  const connectionSet = useMemo(() => {
    const uid = user?.member_id
    if (!uid) return new Set<string>()
    const ids =
      connectionsQuery.data?.map((c) => (c.addressee_member_id === uid ? c.requester_member_id : c.addressee_member_id)) ?? []
    return new Set(ids)
  }, [connectionsQuery.data, user?.member_id])

  const threadsQuery = useQuery({
    queryKey: ['threads', user?.member_id],
    queryFn: async () => {
      if (!user) return []
      try {
        return await listThreadsByUser(user.member_id)
      } catch {
        return []
      }
    },
    enabled: Boolean(user),
    staleTime: 0,
    refetchInterval: 25_000,
  })

  const tabFilteredThreads = useMemo(() => {
    const list = threadsQuery.data ?? []
    if (activeFilter === 'Focused') {
      return list
    }
    if (activeFilter === 'Unread') {
      return list.filter((t) => t.unread_count > 0)
    }
    if (activeFilter === 'My Connections') {
      return list.filter((t) => connectionSet.has(t.participant.member_id))
    }
    if (activeFilter === 'Other') {
      return list.filter((t) => !connectionSet.has(t.participant.member_id))
    }
    return list
  }, [threadsQuery.data, activeFilter, connectionSet])

  const filteredThreads = useMemo(() => {
    const q = search.toLowerCase().trim()
    if (!q) return tabFilteredThreads
    return tabFilteredThreads.filter((thread) => thread.participant.full_name.toLowerCase().includes(q))
  }, [tabFilteredThreads, search])

  /** Starred conversations first; then preserve server order (most recent activity). */
  const orderedSidebarThreads = useMemo(() => {
    const base = threadsQuery.data ?? []
    const orderIndex = new Map(base.map((t, i) => [t.thread_id, i]))
    return [...filteredThreads].sort((a, b) => {
      const starDiff = Number(!!b.starred) - Number(!!a.starred)
      if (starDiff !== 0) return starDiff
      return (orderIndex.get(a.thread_id) ?? 999) - (orderIndex.get(b.thread_id) ?? 999)
    })
  }, [filteredThreads, threadsQuery.data])

  const activeThreadId =
    threadId ?? orderedSidebarThreads[0]?.thread_id ?? threadsQuery.data?.[0]?.thread_id ?? undefined

  const messagesQuery = useQuery({
    queryKey: ['messages', activeThreadId],
    queryFn: async () => {
      if (!activeThreadId) return { messages: [], has_more: false }
      try {
        return await listMessages(activeThreadId, { page: 1, pageSize: 200 })
      } catch {
        return { messages: MOCK_MESSAGES_BY_THREAD[activeThreadId] ?? [], has_more: false }
      }
    },
    enabled: Boolean(activeThreadId),
    refetchInterval: pollingEnabled ? 5000 : false,
    staleTime: 0,
  })

  const socket = useMessagingSocket({
    token,
    onMessageReceived: (message) => {
      queryClient.setQueryData<{ messages: MessageRecord[]; has_more: boolean }>(['messages', message.thread_id], (prev) => {
        if (!prev) return { messages: [message], has_more: false }
        return { ...prev, messages: [...prev.messages, message] }
      })
    },
    onReadReceipt: ({ thread_id, up_to_message_id }) => {
      queryClient.setQueryData<{ messages: MessageRecord[]; has_more: boolean }>(['messages', thread_id], (prev) => {
        if (!prev) return prev
        return {
          ...prev,
          messages: prev.messages.map((message) =>
            message.sender_id === user?.member_id && message.message_id <= up_to_message_id
              ? { ...message, status: 'read' }
              : message,
          ),
        }
      })
    },
    onPollingFallback: () => setPollingEnabled(true),
  })

  useEffect(() => {
    setTypingByThread(socket.typingState)
  }, [socket.typingState])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messagesQuery.data?.messages.length, activeThreadId])

  useEffect(() => {
    if (!user?.member_id || !activeThreadId) return
    void markThreadRead(activeThreadId, user.member_id).then(() => {
      void queryClient.invalidateQueries({ queryKey: ['threads', user.member_id] })
    })
  }, [user?.member_id, activeThreadId, queryClient])

  useEffect(() => {
    if (!threadId) return
    if (!threadsQuery.isFetched || threadsQuery.isFetching) return
    const data = threadsQuery.data ?? []
    if (data.length > 0 && !data.some((t) => t.thread_id === threadId)) {
      navigate('/messaging', { replace: true })
    }
  }, [threadId, threadsQuery.isFetched, threadsQuery.isFetching, threadsQuery.data, navigate])

  useEffect(() => {
    setPendingImageUrl(null)
    setPendingAttachment(null)
    setEmojiPickerOpen(false)
  }, [activeThreadId])

  useEffect(() => {
    return subscribeMessagingThreadUpdates((updatedThreadId) => {
      void queryClient.invalidateQueries({ queryKey: ['messages', updatedThreadId] })
      void queryClient.invalidateQueries({ queryKey: ['threads'] })
    })
  }, [queryClient])

  const sendMutation = useMutation({
    mutationFn: async ({
      text,
      retryMessage,
      image_url,
      attachment_url,
      attachment_filename,
      clientIdempotencyKey,
    }: {
      text: string
      retryMessage?: MessageRecord
      image_url?: string | null
      attachment_url?: string | null
      attachment_filename?: string | null
      clientIdempotencyKey: string
    }) => {
      if (!user || !activeThreadId) throw new Error('Thread not selected')
      const idempotencyKey = retryMessage?.idempotency_key ?? clientIdempotencyKey
      const optimisticId = retryMessage?.message_id ?? `tmp-${idempotencyKey}`
      const img = image_url ?? retryMessage?.image_url ?? null
      const attUrl = attachment_url ?? retryMessage?.attachment_url ?? null
      const attName = attachment_filename ?? retryMessage?.attachment_filename ?? null

      queryClient.setQueryData<{ messages: MessageRecord[]; has_more: boolean }>(['messages', activeThreadId], (prev) => {
        const optimistic: MessageRecord = {
          message_id: optimisticId,
          thread_id: activeThreadId,
          sender_id: user.member_id,
          sender_name: 'You',
          text,
          sent_at: new Date().toISOString(),
          status: 'sending',
          idempotency_key: idempotencyKey,
          image_url: img ?? undefined,
          attachment_url: attUrl ?? undefined,
          attachment_filename: attName ?? undefined,
        }
        const existing = prev?.messages.filter((message) => message.message_id !== optimisticId) ?? []
        return { messages: [...existing, optimistic], has_more: false }
      })

      const sent = await sendMessage(activeThreadId, user.member_id, text, idempotencyKey, {
        image_url: img ?? undefined,
        attachment_url: attUrl ?? undefined,
        attachment_filename: attName ?? undefined,
      })
      socket.sendMessage({ thread_id: activeThreadId, text, sender_id: user.member_id })
      await ingestEvent({
        event_type: 'message.sent',
        trace_id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        actor_id: user.member_id,
        entity: { entity_type: 'thread', entity_id: activeThreadId },
        idempotency_key: `message-sent-${idempotencyKey}`,
      })
      return { sent, optimisticId }
    },
    onSuccess: ({ sent, optimisticId }) => {
      if (!activeThreadId) return
      queryClient.setQueryData<{ messages: MessageRecord[]; has_more: boolean }>(['messages', activeThreadId], (prev) => {
        if (!prev) return prev
        return {
          ...prev,
          messages: prev.messages.map((message) => (message.message_id === optimisticId ? { ...sent, status: 'delivered' } : message)),
        }
      })
      const threads = queryClient.getQueryData<ThreadListItem[]>(['threads', user?.member_id]) ?? []
      const thread = threads.find((t) => t.thread_id === activeThreadId)
      const recipientName = thread?.participant.full_name ?? 'Recipient'
      actionToast.messageSent(recipientName)
      setComposerText('')
      setPendingImageUrl(null)
      setPendingAttachment(null)
      void queryClient.invalidateQueries({ queryKey: ['threads', user?.member_id] })
      void queryClient.invalidateQueries({ queryKey: ['threads'] })
      void queryClient.invalidateQueries({ queryKey: ['notifications'], exact: false })
      if (activeThreadId) broadcastMessagingThreadUpdate(activeThreadId)
    },
    onError: (_error, variables) => {
      if (!activeThreadId) return
      const failKey = variables.retryMessage?.idempotency_key ?? variables.clientIdempotencyKey
      queryClient.setQueryData<{ messages: MessageRecord[]; has_more: boolean }>(['messages', activeThreadId], (prev) => {
        if (!prev) return prev
        return {
          ...prev,
          messages: prev.messages.map((message) =>
            message.idempotency_key === failKey && message.status === 'sending' ? { ...message, status: 'failed' } : message,
          ),
        }
      })
    },
  })

  const editMutation = useMutation({
    mutationFn: async ({ messageId, text }: { messageId: string; text: string }) => {
      if (!user || !activeThreadId) throw new Error('Missing thread')
      return editMessage(activeThreadId, messageId, user.member_id, text)
    },
    onSuccess: (updated) => {
      if (!activeThreadId) return
      queryClient.setQueryData<{ messages: MessageRecord[]; has_more: boolean }>(['messages', activeThreadId], (prev) => {
        if (!prev) return prev
        return {
          ...prev,
          messages: prev.messages.map((m) => (m.message_id === updated.message_id ? updated : m)),
        }
      })
      setEditingMessageId(null)
      void queryClient.invalidateQueries({ queryKey: ['threads', user?.member_id] })
      void queryClient.invalidateQueries({ queryKey: ['threads'] })
      broadcastMessagingThreadUpdate(activeThreadId)
    },
  })

  const deleteMessageMutation = useMutation({
    mutationFn: async (messageId: string) => {
      if (!user || !activeThreadId) throw new Error('Missing thread')
      await deleteMessage(activeThreadId, messageId, user.member_id)
    },
    onSuccess: () => {
      if (!activeThreadId) return
      void queryClient.invalidateQueries({ queryKey: ['messages', activeThreadId] })
      void queryClient.invalidateQueries({ queryKey: ['threads', user?.member_id] })
      void queryClient.invalidateQueries({ queryKey: ['threads'] })
      broadcastMessagingThreadUpdate(activeThreadId)
      setDeletingMessageId(null)
    },
  })

  const deleteChatMutation = useMutation({
    mutationFn: async () => {
      if (!user || !activeThreadId) throw new Error('Missing thread')
      await deleteThreadForUser(activeThreadId, user.member_id)
    },
    onSuccess: () => {
      setDeleteChatOpen(false)
      void queryClient.invalidateQueries({ queryKey: ['threads', user?.member_id] })
      navigate('/messaging')
    },
  })

  const starMutation = useMutation({
    mutationFn: async () => {
      if (!user || !activeThreadId) throw new Error('Missing thread')
      return toggleStarThread(activeThreadId, user.member_id)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['threads', user?.member_id] })
    },
  })

  const canSendMessage = Boolean(composerText.trim() || pendingImageUrl || pendingAttachment)

  const onImageFileChange = useCallback(
    async (e: ChangeEvent<HTMLInputElement>): Promise<void> => {
      const file = e.target.files?.[0]
      e.target.value = ''
      if (!file || !file.type.startsWith('image/')) {
        toast({ variant: 'error', title: 'Choose an image file' })
        return
      }
      try {
        const dataUrl = await readFileAsDataUrl(file, MAX_IMAGE_BYTES)
        setPendingImageUrl(dataUrl)
        setPendingAttachment(null)
      } catch (err) {
        toast({ variant: 'error', title: err instanceof Error ? err.message : 'Could not add image' })
      }
    },
    [toast],
  )

  const onAttachFileChange = useCallback(
    async (e: ChangeEvent<HTMLInputElement>): Promise<void> => {
      const file = e.target.files?.[0]
      e.target.value = ''
      if (!file) return
      try {
        const dataUrl = await readFileAsDataUrl(file, MAX_ATTACH_BYTES)
        setPendingAttachment({ url: dataUrl, filename: file.name })
        setPendingImageUrl(null)
      } catch (err) {
        toast({ variant: 'error', title: err instanceof Error ? err.message : 'Could not attach file' })
      }
    },
    [toast],
  )

  const insertEmoji = useCallback((emoji: string) => {
    setComposerText((prev) => `${prev}${emoji}`)
    setEmojiPickerOpen(false)
  }, [])

  const submitComposer = useCallback((): void => {
    if (!canSendMessage || !user) return
    sendMutation.mutate({
      text: composerText.trim(),
      image_url: pendingImageUrl,
      attachment_url: pendingAttachment?.url ?? null,
      attachment_filename: pendingAttachment?.filename ?? null,
      clientIdempotencyKey: crypto.randomUUID(),
    })
  }, [
    canSendMessage,
    user,
    sendMutation,
    composerText,
    pendingImageUrl,
    pendingAttachment,
  ])

  const activeThread =
    orderedSidebarThreads.find((thread) => thread.thread_id === activeThreadId) ??
    (threadsQuery.data ?? []).find((thread) => thread.thread_id === activeThreadId) ??
    orderedSidebarThreads[0]

  const activeParticipantPresenceOnline = useMemberPresence(
    activeThread?.participant.member_id,
    activeThread?.participant.online ?? false,
  )

  const messages = messagesQuery.data?.messages ?? []

  useEffect(() => {
    if (!user || !activeThread) {
      return
    }
    const draft = sessionStorage.getItem('messaging:shareDraft')
    if (draft) {
      setComposerText(draft)
      sessionStorage.removeItem('messaging:shareDraft')
    }
  }, [user, activeThread])

  const grouped = useMemo(() => {
    const groups: Array<{ label: string; items: MessageRecord[] }> = []
    messages.forEach((message) => {
      const label = formatChunkLabel(message.sent_at)
      const last = groups[groups.length - 1]
      if (last?.label === label) {
        last.items.push(message)
      } else {
        groups.push({ label, items: [message] })
      }
    })
    return groups
  }, [messages])

  const isMobileConversation = Boolean(threadId)

  return (
    <div className="grid grid-cols-12 gap-3 pb-6">
      <div className={`${isMobileConversation ? 'hidden' : 'col-span-12'} lg:col-span-4 lg:block`}>
        <Card className="h-[calc(100vh-96px)]">
          <Card.Header className="flex items-center justify-between">
            <h1 className="text-xl font-semibold">Messaging</h1>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => setComposeOpen(true)} className="rounded-full p-2 hover:bg-black/5" aria-label="Compose">
                <PenSquare className="h-4 w-4" />
              </button>
            </div>
          </Card.Header>
          <Card.Body className="flex h-[calc(100%-64px)] flex-col p-0">
            <div className="px-3 pb-2">
              <div className="mb-2 flex flex-wrap gap-1">
                {threadFilters.map((filter) => (
                  <button
                    key={filter}
                    type="button"
                    onClick={() => setActiveFilter(filter)}
                    className={
                      activeFilter === filter
                        ? 'rounded-full bg-brand-primary px-2 py-1 text-xs text-white'
                        : 'rounded-full bg-black/5 px-2 py-1 text-xs text-text-secondary'
                    }
                  >
                    {filter}
                  </button>
                ))}
              </div>
              <Input placeholder="Search" leftIcon={<Search className="h-4 w-4" />} value={search} onChange={(event) => setSearch(event.target.value)} />
              <p className="mt-1.5 text-[11px] text-text-tertiary">
                {activeFilter === 'Focused'
                  ? 'Focused shows every conversation—connections, outside your network, read and unread.'
                  : activeFilter === 'Other'
                    ? 'Other shows only people who are not in your connections (e.g. new outreach).'
                    : activeFilter === 'Unread'
                      ? 'Unread shows only threads with new messages.'
                      : 'My Connections shows only people you are connected with.'}
              </p>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
              {orderedSidebarThreads.length === 0 ? (
                <p className="px-2 py-6 text-center text-sm text-text-secondary">
                  {activeFilter === 'Other'
                    ? 'No messages from people outside your network yet.'
                    : activeFilter === 'Unread'
                      ? 'You’re all caught up—no unread messages.'
                      : 'No conversations yet. Connect with people on My Network, then message them here.'}
                </p>
              ) : null}
              {orderedSidebarThreads.map((thread) => (
                <MessagingSidebarThreadRow
                  key={thread.thread_id}
                  thread={thread}
                  active={thread.thread_id === activeThreadId}
                  onSelect={() => navigate(`/messaging/${thread.thread_id}`)}
                />
              ))}
            </div>
          </Card.Body>
        </Card>
      </div>

      <div className={`${isMobileConversation ? 'col-span-12' : 'hidden'} lg:col-span-8 lg:block`}>
        <Card className="h-[calc(100vh-96px)]">
          {activeThread ? (
            <>
              <Card.Header className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {isMobileConversation ? (
                    <Link to="/messaging" className="rounded-full p-2 text-sm text-brand-primary">
                      Back
                    </Link>
                  ) : null}
                  <Link to={`/in/${activeThread.participant.member_id}`} className="flex items-center gap-2 rounded-md hover:bg-black/5 px-1 py-1">
                    <Avatar
                      size="md"
                      name={activeThread.participant.full_name}
                      src={activeThread.participant.profile_photo_url ?? undefined}
                      online={activeParticipantPresenceOnline}
                    />
                    <div>
                      <p className="text-sm font-semibold text-text-primary">{activeThread.participant.full_name}</p>
                      <p className="text-xs text-text-secondary">
                        {activeThread.participant.headline} • {activeParticipantPresenceOnline ? 'Online' : 'Offline'}
                      </p>
                    </div>
                  </Link>
                </div>
                <div className="flex items-center gap-1">
                  <button type="button" className="rounded-full p-2 hover:bg-black/5" aria-label="Video">
                    <Video className="h-4 w-4" />
                  </button>
                  <button type="button" className="rounded-full p-2 hover:bg-black/5" aria-label="Voice">
                    <Phone className="h-4 w-4" />
                  </button>
                  <Dropdown.Root>
                    <Dropdown.Trigger className="rounded-full p-2 hover:bg-black/5" showEndChevron={false} aria-label="Conversation options">
                      <Ellipsis className="h-4 w-4" />
                    </Dropdown.Trigger>
                    <Dropdown.Content className="right-0">
                      <Dropdown.Item
                        onSelect={() => {
                          void starMutation.mutateAsync().catch(() => undefined)
                        }}
                      >
                        {activeThread.starred ? 'Unstar conversation' : 'Star conversation'}
                      </Dropdown.Item>
                      <Dropdown.Item
                        onSelect={() => setDeleteChatOpen(true)}
                        className="text-danger"
                      >
                        Delete conversation
                      </Dropdown.Item>
                    </Dropdown.Content>
                  </Dropdown.Root>
                </div>
              </Card.Header>

              <Card.Body className="flex h-[calc(100%-64px)] flex-col p-0">
                <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
                  {grouped.map((group) => (
                    <div key={group.label} className="mb-4">
                      <p className="mb-2 text-center text-xs text-text-tertiary">{group.label}</p>
                      <div className="space-y-2">
                        {group.items.map((message, index) => {
                          const mine = message.sender_id === user?.member_id
                          const showAvatar = !mine && (index === 0 || group.items[index - 1]?.sender_id !== message.sender_id)
                          const isEditing = editingMessageId === message.message_id
                          const sentStatusLabel =
                            mine && (message.status === 'delivered' || message.status === 'sent')
                              ? 'Delivered'
                              : mine && message.status === 'read'
                                ? 'Read'
                                : mine && message.status === 'sending'
                                  ? 'Sending…'
                                  : null

                          if (mine) {
                            return (
                              <div key={message.message_id} className="group flex justify-end">
                                <div className="flex max-w-[min(85%,520px)] items-center gap-2">
                                  {message.status !== 'sending' && !isEditing ? (
                                    <Dropdown.Root>
                                      <Dropdown.Trigger
                                        className="shrink-0 rounded-full p-1 text-text-tertiary opacity-0 transition hover:bg-black/5 group-hover:opacity-100"
                                        showEndChevron={false}
                                        aria-label="Message options"
                                      >
                                        <MoreHorizontal className="h-4 w-4" />
                                      </Dropdown.Trigger>
                                      <Dropdown.Content className="right-0">
                                        <Dropdown.Item
                                          onSelect={() => {
                                            setEditingMessageId(message.message_id)
                                            setEditDraft(message.text)
                                          }}
                                        >
                                          Edit message
                                        </Dropdown.Item>
                                        <Dropdown.Item onSelect={() => setDeletingMessageId(message.message_id)} className="text-danger">
                                          Delete message
                                        </Dropdown.Item>
                                      </Dropdown.Content>
                                    </Dropdown.Root>
                                  ) : null}
                                  {isEditing ? (
                                    <div className="flex min-w-[200px] max-w-[74%] flex-col gap-2 rounded-2xl border border-border bg-surface-raised p-3">
                                      <Textarea value={editDraft} onChange={(e) => setEditDraft(e.target.value)} autoResize className="min-h-16 text-sm" />
                                      <div className="flex justify-end gap-2">
                                        <Button size="sm" variant="secondary" onClick={() => setEditingMessageId(null)}>
                                          Cancel
                                        </Button>
                                        <Button
                                          size="sm"
                                          disabled={!editDraft.trim()}
                                          onClick={() => editMutation.mutate({ messageId: message.message_id, text: editDraft.trim() })}
                                        >
                                          Save
                                        </Button>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="flex min-w-0 flex-1 justify-end">
                                      <MessageBubble message={message} mine />
                                    </div>
                                  )}
                                  {sentStatusLabel ? (
                                    <span className="shrink-0 text-[10px] leading-none text-text-tertiary">{sentStatusLabel}</span>
                                  ) : null}
                                  {message.status === 'failed' ? (
                                    <button
                                      type="button"
                                      className="shrink-0 text-xs font-semibold text-danger"
                                      onClick={() =>
                                        sendMutation.mutate({
                                          text: message.text,
                                          retryMessage: message,
                                          image_url: message.image_url,
                                          attachment_url: message.attachment_url,
                                          attachment_filename: message.attachment_filename,
                                          clientIdempotencyKey: message.idempotency_key ?? crypto.randomUUID(),
                                        })
                                      }
                                    >
                                      Retry
                                    </button>
                                  ) : null}
                                </div>
                              </div>
                            )
                          }

                          return (
                            <div key={message.message_id} className="group flex justify-start items-end gap-2">
                              {showAvatar ? (
                                <Link to={`/in/${message.sender_id}`} className="shrink-0">
                                  <Avatar size="xs" name={message.sender_name} src={message.sender_profile_photo_url ?? undefined} />
                                </Link>
                              ) : (
                                <span className="h-6 w-6 shrink-0" aria-hidden />
                              )}
                              <div className="flex min-w-0 max-w-[78%] flex-col items-start gap-0.5">
                                <MessageBubble message={message} mine={false} />
                                <span className="invisible pl-1 text-[10px] text-text-tertiary group-hover:visible">
                                  {new Date(message.sent_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ))}

                  {typingByThread[activeThread.thread_id] ? (
                    <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-black/5 px-3 py-1 text-xs text-text-secondary">
                      <span className="inline-flex gap-1">
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-text-secondary" />
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-text-secondary [animation-delay:120ms]" />
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-text-secondary [animation-delay:240ms]" />
                      </span>
                      {activeThread.participant.full_name} is typing...
                    </div>
                  ) : null}
                  <div ref={messagesEndRef} />
                </div>

                <div className="border-t border-border p-3">
                  <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={onImageFileChange} />
                  <input ref={fileInputRef} type="file" className="hidden" onChange={onAttachFileChange} />
                  {pendingImageUrl || pendingAttachment ? (
                    <div className="mb-2 flex items-center gap-2 rounded-md border border-border bg-surface-raised p-2">
                      {pendingImageUrl ? (
                        <img src={pendingImageUrl} alt="" className="h-14 w-14 shrink-0 rounded object-cover" />
                      ) : null}
                      {pendingAttachment ? (
                        <span className="min-w-0 flex-1 truncate text-xs text-text-secondary" title={pendingAttachment.filename}>
                          📎 {pendingAttachment.filename}
                        </span>
                      ) : null}
                      <Button
                        type="button"
                        size="sm"
                        variant="tertiary"
                        className="shrink-0"
                        onClick={() => {
                          setPendingImageUrl(null)
                          setPendingAttachment(null)
                        }}
                      >
                        Remove
                      </Button>
                    </div>
                  ) : null}
                  <div ref={emojiWrapRef} className="relative mb-2 flex items-center gap-1 text-text-secondary">
                    <button
                      type="button"
                      className="rounded-full p-1.5 hover:bg-black/5"
                      aria-label="Add image"
                      onClick={() => imageInputRef.current?.click()}
                    >
                      <ImageIcon className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      className="rounded-full p-1.5 hover:bg-black/5"
                      aria-label="Attach file"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Paperclip className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      className="rounded-full p-1.5 hover:bg-black/5"
                      aria-label="Insert emoji"
                      onClick={() => setEmojiPickerOpen((open) => !open)}
                    >
                      <Smile className="h-4 w-4" />
                    </button>
                    {emojiPickerOpen ? (
                      <div className="absolute bottom-full left-0 z-20 mb-1 w-[min(100%,260px)] rounded-md border border-border bg-surface-raised p-2 shadow-md">
                        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-text-tertiary">Emoji</p>
                        <div className="grid max-h-40 grid-cols-8 gap-0.5 overflow-y-auto">
                          {COMPOSER_EMOJIS.map((em) => (
                            <button
                              key={em}
                              type="button"
                              className="rounded p-1 text-lg leading-none hover:bg-black/5"
                              onClick={() => insertEmoji(em)}
                            >
                              {em}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                  <div className="flex items-end gap-2">
                    <Textarea
                      value={composerText}
                      onChange={(event) => setComposerText(event.target.value)}
                      placeholder="Write a message..."
                      autoResize
                      className="min-h-10 max-h-28"
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' && !event.shiftKey) {
                          event.preventDefault()
                          if (canSendMessage) {
                            submitComposer()
                          }
                        }
                      }}
                    />
                    <Button disabled={!canSendMessage || sendMutation.isPending} onClick={submitComposer}>
                      Send
                    </Button>
                  </div>
                </div>
              </Card.Body>
            </>
          ) : (
            <Card.Body className="flex h-full items-center justify-center text-text-secondary">Select a conversation</Card.Body>
          )}
        </Card>
      </div>

      {composeOpen && user ? (
        <ComposeMessageModal
          isOpen={composeOpen}
          onClose={() => setComposeOpen(false)}
          senderId={user.member_id}
          onThreadCreated={async (newThreadId) => {
            await queryClient.refetchQueries({ queryKey: ['threads', user.member_id] })
            await queryClient.refetchQueries({ queryKey: ['messages', newThreadId] })
            void queryClient.invalidateQueries({ queryKey: ['threads'] })
            broadcastMessagingThreadUpdate(newThreadId)
            navigate(`/messaging/${newThreadId}`)
          }}
        />
      ) : null}

      <ConfirmModal
        isOpen={Boolean(deletingMessageId)}
        onClose={() => setDeletingMessageId(null)}
        title="Delete message?"
        message="This message will be removed from the conversation for you."
        confirmLabel="Delete"
        confirmVariant="destructive"
        loading={deleteMessageMutation.isPending}
        onConfirm={async () => {
          if (deletingMessageId) {
            await deleteMessageMutation.mutateAsync(deletingMessageId)
          }
        }}
      />

      <ConfirmModal
        isOpen={deleteChatOpen}
        onClose={() => setDeleteChatOpen(false)}
        title="Delete conversation?"
        message="This chat will be removed from your inbox. You can start a new thread with this connection anytime from Compose."
        confirmLabel="Delete"
        confirmVariant="destructive"
        loading={deleteChatMutation.isPending}
        onConfirm={async () => {
          await deleteChatMutation.mutateAsync()
        }}
      />
    </div>
  )
}
