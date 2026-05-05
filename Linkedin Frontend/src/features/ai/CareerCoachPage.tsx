import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { getCareerCoaching, type CareerCoachResponse } from '../../api/ai'
import { getJob } from '../../api/jobs'
import { Button, Card, Input } from '../../components/ui'
import { useAuthStore } from '../../store/authStore'
import { useSearchParams } from 'react-router-dom'
import { cn } from '../../lib/cn'

function formatSkillLabel(s: string): string {
  const t = s.trim()
  if (!t) return t
  return t.charAt(0).toUpperCase() + t.slice(1)
}

/** Fixed height so profile / job preview cards align and ID fields line up. */
const PREVIEW_CARD =
  'flex h-[6.5rem] flex-col rounded-lg border border-border bg-surface-raised px-3 py-2'

function CoachReport({ report }: { report: CareerCoachResponse }): JSX.Element {
  const score = Math.max(0, Math.min(100, Number(report.match_score ?? 0)))
  const matching = report.matching_skills ?? []
  const missing = report.missing_skills ?? report.skills_to_add ?? []
  const improvements = report.resume_improvements ?? []
  const headline = (report.headline_suggestion ?? '').trim()
  const rationale = (report.rationale ?? '').trim()

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-text-tertiary">Match with this job</p>
        <div className="mt-2 flex items-center gap-3">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-black/10">
            <div
              className={cn('h-full rounded-full transition-all', score >= 70 ? 'bg-success' : score >= 40 ? 'bg-amber-500' : 'bg-brand-primary')}
              style={{ width: `${score}%` }}
            />
          </div>
          <span className="text-sm font-semibold tabular-nums text-text-primary">{score}%</span>
        </div>
      </div>

      {rationale ? (
        <div>
          <h3 className="text-sm font-semibold text-text-primary">Summary</h3>
          <p className="mt-1 text-sm leading-relaxed text-text-secondary">{rationale}</p>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">Skills you already show</h3>
          {matching.length === 0 ? (
            <p className="mt-1 text-sm text-text-tertiary">None listed on your profile for this job’s required skills.</p>
          ) : (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {matching.map((s) => (
                <li key={s} className="rounded-full border border-success/40 bg-success/10 px-2.5 py-0.5 text-xs font-medium text-text-primary">
                  {formatSkillLabel(s)}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h3 className="text-sm font-semibold text-text-primary">Skills to add or surface</h3>
          {missing.length === 0 ? (
            <p className="mt-1 text-sm text-text-tertiary">You cover the job’s listed skills — focus on impact and proof.</p>
          ) : (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {missing.map((s) => (
                <li key={s} className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-text-primary">
                  {formatSkillLabel(s)}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {headline ? (
        <div>
          <h3 className="text-sm font-semibold text-text-primary">Suggested headline</h3>
          <p className="mt-1 rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-text-primary">{headline}</p>
        </div>
      ) : null}

      {improvements.length > 0 ? (
        <div>
          <h3 className="text-sm font-semibold text-text-primary">Resume and profile actions</h3>
          <ol className="mt-2 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-text-secondary">
            {improvements.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ol>
        </div>
      ) : null}
    </div>
  )
}

export default function CareerCoachPage(): JSX.Element {
  const user = useAuthStore((s) => s.user)
  const [params] = useSearchParams()
  const [memberId, setMemberId] = useState(user?.member_id ?? '')
  const [targetJobId, setTargetJobId] = useState(() => params.get('target_job_id') ?? '')
  const [report, setReport] = useState<CareerCoachResponse | null>(null)
  const [resumeFile, setResumeFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (user?.member_id) setMemberId((prev) => (prev.trim().length === 0 ? user.member_id : prev))
  }, [user?.member_id])

  const canRun = useMemo(() => memberId.trim().length > 0 && targetJobId.trim().length > 0, [memberId, targetJobId])

  const coachingSelf = Boolean(user?.member_id && memberId.trim() === user.member_id)

  function handleResumeChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null
    setResumeFile(file)
    // Reset so user can re-upload the same filename after editing
    e.target.value = ''
  }

  function handleRemoveResume() {
    setResumeFile(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const jobPreviewQuery = useQuery({
    queryKey: ['job', targetJobId.trim()],
    queryFn: () => getJob(targetJobId.trim()),
    enabled: targetJobId.trim().length >= 8,
    retry: false,
  })

  const coachMutation = useMutation({
    mutationFn: async () => getCareerCoaching(memberId.trim(), targetJobId.trim(), resumeFile),
    onSuccess: (data) => setReport(data),
  })

  useEffect(() => {
    const q = params.get('target_job_id') ?? ''
    if (!q) return
    setTargetJobId((prev) => (prev.trim().length === 0 || prev === q ? q : prev))
  }, [params])

  return (
    <div className="space-y-4">
      <Card>
        <Card.Body className="space-y-3">
          <div>
            <h1 className="text-xl font-semibold text-text-primary">Career Coach</h1>
            <p className="mt-1 text-sm text-text-secondary">
              Compare your profile to a target job and get headline and resume guidance. Optionally upload your resume (PDF, DOCX, or TXT) for hyper-specific, line-by-line feedback tied to the job description.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 md:items-start">
            <div className="flex flex-col gap-2">
              <div className={PREVIEW_CARD}>
                <p className="text-xs font-medium uppercase tracking-wide text-text-tertiary">Your profile</p>
                {coachingSelf && user?.full_name ? (
                  <>
                    <p className="mt-1 line-clamp-2 text-sm font-semibold text-text-primary">{user.full_name}</p>
                    <p className="mt-0.5 line-clamp-1 text-xs text-text-secondary">{user.email ?? '\u00a0'}</p>
                  </>
                ) : memberId.trim() ? (
                  <>
                    <p className="mt-1 line-clamp-2 text-sm font-semibold text-text-primary">Coaching by ID</p>
                    <p className="mt-0.5 line-clamp-1 text-xs text-text-secondary">Not your signed-in account</p>
                  </>
                ) : (
                  <>
                    <p className="mt-1 line-clamp-2 text-sm font-semibold text-text-primary">—</p>
                    <p className="mt-0.5 line-clamp-1 text-xs text-text-secondary">Enter a profile ID below</p>
                  </>
                )}
              </div>
              <Input
                label="Profile ID"
                value={memberId}
                onChange={(e) => setMemberId(e.target.value)}
                placeholder="Member UUID"
                className="font-mono text-xs"
              />
            </div>
            <div className="flex flex-col gap-2">
              <div className={PREVIEW_CARD}>
                <p className="text-xs font-medium uppercase tracking-wide text-text-tertiary">Target role</p>
                {jobPreviewQuery.data ? (
                  <>
                    <p className="mt-1 line-clamp-2 text-sm font-semibold text-text-primary">{jobPreviewQuery.data.title}</p>
                    <p className="mt-0.5 line-clamp-1 text-xs text-text-secondary">
                      {jobPreviewQuery.data.company_name?.trim() || '\u00a0'}
                    </p>
                  </>
                ) : targetJobId.trim().length >= 8 && jobPreviewQuery.isFetching ? (
                  <>
                    <p className="mt-1 line-clamp-2 text-sm font-semibold text-text-primary">Loading…</p>
                    <p className="mt-0.5 line-clamp-1 text-xs text-text-secondary">Fetching job details</p>
                  </>
                ) : targetJobId.trim() && jobPreviewQuery.isError ? (
                  <>
                    <p className="mt-1 line-clamp-2 text-sm font-semibold text-text-primary">Could not load job</p>
                    <p className="mt-0.5 line-clamp-1 text-xs text-text-secondary">Check the job ID</p>
                  </>
                ) : (
                  <>
                    <p className="mt-1 line-clamp-2 text-sm font-semibold text-text-primary">—</p>
                    <p className="mt-0.5 line-clamp-1 text-xs text-text-secondary">Enter a job ID below</p>
                  </>
                )}
              </div>
              <Input
                label="Job ID"
                value={targetJobId}
                onChange={(e) => setTargetJobId(e.target.value)}
                placeholder="Job UUID"
                className="font-mono text-xs"
              />
            </div>
          </div>

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,.txt"
            className="hidden"
            onChange={handleResumeChange}
          />

          <div className="flex flex-wrap items-center gap-2">
            {/* Resume upload button */}
            {resumeFile ? (
              <div className="flex items-center gap-1.5 rounded-lg border border-success/40 bg-success/10 px-3 py-1.5">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0 text-success" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
                </svg>
                <span className="max-w-[180px] truncate text-xs font-medium text-text-primary">{resumeFile.name}</span>
                <button
                  type="button"
                  aria-label="Remove resume"
                  onClick={handleRemoveResume}
                  className="ml-0.5 rounded-full p-0.5 text-text-tertiary hover:text-danger"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
            ) : (
              <Button variant="secondary" onClick={() => fileInputRef.current?.click()}>
                Add resume
              </Button>
            )}

            <Button variant="primary" disabled={!canRun || coachMutation.isPending} onClick={() => coachMutation.mutate()}>
              {coachMutation.isPending ? 'Generating…' : 'Generate suggestions'}
            </Button>
            {coachMutation.isError ? <span className="text-sm text-danger">Unable to generate coaching</span> : null}
          </div>
        </Card.Body>
      </Card>

      {report ? (
        <Card>
          <Card.Header>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-text-primary">Your coaching report</h2>
              {resumeFile ? (
                <span className="rounded-full border border-brand-primary/30 bg-brand-primary/10 px-2 py-0.5 text-xs font-medium text-brand-primary">
                  Resume-based
                </span>
              ) : null}
            </div>
          </Card.Header>
          <Card.Body>
            <CoachReport report={report} />
          </Card.Body>
        </Card>
      ) : null}
    </div>
  )
}
