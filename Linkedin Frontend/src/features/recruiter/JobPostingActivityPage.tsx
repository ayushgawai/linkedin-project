import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bookmark, Briefcase, ClipboardCheck, History, MessageCircle, MoreHorizontal, PencilLine, Users, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { closeJob, listJobsByRecruiter } from '../../api/jobs'
import { JobListItem } from '../../components/jobs'
import { Button, Card, ConfirmModal, Dropdown } from '../../components/ui'
import { cn } from '../../lib/cn'
import { PageContainer } from '../../components/layout/PageContainer'
import { SavedEmptyIllustration } from '../saved/SavedEmptyIllustration'
import { useAuthStore } from '../../store/authStore'
import { useSavedJobsStore } from '../../store/savedJobsStore'
import { useToast } from '../../components/ui/Toast'
import { recruiterJobsApplicantsUrl } from '../../lib/recruiterPaths'
import type { JobRecord } from '../../types/jobs'

function PostedJobRowMenu({ job }: { job: JobRecord }): JSX.Element {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)

  const deleteMutation = useMutation({
    mutationFn: () => closeJob(job.job_id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['jobs-discovery'] })
      await queryClient.invalidateQueries({ queryKey: ['jobs-search'] })
      await queryClient.invalidateQueries({ queryKey: ['recruiter-jobs'] })
      await queryClient.invalidateQueries({ queryKey: ['recruiter-jobs-activity'] })
      await queryClient.invalidateQueries({ queryKey: ['job', job.job_id] })
      toast({ variant: 'success', title: 'Job removed', description: `${job.title} is no longer posted.` })
    },
    onError: () => {
      toast({ variant: 'error', title: 'Could not delete job' })
    },
  })

  async function confirmDeleteJobPost(): Promise<void> {
    try {
      await deleteMutation.mutateAsync()
      setDeleteConfirmOpen(false)
    } catch {
      /* toast from onError */
    }
  }

  return (
    <>
      <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
        <Dropdown.Root>
          <Dropdown.Trigger
            showEndChevron={false}
            className="flex h-9 w-9 shrink-0 items-center justify-center gap-0 rounded-full p-0 text-text-secondary hover:bg-black/[0.06]"
          >
            <MoreHorizontal className="h-5 w-5" aria-hidden />
            <span className="sr-only">Job actions</span>
          </Dropdown.Trigger>
          <Dropdown.Content className="min-w-[10rem]">
            <Dropdown.Item className="font-medium text-text-primary" onSelect={() => navigate(`/recruiter/jobs/${job.job_id}/edit`)}>
              Edit
            </Dropdown.Item>
            <Dropdown.Item
              className="font-medium text-text-primary"
              onSelect={() => navigate(recruiterJobsApplicantsUrl(job.job_id))}
            >
              View applicants
            </Dropdown.Item>
            <Dropdown.Item className="font-medium text-danger" onSelect={() => setDeleteConfirmOpen(true)}>
              Delete
            </Dropdown.Item>
          </Dropdown.Content>
        </Dropdown.Root>
      </div>
      <ConfirmModal
        isOpen={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        title="Delete this job post?"
        message="It will disappear from search and job posting activity. Candidates will no longer see this listing."
        confirmLabel="Delete job post"
        confirmVariant="destructive"
        loading={deleteMutation.isPending}
        onConfirm={confirmDeleteJobPost}
      >
        <div className="rounded-lg border border-border bg-surface px-4 py-3">
          <p className="font-semibold text-text-primary">{job.title}</p>
          <p className="text-sm text-text-secondary">{job.company_name}</p>
          <p className="text-xs text-text-tertiary">{job.location}</p>
        </div>
      </ConfirmModal>
    </>
  )
}

function jobStatus(job: JobRecord): 'open' | 'closed' {
  const raw = job as JobRecord & { status?: string }
  return raw.status === 'closed' ? 'closed' : 'open'
}

