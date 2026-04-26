// ============================================
// INTEGRATION CONTRACT — Applications Service
// ============================================
// Current mode: MOCK (returns local data when VITE_USE_MOCKS=true)
// To integrate: replace non-mock branches with real axios calls if endpoints differ.
//
// Endpoints:
//   POST /applications/byMember        → listMemberApplications(member_id)
//   POST /applications/submit          → submitApplication(payload)
//   POST /applications/byJob           → listApplicationsByJob(job_id)
//   POST /applications/updateStatus    → updateApplicationStatus(...)
//   POST /applications/addNote         → addApplicationNote(...)
//
// Auth: Bearer token via src/api/client.ts interceptor
// ============================================

import { apiClient, mockDelay, USE_MOCKS } from './client'
import { MOCK_JOBS } from '../lib/jobsMockData'
import { generateMockMemberApplications } from '../lib/memberApplicationsMock'
import type { Application } from '../types'
import type { JobRecord } from '../types/jobs'
import type { SubmitApplicationPayload } from '../types/jobs'
import type { MemberApplication, RejectedFromStage, TrackerStatusUpdate } from '../types/tracker'
import { getMember } from './profile'

const mockListByMember = new Map<string, MemberApplication[]>()

/** Recruiter “applicants” list (mock): Easy Apply rows keyed by job_id, merged with seeded rows for catalog MOCK_JOBS only. */
export type JobApplicantRow = Application & {
  member_name: string
  headline: string
  match_score: number
  resume_url?: string
  cover_letter?: string | null
  notes?: string
  contact_email?: string
  contact_phone?: string
}

const mockApplicantsByJobId = new Map<string, JobApplicantRow[]>()

const MOCK_RESUME_PDF = 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf'

function generateLegacyApplicants(job_id: string): JobApplicantRow[] {
  if (!MOCK_JOBS.some((j) => j.job_id === job_id)) return []
  return Array.from({ length: 15 }).map((_, index) => ({
    application_id: `${job_id}-seed-${index + 1}`,
    job_id,
    member_id: `member-seed-${index + 1}`,
    resume_url: MOCK_RESUME_PDF,
    cover_letter: 'I am excited to contribute to your team with strong full-stack and systems experience.',
    status: (['submitted', 'under_review', 'shortlisted', 'accepted', 'rejected'] as const)[index % 5],
    applied_at: new Date(Date.now() - (index + 3) * 86400000).toISOString(),
    updated_at: new Date(Date.now() - (index + 2) * 43200000).toISOString(),
    member_name: ['Nora White', 'Sam Lee', 'Ava Kim', 'Miguel Chen', 'Priya Sharma'][index % 5] ?? 'Nora White',
    headline: 'Software Engineer | Distributed Systems',
    match_score: 52 + (index % 48),
    notes: '',
  }))
}

async function appendMockApplicantFromEasyApply(payload: SubmitApplicationPayload, application: Application): Promise<void> {
  const member = await getMember(payload.member_id)
  const list = mockApplicantsByJobId.get(payload.job_id) ?? []
  if (list.some((r) => r.member_id === payload.member_id)) return
  const cover = payload.answers ? JSON.stringify(payload.answers) : null
  const resumeForRecruiter =
    application.resume_url?.startsWith('http') && !application.resume_url.startsWith('blob:')
      ? application.resume_url
      : MOCK_RESUME_PDF
  const row: JobApplicantRow = {
    ...application,
    member_name: member.full_name,
    headline: member.headline ?? '',
    match_score: 62 + (application.application_id.length % 34),
    resume_url: resumeForRecruiter,
    cover_letter: cover,
    notes: '',
    contact_email: payload.contact_email,
    contact_phone: payload.contact_phone,
  }
  list.unshift(row)
  mockApplicantsByJobId.set(payload.job_id, list)
}

function getMockList(memberId: string): MemberApplication[] {
  let list = mockListByMember.get(memberId)
  if (!list) {
    list = generateMockMemberApplications(memberId)
    mockListByMember.set(memberId, list)
  }
  return list
}

function sortApps(list: MemberApplication[]): MemberApplication[] {
  return [...list].sort((a, b) => new Date(b.applied_at).getTime() - new Date(a.applied_at).getTime())
}

export async function listMemberApplications(member_id: string): Promise<MemberApplication[]> {
  if (USE_MOCKS) {
    await mockDelay(200)
    return sortApps(getMockList(member_id))
  }
  const response = await apiClient.post<unknown>('/applications/byMember', { member_id })
  const data: any = response.data as any
  if (Array.isArray(data)) return data as MemberApplication[]
  if (data && Array.isArray(data.results)) return data.results as MemberApplication[]
  if (data && Array.isArray(data.applications)) return data.applications as MemberApplication[]
  return []
}

