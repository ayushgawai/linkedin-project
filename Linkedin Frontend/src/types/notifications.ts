export type NotificationType =
  | 'connection_request'
  | 'post_reaction'
  | 'post_comment'
  | 'job_recommendation'
  | 'application_status'
  | 'ai_completed'
  | 'message'
  | 'milestone'

export type NotificationFilter = 'all' | 'jobs' | 'my_posts' | 'mentions'

export type NotificationRecord = {
  notification_id: string
  type: NotificationType
  actor_name?: string
  actor_avatar_url?: string | null
  title: string
  preview: string
  timestamp: string
  unread: boolean
  target_url: string
  /** Pending connection invite from `/connections/pending` — drives Accept / Ignore on Notifications. */
  connection_request_id?: string
  /** Requester profile URL target when opening a connection-request row. */
  connection_requester_member_id?: string
  /** When set, this notification is only shown to this member (mock routing). */
  recipient_member_id?: string
  /** Mock: show Accept / Decline for interview invites from employers. */
  interview_invite?: boolean
}

export type NotificationsResponse = {
  notifications: NotificationRecord[]
  page: number
  has_more: boolean
}
