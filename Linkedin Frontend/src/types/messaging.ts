export type ThreadListItem = {
  thread_id: string
  participant: {
    member_id: string
    full_name: string
    headline: string
    profile_photo_url: string | null
    online: boolean
  }
  last_message_preview: string
  last_message_time: string
  unread_count: number
  /** Mock/local: user starred this thread (Focused inbox) */
  starred?: boolean
}

export type MessageRecord = {
  message_id: string
  thread_id: string
  sender_id: string
  sender_name: string
  text: string
  sent_at: string
  status: 'sending' | 'sent' | 'delivered' | 'read' | 'failed'
  idempotency_key?: string
  edited_at?: string
  /** Inline image (e.g. data URL from composer) */
  image_url?: string | null
  /** Generic file attachment (e.g. data URL) */
  attachment_url?: string | null
  attachment_filename?: string | null
}

export type MessagesListResponse = {
  messages: MessageRecord[]
  has_more: boolean
}
