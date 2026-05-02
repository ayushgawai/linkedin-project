export type Member = {
  member_id: string
  /** Present for recruiter accounts (login/signup). */
  recruiter_id?: string
  company_id?: string
  email: string
  full_name: string
  /** Present after login/signup when account type is known (mock + integrated auth). */
  role?: 'member' | 'recruiter'
  headline: string | null
  bio: string | null
  /** Backend uses `about`; keep alias for update payloads. */
  about?: string | null
  location: string | null
  skills: string[]
  profile_photo_url: string | null
  cover_photo_url: string | null
  /** Optional; drives Premium cover badge and left-rail link when set. */
  is_premium?: boolean
  connections_count?: number
  followers_count?: number
  profile_views?: number
  post_impressions?: number
  search_appearances?: number
  is_open_to_work?: boolean
  open_to_work_details?: string
  phone?: string | null
  public_profile_url?: string | null
  experiences?: Array<{
    id: string
    title: string
    company: string
    company_logo?: string | null
    employment_type: string
    start_date: string
    end_date?: string | null
    location: string
    workplace: string
    description: string
    skills: string[]
  }>
  educations?: Array<{
    id: string
    school: string
    school_logo?: string | null
    degree: string
    field: string
    grade?: string | null
    start_date: string
    end_date?: string | null
    skills: string[]
  }>
  licenses?: Array<{
    id: string
    name: string
    org: string
    issue_date: string
    credential_url?: string | null
    preview_image?: string | null
  }>
  projects?: Array<{
    id: string
    name: string
    associated_with?: string | null
    start_date: string
    end_date?: string | null
    description: string
    skills: string[]
    media: Array<{ id: string; image: string; title: string; url: string }>
    project_url?: string | null
  }>
  courses?: string[]
  featured?: Array<{
    id: string
    type: string
    org_logo?: string | null
    title: string
    subtitle: string
    premium?: boolean
  }>
  activity_posts?: Array<{
    id: string
    text: string
    image?: string | null
    reactions: number
    comments: number
  }>
  interests?: {
    topVoices: Array<{ id: string; name: string; headline: string; avatar?: string | null }>
    companies: Array<{ id: string; name: string; industry: string; followers: number; logo?: string | null }>
    groups: Array<{ id: string; name: string; members: number; logo?: string | null }>
    newsletters: Array<{ id: string; title: string; subscribers: number; logo?: string | null }>
    schools: Array<{ id: string; name: string; alumni: number; logo?: string | null }>
  }
  created_at: string
  updated_at: string
}

export type Recruiter = {
  recruiter_id: string
  member_id: string
  company_name: string
  company_website: string | null
  company_size: string | null
  industry: string | null
  verified: boolean
  created_at: string
  updated_at: string
}

export type Job = {
  job_id: string
  recruiter_id: string
  title: string
  description: string
  location: string
  employment_type: 'full_time' | 'part_time' | 'contract' | 'internship' | 'temporary'
  work_mode: 'remote' | 'hybrid' | 'onsite'
  salary_min: number | null
  salary_max: number | null
  currency: string | null
  is_active: boolean
  posted_at: string
  updated_at: string
}

export type Application = {
  application_id: string
  job_id: string
  member_id: string
  resume_url: string | null
  /** Stored resume content (often base64 data URL in local dev). */
  resume_text?: string | null
  cover_letter: string | null
  status:
    | 'submitted'
    | 'under_review'
    | 'reviewing'
    | 'shortlisted'
    | 'interview'
    | 'accepted'
    | 'offer'
    | 'rejected'
  applied_at: string
  updated_at: string
}

export type Message = {
  message_id: string
  thread_id: string
  sender_member_id: string
  body: string
  sent_at: string
  read_at: string | null
}

export type Thread = {
  thread_id: string
  participant_member_ids: string[]
  last_message_id: string | null
  created_at: string
  updated_at: string
}

export type Connection = {
  connection_id: string
  requester_member_id: string
  addressee_member_id: string
  status: 'pending' | 'accepted' | 'declined' | 'blocked'
  created_at: string
  updated_at: string
}

export type AnalyticsEvent = {
  event_id: string
  member_id: string | null
  event_type: string
  event_source: string
  entity_id: string | null
  metadata: Record<string, unknown>
  occurred_at: string
}

export type AIRequest = {
  request_id: string
  member_id: string
  prompt: string
  context: Record<string, unknown>
  status: 'queued' | 'running' | 'completed' | 'failed'
  created_at: string
  updated_at: string
}

export type AIResult = {
  result_id: string
  request_id: string
  member_id: string
  output_text: string
  output_payload: Record<string, unknown> | null
  confidence_score: number | null
  generated_at: string
}

export type ApiError = {
  status: number
  message: string
  details?: unknown
}
