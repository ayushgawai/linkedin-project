// BACKEND CONTRACT: matches project spec section 6
// All endpoints POST with JSON body. Base URL from VITE_API_BASE_URL.
// Analytics events fire on: job.viewed, job.saved, application.submitted

import { USE_MOCKS, apiClient, mockDelay } from './client'
import { MOCK_JOBS } from '../lib/jobsMockData'
import type { CreateJobPayload, JobRecord, JobSearchFilters, JobSearchResponse, UpdateJobPayload } from '../types/jobs'

let mockJobs: JobRecord[] = [...MOCK_JOBS]

function getMockJobs(): JobRecord[] {
  return mockJobs
}

function filterMockJobsBySearch(jobs: JobRecord[], filters: JobSearchFilters): JobRecord[] {
  const kw = (filters.keyword ?? '').trim().toLowerCase()
  const loc = (filters.location ?? '').trim().toLowerCase()
  if (!kw && !loc) return jobs
  return jobs.filter((job) => {
    const hay = `${job.title} ${job.company_name} ${job.description} ${job.skills_required.join(' ')}`.toLowerCase()
    const matchKw = !kw || hay.includes(kw)
    const matchLoc = !loc || job.location.toLowerCase().includes(loc)
    return matchKw && matchLoc
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
  const response = await apiClient.post<JobSearchResponse>('/jobs/search', {
    keyword: filters.keyword ?? '',
    location: filters.location ?? '',
    type: filters.type ?? '',
    industry: filters.industry ?? '',
    remote: filters.remote ?? false,
    page: filters.page ?? 1,
    pageSize: filters.pageSize ?? 20,
  })
  return response.data
}

export async function getJob(job_id: string): Promise<JobRecord> {
  if (USE_MOCKS) {
    await mockDelay()
    const jobs = getMockJobs()
    return jobs.find((job) => job.job_id === job_id) ?? jobs[0]
  }
  const response = await apiClient.post<JobRecord>('/jobs/get', { job_id })
  return response.data
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
    }
    mockJobs = [newJob, ...getMockJobs()]
    return newJob
  }
  const response = await apiClient.post<JobRecord>('/jobs/create', payload)
  return response.data
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
  const response = await apiClient.post<JobRecord>('/jobs/update', payload)
  return response.data
}

export async function listJobsByRecruiter(recruiter_id: string): Promise<JobRecord[]> {
  if (USE_MOCKS) {
    await mockDelay(220)
    return getMockJobs().filter((job) => job.recruiter_id === recruiter_id)
  }
  const response = await apiClient.post<JobRecord[]>('/jobs/byRecruiter', { recruiter_id })
  return response.data
}

export async function incrementJobViews(job_id: string): Promise<void> {
  if (USE_MOCKS) {
    await mockDelay(80)
    mockJobs = getMockJobs().map((job) => (job.job_id === job_id ? { ...job, views_count: job.views_count + 1 } : job))
    return
  }
  await apiClient.post('/jobs/incrementViews', { job_id })
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
