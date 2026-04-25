import type { MessageRecord, ThreadListItem } from '../types/messaging'

export const MOCK_THREADS: ThreadListItem[] = Array.from({ length: 14 }).map((_, index) => ({
  thread_id: `thread-${index + 1}`,
  participant: {
    member_id: `member-${index + 2}`,
    full_name: ['Alex Morgan', 'Priya Shah', 'Daniel Kim', 'Nora Diaz', 'Liam Chen'][index % 5] ?? 'Alex Morgan',
    headline: ['Frontend Engineer', 'Recruiter', 'Product Designer', 'Data Scientist', 'Founder'][index % 5] ?? 'Frontend Engineer',
    profile_photo_url: null,
    online: index % 3 === 0,
  },
  last_message_preview: 'Sounds good — let us sync tomorrow and review updates.',
  last_message_time: ['2m', '10m', '1h', '3h', '1d'][index % 5] ?? '1h',
  unread_count: index % 4 === 0 ? 2 : 0,
}))

export const MOCK_MESSAGES_BY_THREAD: Record<string, MessageRecord[]> = Object.fromEntries(
  MOCK_THREADS.map((thread) => [
    thread.thread_id,
    Array.from({ length: 24 }).map((_, messageIndex) => ({
      message_id: `${thread.thread_id}-m-${messageIndex + 1}`,
      thread_id: thread.thread_id,
      sender_id: messageIndex % 2 === 0 ? 'demo-member' : thread.participant.member_id,
      sender_name: messageIndex % 2 === 0 ? 'You' : thread.participant.full_name,
      text:
        messageIndex % 2 === 0
          ? 'Perfect, I will send the latest update with details.'
          : 'Thanks! I reviewed your note and this direction makes sense.',
      sent_at: new Date(Date.now() - (24 - messageIndex) * 3600_000).toISOString(),
      status: messageIndex === 23 ? 'read' : 'delivered',
    })),
  ]),
)
