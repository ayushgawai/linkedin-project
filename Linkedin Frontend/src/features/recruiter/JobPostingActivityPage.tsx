import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bookmark, ClipboardCheck, MessageCircle, MoreHorizontal, PencilLine, X } from 'lucide-react'
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
            <Dropdown.Item className="font-medium text-text-primary" onSelect={() => navigate(`/jobs/post/${job.job_id}/edit`)}>
              Edit
            </Dropdown.Item>
            <Dropdown.Item
              className="font-medium text-text-primary"
              onSelect={() => navigate(`/jobs/${job.job_id}/applicants`)}
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

export default function JobPostingActivityPage(): JSX.Element {
  const user = useAuthStore((state) => state.user)
  const navigate = useNavigate()
  const [bannerDismissed, setBannerDismissed] = useState(false)
  const { toast } = useToast()
  const savedEntries = useSavedJobsStore((s) => s.entries)
  const saveJob = useSavedJobsStore((s) => s.save)
  const removeSavedJob = useSavedJobsStore((s) => s.remove)
  const savedIds = useMemo(() => savedEntries.map((e) => e.job.job_id), [savedEntries])

  const jobsQuery = useQuery({
    queryKey: ['recruiter-jobs-activity', user?.member_id],
    queryFn: () => listJobsByRecruiter(user!.member_id),
    enabled: Boolean(user?.member_id),
  })

  const jobs = useMemo(() => jobsQuery.data ?? [], [jobsQuery.data])
  const isEmpty = !jobsQuery.isLoading && jobs.length === 0

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
            </nav>
          </Card.Body>
        </Card>
      </aside>

      <main className="col-span-12 space-y-4 lg:col-span-6">
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
      </main>

      <aside className="col-span-12 flex flex-col gap-4 lg:col-span-3">
        <Card>
          <Card.Body className="p-4">
            <Link
              to="/jobs/post"
              className={cn(
                'inline-flex w-full items-center justify-center gap-2 rounded-full border-2 border-[#0a66c2] bg-white px-4 py-2.5 text-sm font-semibold text-[#0a66c2] shadow-sm transition hover:bg-[#0a66c2]/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0a66c2] focus-visible:ring-offset-2',
              )}
            >
              <PencilLine className="h-4 w-4 shrink-0" aria-hidden />
              Post a free job
            </Link>
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
