// BACKEND CONTRACT: matches project spec section 6
// All endpoints POST with JSON body. Base URL from VITE_API_BASE_URL.
// Analytics events fire on: job.viewed, job.saved, application.submitted

import { USE_MOCKS, apiClient, mockDelay, unwrapApiData } from './client'
import { MOCK_JOBS } from '../lib/jobsMockData'
import { timeAgoShort } from '../lib/formatters'
import type { CreateJobPayload, JobRecord, JobSearchFilters, JobSearchResponse, UpdateJobPayload } from '../types/jobs'

let mockJobs: JobRecord[] = [...MOCK_JOBS]

function looksLikeIsoDateString(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}/.test(s) || (s.includes('T') && (s.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(s)))
}

/** Backend sends ISO datetimes; UI shows relative time (same idea as JobTrackerRow). */
function derivePostedTimeLabel(raw: any): string {
  const candidates = [raw?.posted_time_ago, raw?.posted_at, raw?.posted_datetime, raw?.created_at]
  for (const c of candidates) {
    if (typeof c !== 'string' || !c.trim()) continue
    const t = c.trim()
    if (t === 'Just now' || t === 'Recently') return t
    if (t === 'now') return 'Just now'
    if (/\bago\b/i.test(t)) return t
    if (looksLikeIsoDateString(t)) return timeAgoShort(t)
    if (/^\d+[smhd]$/i.test(t)) return `${t} ago`
    return t
  }
  return 'Recently'
}

function normalizeJobRecord(raw: any): JobRecord {
  const companyName = typeof raw?.company_name === 'string' && raw.company_name.trim() ? raw.company_name : 'Company'
  const workMode =
    raw?.work_mode === 'remote' || raw?.work_mode === 'hybrid' || raw?.work_mode === 'onsite'
      ? raw.work_mode
      : raw?.remote_type === 'remote' || raw?.remote_type === 'hybrid' || raw?.remote_type === 'onsite'
        ? raw.remote_type
        : 'onsite'
  return {
    ...raw,
    company_name: companyName,
    title: typeof raw?.title === 'string' && raw.title.trim() ? raw.title : 'Job',
    location: typeof raw?.location === 'string' && raw.location.trim() ? raw.location : '',
    description: typeof raw?.description === 'string' ? raw.description : '',
    posted_time_ago: derivePostedTimeLabel(raw),
    company_logo_url: raw?.company_logo_url ?? null,
    applicants_count: Number(raw?.applicants_count ?? 0),
    views_count: Number(raw?.views_count ?? 0),
    easy_apply: Boolean(raw?.easy_apply ?? true),
    promoted: Boolean(raw?.promoted ?? false),
    skills_required: Array.isArray(raw?.skills_required) ? raw.skills_required : [],
    connections_count: Number(raw?.connections_count ?? 0),
    followers_count: Number(raw?.followers_count ?? 0),
    work_mode: workMode,
    employment_type:
      raw?.employment_type === 'full_time' ||
      raw?.employment_type === 'part_time' ||
      raw?.employment_type === 'contract' ||
      raw?.employment_type === 'internship' ||
      raw?.employment_type === 'temporary'
        ? raw.employment_type
        : 'full_time',
    industry: typeof raw?.industry === 'string' ? raw.industry : 'Software',
    company_size: typeof raw?.company_size === 'string' ? raw.company_size : '51-200 employees',
    company_about: typeof raw?.company_about === 'string' ? raw.company_about : '',
    salary_range: (typeof raw?.salary_range === 'string' ? raw.salary_range.trim() : '') || null,
  } as JobRecord
}

function getMockJobs(): JobRecord[] {
  return mockJobs
}

