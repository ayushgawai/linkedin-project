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

import { isAxiosError } from 'axios'
import { apiClient, mockDelay, USE_MOCKS, unwrapApiData } from './client'
import { MOCK_JOBS } from '../lib/jobsMockData'
import { generateMockMemberApplications } from '../lib/memberApplicationsMock'
import type { ApiError, Application } from '../types'
import type { JobRecord } from '../types/jobs'
import type { SubmitApplicationPayload } from '../types/jobs'
import type { MemberApplication, RejectedFromStage, TrackerStatusUpdate } from '../types/tracker'
import { getMember } from './profile'

const mockListByMember = new Map<string, MemberApplication[]>()

/** Axios errors and our apiClient interceptor reject with `{ status, message }`. */
function errorHttpStatus(err: unknown): number | undefined {
  if (isAxiosError(err)) return err.response?.status
  if (err && typeof err === 'object' && 'status' in err) {
    const s = (err as ApiError).status
    if (typeof s === 'number') return s
  }
  return undefined
}

/** Application service wraps payloads as `{ success, data }`; gateway may return the body directly. */
function unwrapApplicationPayload<T>(body: unknown): T {
  if (body && typeof body === 'object' && (body as { success?: boolean }).success === true && 'data' in body) {
    return (body as { data: T }).data
  }
  return body as T
}

function normalizeTrackerStatus(status: string | null | undefined): string {
  if (status === 'reviewing') return 'under_review'
  return status || 'submitted'
}

function normalizeRecruiterStatus(status: string | null | undefined): string {
  return status || 'submitted'
}

function toBackendStatus(status: string): string {
  if (status === 'under_review') return 'reviewing'
  if (status === 'shortlisted') return 'interview'
  if (status === 'accepted') return 'offer'
  return status
}

/** Saved recruiter notes from `application_notes` (or mock array). */
export type ApplicationNoteRow = {
  note_id: string
  note_text: string
  created_at?: string
  recruiter_id?: string
}

/** Recruiter “applicants” list (mock): Easy Apply rows keyed by job_id, merged with seeded rows for catalog MOCK_JOBS only. */
export type JobApplicantRow = Application & {
  member_name: string
  headline: string
  match_score: number
  resume_url?: string
  cover_letter?: string | null
  /** Recruiter notes history (newest last from API order; UI may re-sort). */
  notes?: ApplicationNoteRow[] | string
  /** Easy Apply + contact JSON from `applications.answers`. */
  answers?: Record<string, unknown> | null
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
    notes: [],
  }))
}

async function appendMockApplicantFromEasyApply(payload: SubmitApplicationPayload, application: Application): Promise<void> {
  const member = await getMember(payload.member_id)
  const list = mockApplicantsByJobId.get(payload.job_id) ?? []
  if (list.some((r) => r.member_id === payload.member_id)) return
  const mergedAnswers = payload.answers && typeof payload.answers === 'object' ? { ...payload.answers } : {}
  if (payload.contact_email) mergedAnswers.contact_email = payload.contact_email
  if (payload.contact_phone) mergedAnswers.contact_phone = payload.contact_phone
  const cover = Object.keys(mergedAnswers).length > 0 ? JSON.stringify(mergedAnswers) : null
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
    notes: [],
    answers: mergedAnswers,
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
  const response = await apiClient.post<unknown>('/applications/byMember', {
    member_id,
    page: 1,
    page_size: 100,
  })
  const data: any = unwrapApiData(response.data) as any
  const rows = Array.isArray(data) ? data : data && Array.isArray(data.results) ? data.results : data && Array.isArray(data.applications) ? data.applications : []
  if (Array.isArray(rows)) {
    return rows.map((row: any) => ({
      ...row,
      applied_at: row.applied_at || row.application_datetime || new Date().toISOString(),
      updated_at: row.updated_at || row.application_datetime || row.applied_at || new Date().toISOString(),
      status: normalizeTrackerStatus(row.status),
    })) as MemberApplication[]
  }
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
      resume_url: payload.resume_url ?? null,
      resume_text: payload.resume_text ?? null,
      cover_letter: payload.answers ? JSON.stringify(payload.answers) : null,
      status: 'submitted',
      applied_at: now,
      updated_at: now,
    }
    await appendMockApplicantFromEasyApply(payload, app)
    return app
  }
  const response = await apiClient.post<Application>('/applications/submit', payload)
  return unwrapApiData(response.data) as Application
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
  const data: any = unwrapApplicationPayload(response.data)
  const raw =
    Array.isArray(data) ? data : data && Array.isArray(data.results) ? data.results : data && Array.isArray(data.applications) ? data.applications : []
  if (!Array.isArray(raw) || raw.length === 0) return []

  const enriched = await Promise.all(
    raw.map(async (row: any) => {
      const appliedAt = row.applied_at || row.application_datetime || new Date().toISOString()
      const updatedAt = row.updated_at || row.application_datetime || appliedAt
      const rawAnswers = row.answers
      let answersObj: Record<string, unknown> | null = null
      if (rawAnswers && typeof rawAnswers === 'object' && !Array.isArray(rawAnswers)) {
        answersObj = rawAnswers as Record<string, unknown>
      } else if (typeof rawAnswers === 'string' && rawAnswers.trim()) {
        try {
          const p = JSON.parse(rawAnswers) as unknown
          if (p && typeof p === 'object' && !Array.isArray(p)) answersObj = p as Record<string, unknown>
        } catch {
          answersObj = null
        }
      }
      const contact_email =
        (typeof row.contact_email === 'string' && row.contact_email.trim()) ||
        (answersObj && typeof answersObj.contact_email === 'string' ? answersObj.contact_email.trim() : undefined)
      const contact_phone =
        (typeof row.contact_phone === 'string' && row.contact_phone.trim()) ||
        (answersObj && typeof answersObj.contact_phone === 'string' ? answersObj.contact_phone.trim() : undefined)
      const noteList = Array.isArray(row.notes) ? (row.notes as ApplicationNoteRow[]) : []
      try {
        const member = await getMember(String(row.member_id))
        return {
          ...row,
          applied_at: appliedAt,
          updated_at: updatedAt,
          status: normalizeRecruiterStatus(row.status),
          member_name: member.full_name || `Member ${String(row.member_id).slice(0, 6)}`,
          headline: member.headline ?? '',
          notes: noteList,
          answers: answersObj,
          contact_email,
          contact_phone,
        } as JobApplicantRow
      } catch {
        return {
          ...row,
          applied_at: appliedAt,
          updated_at: updatedAt,
          status: normalizeRecruiterStatus(row.status),
          member_name: row.member_name || `Member ${String(row.member_id).slice(0, 6)}`,
          headline: row.headline || '',
          notes: noteList,
          answers: answersObj,
          contact_email,
          contact_phone,
        } as JobApplicantRow
      }
    }),
  )
  return enriched
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
  const backendStatus = toBackendStatus(status)
  if (backendStatus === 'interview') {
    try {
      const response = await apiClient.post<unknown>('/applications/updateStatus', {
        application_id,
        status: 'interview',
      })
      return unwrapApplicationPayload(response.data) as { success: boolean }
    } catch (err: unknown) {
      const code = errorHttpStatus(err)
      if (code === 400) {
        await apiClient.post('/applications/updateStatus', { application_id, status: 'reviewing' })
        const response = await apiClient.post<unknown>('/applications/updateStatus', {
          application_id,
          status: 'interview',
        })
        return unwrapApplicationPayload(response.data) as { success: boolean }
      }
      throw err
    }
  }
  const response = await apiClient.post<{ success: boolean }>('/applications/updateStatus', {
    application_id,
    status: backendStatus,
  })
  return unwrapApplicationPayload(response.data) as { success: boolean }
}

