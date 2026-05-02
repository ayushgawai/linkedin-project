import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import {
  addApplicationNote,
  listApplicationsByJob,
  undoRejectApplication,
  updateApplicationStatus,
  updateMemberApplicationStatus,
  type JobApplicantRow,
} from '../../api/applications'
import { ingestEvent } from '../../api/analytics'
import { getJob } from '../../api/jobs'
import { pushMockApplicationOutcomeNotification } from '../../api/notifications'
import { Avatar, Badge, Button, Card, Textarea, useToast } from '../../components/ui'
import { useAuthStore } from '../../store/authStore'
import type { ApiError } from '../../types'

function badgeVariantFromStatus(status: string): 'neutral' | 'brand' | 'success' | 'danger' {
  if (status === 'submitted' || status === 'under_review' || status === 'reviewing') return 'neutral'
  if (status === 'shortlisted' || status === 'interview') return 'brand'
  if (status === 'accepted' || status === 'offer') return 'success'
  if (status === 'rejected') return 'danger'
  return 'neutral'
}

function statusLabel(status: string): string {
  if (status === 'under_review' || status === 'reviewing') return 'Under review'
  if (status === 'shortlisted' || status === 'interview') return 'Interview'
  if (status === 'accepted' || status === 'offer') return 'Offer'
  if (status === 'rejected') return 'Rejected'
  return status
}

function parseEasyApplyAnswers(raw: string | null | undefined): Record<string, string> | null {
  if (!raw?.trim()) return null
  try {
    const v = JSON.parse(raw) as unknown
    if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, string>
  } catch {
    return null
  }
  return null
}

