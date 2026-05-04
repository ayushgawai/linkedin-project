/** Query key on `/recruiter/jobs` to open the applicants panel inline (same page as Manage jobs). */
export const RECRUITER_JOBS_APPLICANTS_QUERY = 'applicants' as const

export function recruiterJobsApplicantsUrl(jobId: string): string {
  const q = new URLSearchParams()
  if (jobId.trim()) q.set(RECRUITER_JOBS_APPLICANTS_QUERY, jobId.trim())
  const s = q.toString()
  return s ? `/recruiter/jobs?${s}` : '/recruiter/jobs'
}
