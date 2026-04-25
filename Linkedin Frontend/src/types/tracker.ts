/** Backend / API status for a member's application (job tracker). */
export type MemberApplicationBackendStatus =
  | 'submitted'
  | 'under_review'
  | 'interview'
  | 'offer'
  | 'rejected'

export type MemberApplicationTab = 'applied' | 'interview' | 'offer' | 'rejected'

/** When status is rejected, which stage the rejection followed. */
export type RejectedFromStage = 'submitted' | 'interview'

export type MemberApplicationJob = {
  title: string
  company_name: string
  company_logo_url: string | null
  location: string
  work_mode: 'remote' | 'hybrid' | 'onsite'
  posted_at: string
  reposted_at: string | null
  listing_status: 'open' | 'closed'
}

export type MemberApplication = {
  application_id: string
  job_id: string
  member_id: string
  status: MemberApplicationBackendStatus
  applied_at: string
  updated_at: string
  rejected_from?: RejectedFromStage
  job: MemberApplicationJob
  connection_avatar_urls: string[]
}

export type TrackerStatusUpdate = 'interview' | 'offer' | 'rejected'