/** Move a rejected application back to reviewing so the candidate returns to the active pipeline. */
export async function undoRejectApplication(application_id: string, member_id: string): Promise<{ success: boolean }> {
  if (USE_MOCKS) {
    await mockDelay(180)
    for (const list of mockApplicantsByJobId.values()) {
      const row = list.find((r) => r.application_id === application_id)
      if (row && row.status === 'rejected') {
        row.status = 'reviewing'
        row.updated_at = new Date().toISOString()
      }
    }
    const list = getMockList(member_id)
    const i = list.findIndex((a) => a.application_id === application_id)
    if (i >= 0) {
      const cur = list[i]!
      list[i] = {
        ...cur,
        status: 'under_review',
        rejected_from: undefined,
        updated_at: new Date().toISOString(),
      }
    }
    return { success: true }
  }
  const response = await apiClient.post<unknown>('/applications/updateStatus', {
    application_id,
    status: 'reviewing',
  })
  return unwrapApplicationPayload(response.data) as { success: boolean }
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
  const backendStatus = toBackendStatus(status)
  try {
    const response = await apiClient.post<MemberApplication>('/applications/updateStatus', {
      application_id,
      status: backendStatus,
      rejection_reason: rejectionReason,
    })
    return response.data
  } catch (error: unknown) {
    const code = errorHttpStatus(error)
    if (backendStatus === 'interview' && code === 400) {
      await apiClient.post('/applications/updateStatus', { application_id, status: 'reviewing' })
      const response = await apiClient.post<MemberApplication>('/applications/updateStatus', {
        application_id,
        status: 'interview',
        rejection_reason: rejectionReason,
      })
      return response.data
    }
    throw error
  }
}

export async function addApplicationNote(application_id: string, note: string): Promise<{ success: boolean }> {
  if (USE_MOCKS) {
    await mockDelay(180)
    const trimmed = note.trim()
    if (!trimmed) return { success: true }
    for (const list of mockApplicantsByJobId.values()) {
      const row = list.find((r) => r.application_id === application_id)
      if (row) {
        const prev = Array.isArray(row.notes) ? row.notes : []
        const next: ApplicationNoteRow = {
          note_id: `mock-note-${Date.now()}`,
          note_text: trimmed,
          created_at: new Date().toISOString(),
          recruiter_id: 'mock-recruiter',
        }
        row.notes = [...prev, next]
        break
      }
    }
    return { success: true }
  }
  const response = await apiClient.post<{ success: boolean }>('/applications/addNote', { application_id, note })
  return unwrapApplicationPayload(response.data) as { success: boolean }
}