function filterMockJobsBySearch(jobs: JobRecord[], filters: JobSearchFilters): JobRecord[] {
  const kw = (filters.keyword ?? '').trim().toLowerCase()
  const loc = (filters.location ?? '').trim().toLowerCase()
  const remoteOnly = filters.remote === true
  if (!kw && !loc && !remoteOnly) return jobs
  return jobs.filter((job) => {
    const hay = `${job.title} ${job.company_name} ${job.description} ${job.skills_required.join(' ')}`.toLowerCase()
    const matchKw = !kw || hay.includes(kw)
    const matchLoc = !loc || job.location.toLowerCase().includes(loc)
    const matchRemote = !remoteOnly || job.work_mode === 'remote'
    return matchKw && matchLoc && matchRemote
  })
}

export async function listJobs(filters: JobSearchFilters): Promise<JobSearchResponse> {
  if (USE_MOCKS) {
    await mockDelay()
    const page = filters.page ?? 1
    const pageSize = filters.pageSize ?? 20
    const filtered = filterMockJobsBySearch(getMockJobs(), filters)
    const start = (page - 1) * pageSize
    return {
      jobs: filtered.slice(start, start + pageSize),
      page,
      has_more: start + pageSize < filtered.length,
      total: filtered.length,
    }
  }
  const response = await apiClient.post<JobSearchResponse | Record<string, unknown>>('/jobs/search', {
    keyword: filters.keyword ?? '',
    location: filters.location ?? '',
    type: filters.type ?? '',
    industry: filters.industry ?? '',
    remote: filters.remote ?? false,
    page: filters.page ?? 1,
    pageSize: filters.pageSize ?? 20,
  })
  const data: any = unwrapApiData(response.data) as any
  // Backend returns { results, total, page, page_size }, mock expects { jobs, has_more }.
  if (data && Array.isArray(data.results)) {
    const page = Number(data.page || filters.page || 1)
    const pageSize = Number(data.page_size || filters.pageSize || 20)
    const total = Number(data.total || 0)
    return {
      jobs: (data.results as any[]).map(normalizeJobRecord),
      page,
      has_more: page * pageSize < total,
      total,
    }
  }
  return data
}

export async function getJob(job_id: string): Promise<JobRecord> {
  if (USE_MOCKS) {
    await mockDelay()
    const jobs = getMockJobs()
    return jobs.find((job) => job.job_id === job_id) ?? jobs[0]
  }
  const response = await apiClient.post<unknown>('/jobs/get', { job_id })
  return normalizeJobRecord(unwrapApiData(response.data) as any)
}

export async function closeJob(job_id: string): Promise<{ success: boolean }> {
  if (USE_MOCKS) {
    await mockDelay(180)
    mockJobs = getMockJobs().filter((job) => job.job_id !== job_id)
    return { success: true }
  }
  const response = await apiClient.post<{ success: boolean }>('/jobs/close', { job_id })
  return response.data
}

function normalizeSkillsFromPayload(payload: CreateJobPayload): string[] {
  const raw = (payload as Partial<JobRecord>).skills_required ?? (payload as { skills?: string[] }).skills
  if (Array.isArray(raw) && raw.length > 0) return raw.filter(Boolean)
  return ['React', 'TypeScript', 'Communication']
}

export async function createJob(payload: CreateJobPayload): Promise<JobRecord> {
  if (USE_MOCKS) {
    await mockDelay(260)
    const id = `job-${Date.now()}`
    const skills_required = normalizeSkillsFromPayload(payload)
    const newJob: JobRecord = {
      job_id: id,
      recruiter_id: payload.recruiter_id,
      title: payload.title.trim(),
      company_name: (payload.company_name ?? 'Apex Labs').trim(),
      company_logo_url: payload.company_logo_url ?? null,
      description: (payload.description ?? '').trim() || 'We are hiring for this role. More details will be shared with shortlisted candidates.',
      location: payload.location.trim(),
      work_mode: (payload.work_mode as JobRecord['work_mode']) ?? 'onsite',
      employment_type: (payload.employment_type as JobRecord['employment_type']) ?? 'full_time',
      industry: (payload.industry ?? 'Software').trim(),
      easy_apply: payload.easy_apply !== false,
      promoted: payload.promoted !== false,
      posted_time_ago: 'Just now',
      applicants_count: 0,
      views_count: 0,
      skills_required,
      connections_count: 0,
      followers_count: payload.followers_count ?? 3000,
      company_size: payload.company_size ?? '51-200 employees',
      company_about:
        (payload.company_about ?? '').trim() ||
        'Modern product company building reliable software for global teams.',
      salary_range: (payload as Partial<JobRecord>).salary_range?.trim() || null,
    }
    mockJobs = [newJob, ...getMockJobs()]
    return newJob
  }
  // Gateway/job-service supports RESTful create at POST /jobs
  const response = await apiClient.post<unknown>('/jobs', payload)
  return normalizeJobRecord(unwrapApiData(response.data) as any)
}

