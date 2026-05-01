export type JobRecord = {
  job_id: string
  recruiter_id: string
  title: string
  company_name: string
  company_logo_url: string | null
  description: string
  location: string
  work_mode: 'remote' | 'hybrid' | 'onsite'
  employment_type: 'full_time' | 'part_time' | 'contract' | 'internship' | 'temporary'
  industry: string
  easy_apply: boolean
  promoted: boolean
  posted_time_ago: string
  applicants_count: number
  views_count: number
  skills_required: string[]
  connections_count: number
  followers_count: number
  company_size: string
  company_about: string
  /** Third-party job listing — not in our MySQL. UI opens external_url in a new tab. */
  is_external?: boolean
  external_url?: string
  source?: string
}

export type JobSearchFilters = {
  keyword?: string
  location?: string
  type?: string
  industry?: string
  remote?: boolean
  page?: number
  pageSize?: number
}

export type JobSearchResponse = {
  jobs: JobRecord[]
  page: number
  has_more: boolean
  total: number
}

export type CreateJobPayload = Partial<JobRecord> & {
  recruiter_id: string
  title: string
  description: string
  location: string
}

export type UpdateJobPayload = Partial<JobRecord> & {
  job_id: string
}

export type SubmitApplicationPayload = {
  job_id: string
  member_id: string
  /** Optional public URL (rare in local dev). */
  resume_url?: string | null
  /**
   * Resume content for local/dev: may be a data URL (base64) such as
   * `data:application/pdf;base64,...` stored in application service `resume_text`.
   */
  resume_text?: string | null
  answers?: Record<string, string>
  contact_email: string
  contact_phone: string
}
