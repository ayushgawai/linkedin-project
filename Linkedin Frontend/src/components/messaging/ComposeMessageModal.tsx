import { useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { openThread, sendMessage } from '../../api/messaging'
import { listConnections } from '../../api/connections'
import { getMember, searchMembers } from '../../api/profile'
import { useActionToast } from '../../hooks/useActionToast'
import { Button, Input, Modal, Textarea, useToast } from '../ui'
import type { Member } from '../../types'

type ComposeMessageModalProps = {
  isOpen: boolean
  onClose: () => void
  senderId: string
  onThreadCreated: (threadId: string) => void | Promise<void>
}

export function ComposeMessageModal({ isOpen, onClose, senderId, onThreadCreated }: ComposeMessageModalProps): JSX.Element {
  const { toast } = useToast()
  const actionToast = useActionToast()
  const [query, setQuery] = useState('')
  const [recipientId, setRecipientId] = useState('')
  const [recipientName, setRecipientName] = useState('')
  const [text, setText] = useState('')

  const connectionsQuery = useQuery({
    queryKey: ['connections', senderId, 'compose'],
    queryFn: async () => {
      const conns = await listConnections(senderId)
      const others = conns
        .filter((c) => c.status === 'accepted')
        .map((c) => (c.addressee_member_id === senderId ? c.requester_member_id : c.addressee_member_id))
      const members = await Promise.all(
        others.map(async (memberId) => {
          try {
            return await getMember(memberId)
          } catch {
            return null
          }
        }),
      )
      return members.filter((m): m is Member => Boolean(m))
    },
    enabled: isOpen && Boolean(senderId),
  })

  const filteredRecipients = useMemo(() => {
    const list = connectionsQuery.data ?? []
    const q = query.trim().toLowerCase()
    if (!q) return list
    return list.filter(
      (m) =>
        m.full_name.toLowerCase().includes(q) ||
        (m.headline ?? '').toLowerCase().includes(q) ||
        (m.location ?? '').toLowerCase().includes(q),
    )
  }, [connectionsQuery.data, query])

  const globalSearchQuery = useQuery({
    queryKey: ['members-search', senderId, 'compose', query],
    queryFn: async () => {
      const q = query.trim()
      if (!q) return []
      const members = await searchMembers({ query: q })
      return members.filter((m) => m.member_id && m.member_id !== senderId)
    },
    enabled: isOpen && Boolean(senderId) && query.trim().length > 0,
  })

  const displayedRecipients = useMemo(() => {
    if (filteredRecipients.length > 0) return filteredRecipients
    // If you have no accepted connections (common in demos), allow messaging any member.
    return globalSearchQuery.data ?? []
  }, [filteredRecipients, globalSearchQuery.data])

  const sendMutation = useMutation({
    mutationFn: async () => {
      const thread = await openThread([senderId, recipientId])
      await sendMessage(thread.thread_id, senderId, text, crypto.randomUUID())
      return thread.thread_id
    },
    onSuccess: async (newThreadId) => {
      actionToast.messageSent(recipientName || 'Recipient')
      await onThreadCreated(newThreadId)
      onClose()
      setText('')
      setQuery('')
      setRecipientId('')
      setRecipientName('')
    },
    onError: (error: { message?: string }) => {
      toast({ variant: 'error', title: error.message ?? 'Could not send message' })
    },
  })

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="New message" size="md">
      <Modal.Header>New message</Modal.Header>
      <Modal.Body className="space-y-3">
        <Input label="Search people" value={query} onChange={(event) => setQuery(event.target.value)} />
        <p className="text-xs text-text-tertiary">
          Start a conversation by searching members. Connections will appear first.
        </p>
        <div className="max-h-40 overflow-y-auto rounded-md border border-border">
          {connectionsQuery.isLoading || globalSearchQuery.isLoading ? (
            <p className="px-3 py-2 text-sm text-text-secondary">Loading connections…</p>
          ) : displayedRecipients.length === 0 ? (
            <p className="px-3 py-2 text-sm text-text-secondary">No members match this search.</p>
          ) : (
            displayedRecipients.map((member) => (
              <button
                key={member.member_id}
                type="button"
                onClick={() => {
                  setRecipientId(member.member_id)
                  setRecipientName(member.full_name)
                }}
                className={`block w-full px-3 py-2 text-left text-sm ${recipientId === member.member_id ? 'bg-brand-primary/10 text-brand-primary' : 'hover:bg-black/5'}`}
              >
                {member.full_name}
                {member.headline ? <span className="block text-xs text-text-secondary">{member.headline}</span> : null}
              </button>
            ))
          )}
        </div>
        <Textarea label="Message" value={text} onChange={(event) => setText(event.target.value)} autoResize />
      </Modal.Body>
      <Modal.Footer>
        <Button loading={sendMutation.isPending} disabled={!recipientId || !text.trim()} onClick={() => sendMutation.mutate()}>
          Send
        </Button>
      </Modal.Footer>
    </Modal>
  )
}