export default function JobPostingActivityPage(): JSX.Element {
  const user = useAuthStore((state) => state.user)
  const navigate = useNavigate()
  const [bannerDismissed, setBannerDismissed] = useState(false)
  const { toast } = useToast()
  const savedEntries = useSavedJobsStore((s) => s.entries)
  const saveJob = useSavedJobsStore((s) => s.save)
  const removeSavedJob = useSavedJobsStore((s) => s.remove)
  const savedIds = useMemo(() => savedEntries.map((e) => e.job.job_id), [savedEntries])

  const recruiterId = (user?.recruiter_id || user?.member_id) ?? ''
  const isRecruiter = user?.role === 'recruiter'

  const jobsQuery = useQuery({
    queryKey: ['recruiter-jobs-activity', recruiterId],
    queryFn: () => listJobsByRecruiter(recruiterId, { page: 1, page_size: 100 }),
    enabled: Boolean(recruiterId),
  })

  const jobs = useMemo(() => jobsQuery.data ?? [], [jobsQuery.data])
  const isEmpty = !jobsQuery.isLoading && jobs.length === 0

  const openRoles = useMemo(() => jobs.filter((j) => jobStatus(j) === 'open').length, [jobs])
  const totalApplicants = useMemo(() => jobs.reduce((sum, j) => sum + (j.applicants_count ?? 0), 0), [jobs])
  const totalViews = useMemo(() => jobs.reduce((sum, j) => sum + (j.views_count ?? 0), 0), [jobs])

  const recentActivity = useMemo(() => {
    return [...jobs]
      .sort((a, b) => {
        const ta = new Date((a as JobRecord & { posted_datetime?: string }).posted_datetime ?? 0).getTime()
        const tb = new Date((b as JobRecord & { posted_datetime?: string }).posted_datetime ?? 0).getTime()
        return tb - ta
      })
      .slice(0, 8)
  }, [jobs])

  return (
    <PageContainer className="pb-10 pt-2">
      <aside className="col-span-12 lg:col-span-3">
        <Card>
          <Card.Body className="p-0">
            <div className="flex items-center gap-2 border-b border-border px-4 py-3">
              <Bookmark className="h-5 w-5 text-text-secondary" aria-hidden />
              <h2 className="text-base font-semibold text-text-primary">My items</h2>
            </div>
            <nav className="flex flex-col py-1">
              <Link
                to="/jobs/tracker"
                className="px-4 py-3 text-sm font-medium text-text-primary hover:bg-black/[0.04]"
              >
                Job tracker
              </Link>
              <div className="mx-4 border-t border-border" />
              <Link to="/saved" className="px-4 py-3 text-sm font-medium text-text-primary hover:bg-black/[0.04]">
                Saved posts and articles
              </Link>
              {isRecruiter ? (
                <>
                  <div className="mx-4 border-t border-border" />
                  <Link
                    to="/recruiter/ai"
                    onMouseEnter={() => {
                      void import('./RecruiterAiPage')
                    }}
                    className="px-4 py-3 text-sm font-medium text-text-primary hover:bg-black/[0.04]"
                  >
                    AI Copilot
                  </Link>
                </>
              ) : null}
            </nav>
          </Card.Body>
        </Card>
      </aside>

      <main className="col-span-12 space-y-4 lg:col-span-6">
        <div className="grid gap-3 sm:grid-cols-3">
          <Card>
            <Card.Body className="flex items-start gap-3 p-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-primary/10 text-brand-primary">
                <Briefcase className="h-5 w-5" aria-hidden />
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-text-secondary">Open roles</p>
                <p className="mt-1 text-2xl font-semibold text-text-primary">{jobsQuery.isLoading ? '—' : openRoles}</p>
                <p className="mt-0.5 text-xs text-text-secondary">of {jobs.length} listed</p>
              </div>
            </Card.Body>
          </Card>
          <Card>
            <Card.Body className="flex items-start gap-3 p-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-primary/10 text-brand-primary">
                <Users className="h-5 w-5" aria-hidden />
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-text-secondary">Applicants</p>
                <p className="mt-1 text-2xl font-semibold text-text-primary">{jobsQuery.isLoading ? '—' : totalApplicants}</p>
                <p className="mt-0.5 text-xs text-text-secondary">across your posts</p>
              </div>
            </Card.Body>
          </Card>
          <Card>
            <Card.Body className="flex items-start gap-3 p-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-primary/10 text-brand-primary">
                <History className="h-5 w-5" aria-hidden />
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-text-secondary">Job views</p>
                <p className="mt-1 text-2xl font-semibold text-text-primary">{jobsQuery.isLoading ? '—' : totalViews}</p>
                <p className="mt-0.5 text-xs text-text-secondary">all-time on listings</p>
              </div>
            </Card.Body>
          </Card>
        </div>

        {!bannerDismissed && (
          <Card className="relative overflow-hidden">
            <Card.Body className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-brand-primary/10 text-brand-primary">
                <ClipboardCheck className="h-7 w-7" aria-hidden />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-text-primary">Improve your chances of attracting more candidates</p>
                <p className="mt-1 text-sm text-text-secondary">Add another verification to boost your authenticity as a hirer.</p>
              </div>
              <div className="flex shrink-0 items-center gap-2 sm:flex-col sm:items-stretch">
                <Button
                  variant="secondary"
                  size="sm"
                  type="button"
                  onClick={() => toast({ variant: 'info', title: 'Verification flow opens here in a full build.' })}
                >
                  Verify for free
                </Button>
              </div>
              <button
                type="button"
                className="absolute right-2 top-2 rounded p-1 text-text-secondary hover:bg-black/[0.06]"
                aria-label="Dismiss"
                onClick={() => setBannerDismissed(true)}
              >
                <X className="h-4 w-4" />
              </button>
            </Card.Body>
          </Card>
        )}

        <Card>
          <Card.Body className="p-0">
            <div className="border-b border-border px-4 py-4">
              <h1 className="text-xl font-semibold text-text-primary">Posted Jobs</h1>
            </div>
            {jobsQuery.isLoading ? (
              <div className="flex min-h-[320px] items-center justify-center p-8 text-sm text-text-secondary">Loading…</div>
            ) : isEmpty ? (
              <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
                <SavedEmptyIllustration className="max-w-[220px]" />
                <p className="mt-6 text-lg font-semibold text-text-primary">No posted jobs under this category yet</p>
                <p className="mt-2 max-w-md text-sm text-text-secondary">Jobs that you post will show up here.</p>
              </div>
            ) : (
              <div className="space-y-2 p-3">
                {jobs.map((job) => (
                  <JobListItem
                    key={job.job_id}
                    job={job}
                    onClick={() => navigate(`/jobs/${job.job_id}`)}
                    saved={savedIds.includes(job.job_id)}
                    onSaveToggle={() => {
                      if (savedIds.includes(job.job_id)) removeSavedJob(job.job_id)
                      else saveJob(job)
                    }}
                    trailingMenu={<PostedJobRowMenu job={job} />}
                  />
                ))}
              </div>
            )}
          </Card.Body>
        </Card>

        {!jobsQuery.isLoading && jobs.length > 0 ? (
          <Card>
            <Card.Header className="border-b border-border">
              <h2 className="text-base font-semibold text-text-primary">Recent posting activity</h2>
              <p className="mt-1 text-sm text-text-secondary">Latest updates across your live listings.</p>
            </Card.Header>
            <Card.Body className="divide-y divide-border p-0">
              {recentActivity.map((job) => (
                <div key={`act-${job.job_id}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium text-text-primary">
                      Posted <span className="text-brand-primary">&quot;{job.title}&quot;</span>
                    </p>
                    <p className="mt-0.5 text-xs text-text-secondary">
                      {job.company_name} · {job.location || 'Location TBD'} · {job.posted_time_ago}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-4 text-xs text-text-secondary">
                    <span>{job.applicants_count} applicants</span>
                    <span>{job.views_count} views</span>
                    <span className={jobStatus(job) === 'open' ? 'font-semibold text-[#057642]' : 'text-text-tertiary'}>
                      {jobStatus(job) === 'open' ? 'Open' : 'Closed'}
                    </span>
                  </div>
                </div>
              ))}
            </Card.Body>
          </Card>
        ) : null}
      </main>

      <aside className="col-span-12 flex flex-col gap-4 lg:col-span-3">
        <Card>
          <Card.Body className="space-y-3 p-4">
            <Link
              to="/jobs/post"
              className={cn(
                'inline-flex w-full items-center justify-center gap-2 rounded-full border-2 border-[#0a66c2] bg-white px-4 py-2.5 text-sm font-semibold text-[#0a66c2] shadow-sm transition hover:bg-[#0a66c2]/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0a66c2] focus-visible:ring-offset-2',
              )}
            >
              <PencilLine className="h-4 w-4 shrink-0" aria-hidden />
              Post a free job
            </Link>
            <Button variant="secondary" className="w-full" type="button" onClick={() => navigate('/recruiter/jobs')}>
              Recruiter dashboard
            </Button>
          </Card.Body>
        </Card>
        <Card className="border border-[#e0e0e0] bg-white shadow-sm">
          <Card.Body className="p-5">
            <div className="flex gap-3">
              <div className="relative h-11 w-11 shrink-0" aria-hidden>
                <MessageCircle
                  className="absolute left-0 top-0 h-8 w-8 text-[#0a66c2]"
                  strokeWidth={1.75}
                  fill="none"
                />
                <MessageCircle
                  className="absolute bottom-0 right-0 h-[22px] w-[22px] text-[#e16737]"
                  strokeWidth={1.75}
                  fill="none"
                />
              </div>
              <div className="min-w-0 pt-0.5">
                <p className="text-[15px] font-semibold leading-tight text-[#1f1f1f]">Chat with support</p>
                <p className="mt-1 text-xs font-semibold text-[#057642]">Online now</p>
              </div>
            </div>
            <button
              type="button"
              className="mt-5 w-full rounded-full border-2 border-[#0a66c2] bg-white py-2.5 text-sm font-semibold text-[#0a66c2] transition hover:bg-[#0a66c2]/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0a66c2] focus-visible:ring-offset-2"
              onClick={() => toast({ variant: 'info', title: 'Support chat is a UI placeholder.' })}
            >
              Start chat
            </button>
            <div className="mt-5 border-t border-[#e8e8e8] pt-4">
              <Link to="/help" className="text-sm font-semibold text-[#0a66c2] hover:underline">
                Help Center
              </Link>
            </div>
          </Card.Body>
        </Card>
      </aside>
    </PageContainer>
  )
}