export default function RecruiterApplicantsPage(): JSX.Element {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const { jobId = '' } = useParams()
  const user = useAuthStore((s) => s.user)
  const [reviewingId, setReviewingId] = useState<string | null>(null)
  const [note, setNote] = useState('')

  const query = useQuery({
    queryKey: ['job-applicants', jobId],
    queryFn: () => listApplicationsByJob(jobId),
    enabled: Boolean(jobId),
  })

  const jobQuery = useQuery({
    queryKey: ['job', jobId],
    queryFn: () => getJob(jobId),
    enabled: Boolean(jobId),
  })

  const jobHeading =
    jobQuery.data?.job_id === jobId ? jobQuery.data.title : jobQuery.isLoading ? 'Loading job…' : 'Job applicants'

  const rows = useMemo(() => query.data ?? [], [query.data])

  useEffect(() => {
    if (rows.length === 0) {
      setReviewingId(null)
      return
    }
    if (reviewingId && !rows.some((r) => r.application_id === reviewingId)) {
      setReviewingId(null)
    }
  }, [rows, reviewingId])

  const current = useMemo(
    () => (reviewingId ? rows.find((r) => r.application_id === reviewingId) ?? null : null),
    [rows, reviewingId],
  )

  const easyApplyAnswers = useMemo(() => parseEasyApplyAnswers(current?.cover_letter ?? null), [current?.cover_letter])

  const updateMutation = useMutation({
    mutationFn: ({ applicationId, status }: { applicationId: string; status: JobApplicantRow['status'] }) =>
      updateApplicationStatus(applicationId, status),
    onSuccess: async (_, vars) => {
      const resolveJobMeta = async (): Promise<{ title: string; company_name: string }> => {
        const cached = jobQuery.data?.job_id === jobId ? jobQuery.data : undefined
        if (cached?.title?.trim()) {
          return {
            title: cached.title.trim(),
            company_name: (cached.company_name ?? 'Company').trim() || 'Company',
          }
        }
        if (!jobId) return { title: 'this role', company_name: 'the hiring team' }
        try {
          const j = await queryClient.ensureQueryData({
            queryKey: ['job', jobId],
            queryFn: () => getJob(jobId),
          })
          return {
            title: j.title?.trim() || 'this role',
            company_name: (j.company_name ?? 'Company').trim() || 'Company',
          }
        } catch {
          return { title: 'this role', company_name: 'the hiring team' }
        }
      }

      if (user) {
        await ingestEvent({
          event_type: 'application.status.changed',
          trace_id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          actor_id: user.member_id,
          entity: { entity_type: 'application', entity_id: vars.applicationId },
          idempotency_key: `application-status-${vars.applicationId}-${vars.status}`,
        })
      }

      queryClient.setQueryData<JobApplicantRow[]>(['job-applicants', jobId], (prev) =>
        prev?.map((r) =>
          r.application_id === vars.applicationId ? { ...r, status: vars.status, updated_at: new Date().toISOString() } : r,
        ),
      )

      const listAfter = queryClient.getQueryData<JobApplicantRow[]>(['job-applicants', jobId])
      const applicant = listAfter?.find((r) => r.application_id === vars.applicationId)
      if (applicant) {
        if (vars.status === 'interview') {
          try {
            await updateMemberApplicationStatus(vars.applicationId, 'interview', undefined, applicant.member_id)
          } catch {
            /* tracker row may be missing for seeded-only applicants */
          }
          const meta = await resolveJobMeta()
          pushMockApplicationOutcomeNotification({
            recipient_member_id: applicant.member_id,
            job_id: jobId,
            job_title: meta.title,
            company_name: meta.company_name,
            kind: 'interview',
          })
          toast({
            variant: 'success',
            title: 'Interview invitation sent',
            description: `${applicant.member_name} will see this in Notifications (refresh if already open).`,
          })
        }
        if (vars.status === 'rejected') {
          try {
            await updateMemberApplicationStatus(vars.applicationId, 'rejected', undefined, applicant.member_id)
          } catch {
            /* tracker row may be missing for seeded-only applicants */
          }
          const meta = await resolveJobMeta()
          pushMockApplicationOutcomeNotification({
            recipient_member_id: applicant.member_id,
            job_id: jobId,
            job_title: meta.title,
            company_name: meta.company_name,
            kind: 'rejected',
          })
          toast({
            variant: 'success',
            title: 'Candidate notified',
            description: `${applicant.member_name} will see this in Notifications (refresh if already open).`,
          })
        }
        void queryClient.invalidateQueries({ queryKey: ['my-applications', applicant.member_id] })
      }

      void queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
  })

  const undoMutation = useMutation({
    mutationFn: ({ applicationId, memberId }: { applicationId: string; memberId: string }) =>
      undoRejectApplication(applicationId, memberId),
    onSuccess: async (_, vars) => {
      queryClient.setQueryData<JobApplicantRow[]>(['job-applicants', jobId], (prev) =>
        prev?.map((r) =>
          r.application_id === vars.applicationId
            ? { ...r, status: 'reviewing', updated_at: new Date().toISOString() }
            : r,
        ),
      )
      void queryClient.invalidateQueries({ queryKey: ['my-applications', vars.memberId] })
      void queryClient.invalidateQueries({ queryKey: ['notifications'] })
      toast({
        variant: 'success',
        title: 'Rejection undone',
        description: 'Candidate is back under review. You can invite them to interview when ready.',
      })
    },
    onError: (err: unknown) => {
      const api = err as ApiError
      const raw = api.details as { code?: string; error?: { code?: string }; message?: string } | undefined
      const code = raw?.code ?? raw?.error?.code
      const isTransition =
        code === 'INVALID_STATUS_TRANSITION' ||
        (typeof api.message === 'string' && api.message.toLowerCase().includes('invalid') && api.message.toLowerCase().includes('transition'))
      toast({
        variant: 'error',
        title: 'Could not undo rejection',
        description: isTransition
          ? 'Your Application API is still on an older build (rejected→reviewing is not enabled). Rebuild and restart: docker compose -f infra/docker-compose.yml build application && docker compose -f infra/docker-compose.yml up -d application'
          : api.message || 'Only rejected applications can be restored.',
      })
    },
  })

  const noteMutation = useMutation({
    mutationFn: ({ applicationId, value }: { applicationId: string; value: string }) => addApplicationNote(applicationId, value),
  })

  return (
    <div className="pb-6">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link to={`/jobs/${jobId}`} className="text-sm font-semibold text-brand-primary hover:underline">
            ← Back to job
          </Link>
          <h1 className="mt-1 text-2xl font-semibold text-text-primary">Applicants</h1>
          <p className="mt-0.5 text-sm text-text-secondary">{jobHeading}</p>
        </div>
        <p className="text-sm text-text-tertiary">
          {(rows.length === 1 ? '1 application' : `${rows.length} applications`)} · Easy Apply
        </p>
      </div>

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 lg:col-span-5">
          <Card>
            <Card.Header>
              <h2 className="text-lg font-semibold">Applicants</h2>
            </Card.Header>
            <Card.Body className="space-y-2">
              {query.isLoading ? (
                <p className="py-8 text-center text-sm text-text-secondary">Loading…</p>
              ) : rows.length === 0 ? (
                <p className="py-8 text-center text-sm text-text-secondary">No applicants yet.</p>
              ) : (
                rows.map((item) => (
                  <div
                    key={item.application_id}
                    className={`flex items-center gap-3 rounded-lg border border-border p-3 transition ${
                      reviewingId === item.application_id ? 'border-brand-primary bg-brand-primary/5' : 'bg-surface-raised'
                    }`}
                  >
                    <Avatar size="md" name={item.member_name} />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-text-primary">{item.member_name}</p>
                      <p className="truncate text-xs text-text-secondary">{item.headline}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <Badge variant={badgeVariantFromStatus(item.status)}>{statusLabel(item.status)}</Badge>
                        <span className="text-xs text-text-tertiary">
                          Applied{' '}
                          {Math.max(0, Math.round((Date.now() - new Date(item.applied_at).getTime()) / 86400000)) === 0
                            ? 'today'
                            : `${Math.max(1, Math.round((Date.now() - new Date(item.applied_at).getTime()) / 86400000))}d ago`}
                        </span>
                      </div>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant={reviewingId === item.application_id ? 'primary' : 'secondary'}
                      className="shrink-0"
                      onClick={() => {
                        setReviewingId(item.application_id)
                        setNote('')
                      }}
                    >
                      Review
                    </Button>
                  </div>
                ))
              )}
            </Card.Body>
          </Card>
        </div>

        <div className="col-span-12 lg:col-span-7">
          {!current ? (
            <Card>
              <Card.Body className="flex min-h-[280px] flex-col items-center justify-center gap-2 px-6 py-12 text-center">
                <p className="text-base font-semibold text-text-primary">Review an applicant</p>
                <p className="max-w-sm text-sm text-text-secondary">
                  Choose <span className="font-medium">Review</span> on the left to see their Easy Apply answers, resume (PDF), and contact details.
                  You can invite them to interview or send a rejection — they will get a notification. You can undo a rejection to return them to under review, then invite them to interview.
                </p>
              </Card.Body>
            </Card>
          ) : (
            <div className="space-y-3">
              <Card>
                <Card.Body className="space-y-3 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <Avatar size="lg" name={current.member_name} />
                      <div>
                        <p className="text-lg font-semibold text-text-primary">{current.member_name}</p>
                        <p className="text-sm text-text-secondary">{current.headline}</p>
                        <div className="mt-2">
                          <Badge variant={badgeVariantFromStatus(current.status)}>{statusLabel(current.status)}</Badge>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {current.status === 'rejected' ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          loading={undoMutation.isPending}
                          disabled={updateMutation.isPending}
                          onClick={() =>
                            undoMutation.mutate({
                              applicationId: current.application_id,
                              memberId: current.member_id,
                            })
                          }
                        >
                          Undo rejection
                        </Button>
                      ) : null}
                      <Button
                        size="sm"
                        loading={updateMutation.isPending}
                        disabled={
                          undoMutation.isPending ||
                          current.status === 'interview' ||
                          current.status === 'offer' ||
                          current.status === 'rejected'
                        }
                        onClick={() => updateMutation.mutate({ applicationId: current.application_id, status: 'interview' as JobApplicantRow['status'] })}
                      >
                        Invite to interview
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        loading={updateMutation.isPending}
                        disabled={undoMutation.isPending || current.status === 'rejected'}
                        onClick={() => updateMutation.mutate({ applicationId: current.application_id, status: 'rejected' })}
                      >
                        Reject
                      </Button>
                    </div>
                  </div>
                  <Link to={`/in/${current.member_id}`} className="text-sm font-semibold text-brand-primary hover:underline">
                    View full profile
                  </Link>
                </Card.Body>
              </Card>

              {current.contact_email || current.contact_phone ? (
                <Card>
                  <Card.Header>
                    <h3 className="font-semibold">Easy Apply — contact</h3>
                  </Card.Header>
                  <Card.Body className="space-y-1 text-sm text-text-secondary">
                    {current.contact_email ? (
                      <p>
                        <span className="font-medium text-text-primary">Email:</span> {current.contact_email}
                      </p>
                    ) : null}
                    {current.contact_phone ? (
                      <p>
                        <span className="font-medium text-text-primary">Phone:</span> {current.contact_phone}
                      </p>
                    ) : null}
                    {easyApplyAnswers?.location ? (
                      <p>
                        <span className="font-medium text-text-primary">Location:</span> {easyApplyAnswers.location}
                      </p>
                    ) : null}
                  </Card.Body>
                </Card>
              ) : null}

              <Card>
                <Card.Header>
                  <h3 className="font-semibold">Resume</h3>
                </Card.Header>
                <Card.Body className="space-y-3">
                  {easyApplyAnswers?.resume_file_name ? (
                    <p className="text-sm text-text-secondary">
                      Uploaded file:{' '}
                      <span className="font-medium text-text-primary">{easyApplyAnswers.resume_file_name}</span>
                    </p>
                  ) : null}
                  {current.resume_url?.startsWith('http') ? (
                    <div className="space-y-2">
                      <a
                        href={current.resume_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm font-semibold text-brand-primary hover:underline"
                      >
                        Open PDF in new tab
                      </a>
                      {current.resume_url.endsWith('.pdf') || current.resume_url.includes('.pdf') ? (
                        <object
                          data={current.resume_url}
                          type="application/pdf"
                          className="h-[min(520px,70vh)] w-full rounded border border-border bg-surface"
                          title="Resume PDF"
                        >
                          <p className="p-4 text-sm text-text-secondary">
                            PDF preview is not available in this browser.{' '}
                            <a href={current.resume_url} className="font-semibold text-brand-primary" target="_blank" rel="noreferrer">
                              Download PDF
                            </a>
                          </p>
                        </object>
                      ) : null}
                    </div>
                  ) : current.resume_text?.startsWith('data:') ? (
                    <div className="space-y-2">
                      <a
                        href={current.resume_text}
                        download={easyApplyAnswers?.resume_file_name || 'resume'}
                        className="text-sm font-semibold text-brand-primary hover:underline"
                      >
                        Download uploaded resume
                      </a>
                      {current.resume_text.startsWith('data:application/pdf') ? (
                        <object
                          data={current.resume_text}
                          type="application/pdf"
                          className="h-[min(520px,70vh)] w-full rounded border border-border bg-surface"
                          title="Resume PDF"
                        >
                          <p className="p-4 text-sm text-text-secondary">
                            PDF preview is not available in this browser. Use the download link above.
                          </p>
                        </object>
                      ) : (
                        <p className="text-sm text-text-secondary">
                          This file type can’t be previewed here. Use the download link above.
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-text-secondary">No resume file on record.</p>
                  )}
                </Card.Body>
              </Card>

              <Card>
                <Card.Header>
                  <h3 className="font-semibold">{easyApplyAnswers ? 'Application answers' : 'Cover letter'}</h3>
                </Card.Header>
                <Card.Body className="space-y-3 text-sm text-text-secondary">
                  {easyApplyAnswers ? (
                    <>
                      {easyApplyAnswers.motivation ? (
                        <div>
                          <p className="font-semibold text-text-primary">Why are you a good fit for this role?</p>
                          <p className="mt-1 whitespace-pre-wrap">{easyApplyAnswers.motivation}</p>
                        </div>
                      ) : null}
                      {easyApplyAnswers.project_highlight ? (
                        <div>
                          <p className="font-semibold text-text-primary">Project highlight</p>
                          <p className="mt-1 whitespace-pre-wrap">{easyApplyAnswers.project_highlight}</p>
                        </div>
                      ) : null}
                      {!easyApplyAnswers.motivation && !easyApplyAnswers.project_highlight ? (
                        <p className="whitespace-pre-wrap">{current.cover_letter}</p>
                      ) : null}
                    </>
                  ) : (
                    <p className="whitespace-pre-wrap">{current.cover_letter ?? 'No cover letter provided.'}</p>
                  )}
                </Card.Body>
              </Card>

              <Card>
                <Card.Header>
                  <h3 className="font-semibold">Recruiter notes</h3>
                </Card.Header>
                <Card.Body className="space-y-2">
                  <Textarea value={note} onChange={(e) => setNote(e.target.value)} autoResize placeholder="Private notes about this candidate…" />
                  <Button
                    size="sm"
                    loading={noteMutation.isPending}
                    onClick={() => noteMutation.mutate({ applicationId: current.application_id, value: note })}
                  >
                    Save note
                  </Button>
                </Card.Body>
              </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
