import { useEffect, useMemo, useState } from 'react'
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

  useEffect(() => {
    if (user?.member_id) setMemberId((prev) => (prev.trim().length === 0 ? user.member_id : prev))
  }, [user?.member_id])

  const canRun = useMemo(() => memberId.trim().length > 0 && targetJobId.trim().length > 0, [memberId, targetJobId])

  const coachingSelf = Boolean(user?.member_id && memberId.trim() === user.member_id)

  const jobPreviewQuery = useQuery({
    queryKey: ['job', targetJobId.trim()],
    queryFn: () => getJob(targetJobId.trim()),
    enabled: targetJobId.trim().length >= 8,
    retry: false,
  })

  const coachMutation = useMutation({
    mutationFn: async () => getCareerCoaching(memberId.trim(), targetJobId.trim()),
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
              Compare your profile to a target job and get headline and resume guidance. The coach API uses your profile and job IDs; we show your name and job title when we can load them.
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

          <div className="flex flex-wrap items-center gap-2">
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
            <h2 className="text-lg font-semibold text-text-primary">Your coaching report</h2>
          </Card.Header>
          <Card.Body>
            <CoachReport report={report} />
          </Card.Body>
        </Card>
      ) : null}
    </div>
  )
}