export async function updateJob(payload: UpdateJobPayload): Promise<JobRecord> {
  if (USE_MOCKS) {
    await mockDelay(240)
    const jobs = getMockJobs()
    const existing = jobs.find((job) => job.job_id === payload.job_id) ?? jobs[0]
    const updated = {
      ...existing,
      ...payload,
      updated_at: new Date().toISOString(),
    }
    mockJobs = jobs.map((job) => (job.job_id === payload.job_id ? updated : job))
    return updated
  }
  const response = await apiClient.post<unknown>('/jobs/update', payload)
  return normalizeJobRecord(unwrapApiData(response.data) as any)
}

export type ListJobsByRecruiterOptions = {
  page?: number
  page_size?: number
}

export async function listJobsByRecruiter(recruiter_id: string, opts?: ListJobsByRecruiterOptions): Promise<JobRecord[]> {
  if (USE_MOCKS) {
    await mockDelay(220)
    return getMockJobs().filter((job) => job.recruiter_id === recruiter_id)
  }
  const response = await apiClient.post<unknown>('/jobs/byRecruiter', {
    recruiter_id,
    page: opts?.page ?? 1,
    page_size: opts?.page_size ?? 100,
  })
  const data: any = unwrapApiData(response.data) as any
  if (Array.isArray(data)) return (data as any[]).map(normalizeJobRecord)
  if (data && Array.isArray(data.results)) return (data.results as any[]).map(normalizeJobRecord)
  if (data && Array.isArray(data.jobs)) return (data.jobs as any[]).map(normalizeJobRecord)
  return []
}

export async function incrementJobViews(job_id: string, viewer_id?: string | null): Promise<void> {
  if (USE_MOCKS) {
    await mockDelay(80)
    mockJobs = getMockJobs().map((job) => (job.job_id === job_id ? { ...job, views_count: job.views_count + 1 } : job))
    return
  }
  await apiClient.post('/jobs/incrementViews', {
    job_id,
    ...(viewer_id != null && viewer_id !== '' ? { viewer_id } : {}),
  })
}

/** Emits `job.saved` via Job Service → Kafka (analytics consumer persists to Mongo). */
export async function recordJobSave(job_id: string, member_id: string): Promise<void> {
  if (USE_MOCKS) {
    await mockDelay(80)
    return
  }
  await apiClient.post('/jobs/recordSave', { job_id, member_id })
}

export async function incrementJobApplicants(job_id: string): Promise<void> {
  if (USE_MOCKS) {
    await mockDelay(80)
    mockJobs = getMockJobs().map((job) =>
      job.job_id === job_id ? { ...job, applicants_count: job.applicants_count + 1 } : job,
    )
    return
  }
  await apiClient.post('/jobs/incrementApplicants', { job_id })
}

export async function incrementCompanyProfileViews(company_name: string): Promise<void> {
  if (USE_MOCKS) {
    await mockDelay(80)
    mockJobs = getMockJobs().map((job) =>
      job.company_name.toLowerCase() === company_name.toLowerCase()
        ? { ...job, views_count: job.views_count + 1 }
        : job,
    )
    return
  }
  await apiClient.post('/companies/incrementViews', { company_name })
}