export function appendApplicationToMemberTracker(
  memberId: string,
  res: { application_id: string; job_id: string; applied_at: string },
  job: Pick<JobRecord, 'title' | 'company_name' | 'company_logo_url' | 'location' | 'work_mode' | 'posted_time_ago'>,
): void {
  const list = getMockList(memberId)
  const row: MemberApplication = {
    application_id: res.application_id,
    job_id: res.job_id,
    member_id: memberId,
    status: 'submitted',
    applied_at: res.applied_at,
    updated_at: res.applied_at,
    job: {
      title: job.title,
      company_name: job.company_name,
      company_logo_url: job.company_logo_url,
      location: job.location,
      work_mode: job.work_mode,
      posted_at: new Date().toISOString(),
      reposted_at: null,
      listing_status: 'open',
    },
    connection_avatar_urls: [],
  }
  if (!list.some((a) => a.application_id === row.application_id)) {
    list.unshift(row)
  }
}

export async function submitApplication(payload: SubmitApplicationPayload): Promise<Application> {
  if (USE_MOCKS) {
    await mockDelay(400)
    const alreadyApplicants = mockApplicantsByJobId.get(payload.job_id)?.some((r) => r.member_id === payload.member_id)
    if (alreadyApplicants) {
      return Promise.reject(new Error('duplicate'))
    }
    const trackerList = getMockList(payload.member_id)
    if (trackerList.some((a) => a.job_id === payload.job_id)) {
      return Promise.reject(new Error('duplicate'))
    }
    const now = new Date().toISOString()
    const app: Application = {
      application_id: `app-${payload.member_id}-${payload.job_id}-${Date.now()}`,
      job_id: payload.job_id,
      member_id: payload.member_id,
      resume_url: payload.resume_url,
      cover_letter: payload.answers ? JSON.stringify(payload.answers) : null,
      status: 'submitted',
      applied_at: now,
      updated_at: now,
    }
    await appendMockApplicantFromEasyApply(payload, app)
    return app
  }
  const response = await apiClient.post<Application>('/applications/submit', payload)
  return response.data
}

export async function listApplicationsByJob(job_id: string): Promise<JobApplicantRow[]> {
  if (USE_MOCKS) {
    await mockDelay(250)
    const submitted = mockApplicantsByJobId.get(job_id) ?? []
    const legacy = generateLegacyApplicants(job_id)
    const merged = [...submitted, ...legacy]
    const seen = new Set<string>()
    const out = merged.filter((row) => {
      if (seen.has(row.application_id)) return false
      seen.add(row.application_id)
      return true
    })
    out.sort((a, b) => new Date(b.applied_at).getTime() - new Date(a.applied_at).getTime())
    return out
  }
  const response = await apiClient.post<unknown>('/applications/byJob', { job_id })
  const data: any = response.data as any
  if (Array.isArray(data)) return data as JobApplicantRow[]
  if (data && Array.isArray(data.results)) return data.results as JobApplicantRow[]
  if (data && Array.isArray(data.applications)) return data.applications as JobApplicantRow[]
  return []
}

export async function updateApplicationStatus(application_id: string, status: Application['status']): Promise<{ success: boolean }> {
  if (USE_MOCKS) {
    await mockDelay(180)
    for (const list of mockApplicantsByJobId.values()) {
      const row = list.find((r) => r.application_id === application_id)
      if (row) {
        row.status = status
        row.updated_at = new Date().toISOString()
        return { success: true }
      }
    }
    return { success: true }
  }
  const response = await apiClient.post<{ success: boolean }>('/applications/updateStatus', { application_id, status })
  return response.data
}

export async function updateMemberApplicationStatus(
  application_id: string,
  status: TrackerStatusUpdate,
  rejectionReason?: string,
  memberId?: string,
): Promise<MemberApplication> {
  if (USE_MOCKS) {
    await mockDelay(200)
    if (!memberId) {
      throw new Error('memberId required')
    }
    const list = getMockList(memberId)
    const i = list.findIndex((a) => a.application_id === application_id)
    if (i < 0) {
      throw new Error('Application not found')
    }
    const current = list[i]!
    let rejected_from: RejectedFromStage | undefined
    if (status === 'rejected') {
      if (current.status === 'interview' || current.status === 'offer') {
        rejected_from = 'interview'
      } else {
        rejected_from = 'submitted'
      }
    }
    const next: MemberApplication = {
      ...current,
      status: status === 'interview' ? 'interview' : status === 'offer' ? 'offer' : 'rejected',
      updated_at: new Date().toISOString(),
      rejected_from: status === 'rejected' ? rejected_from : undefined,
    }
    if (rejectionReason) {
      console.debug('[tracker] rejection reason', rejectionReason)
    }
    list[i] = next
    return next
  }
  const response = await apiClient.post<MemberApplication>('/applications/updateStatus', {
    application_id,
    status,
    rejection_reason: rejectionReason,
  })
  return response.data
}

export async function addApplicationNote(application_id: string, note: string): Promise<{ success: boolean }> {
  if (USE_MOCKS) {
    await mockDelay(180)
    console.debug('[mock] application note', { application_id, note })
    return { success: true }
  }
  const response = await apiClient.post<{ success: boolean }>('/applications/addNote', { application_id, note })
  return response.data
}
