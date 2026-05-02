import { useInfiniteQuery, useMutation } from '@tanstack/react-query'
import { useCallback, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronRight, Target } from 'lucide-react'
import { listJobs } from '../../api/jobs'
import { ingestEvent } from '../../api/analytics'
import { JobListItem, SavedJobsHighlight } from '../../components/jobs'
import { RailFooter } from '../../components/layout/RailFooter'
import { Card, Skeleton } from '../../components/ui'
import { useActionToast } from '../../hooks/useActionToast'
import { useAuthStore } from '../../store/authStore'
import { useSavedJobsStore } from '../../store/savedJobsStore'

export default function JobsDiscoveryPage(): JSX.Element {
  const navigate = useNavigate()
  const actionToast = useActionToast()
  const user = useAuthStore((state) => state.user)
  const savedEntries = useSavedJobsStore((s) => s.entries)
  const saveJob = useSavedJobsStore((s) => s.save)
  const removeSavedJob = useSavedJobsStore((s) => s.remove)
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(() => new Set())

  const query = useInfiniteQuery({
    queryKey: ['jobs-discovery'],
    queryFn: ({ pageParam }) => listJobs({ page: pageParam, pageSize: 15 }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.has_more ? last.page + 1 : undefined),
    staleTime: 30_000,
  })

  const saveMutation = useMutation({
    mutationFn: async (jobId: string) => {
      if (!user) return
      await ingestEvent({
        event_type: 'job.saved',
        trace_id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        actor_id: user.member_id,
        entity: { entity_type: 'job', entity_id: jobId },
        idempotency_key: `job-saved-${user.member_id}-${jobId}`,
      })
    },
  })

  const jobs = query.data?.pages.flatMap((page) => page.jobs) ?? []
  const visibleJobs = useMemo(() => jobs.filter((job) => !dismissedIds.has(job.job_id)), [jobs, dismissedIds])
  const savedIds = savedEntries.map((entry) => entry.job.job_id)

  const dismissJob = useCallback((jobId: string) => {
    setDismissedIds((prev) => new Set(prev).add(jobId))
  }, [])

  function toggleSaved(jobId: string, jobTitle: string): void {
    const job = jobs.find((j) => j.job_id === jobId)
    if (!job) return
    if (savedIds.includes(jobId)) {
      removeSavedJob(jobId)
    } else {
      saveJob(job)
      queueMicrotask(() => actionToast.jobSaved(jobTitle))
    }
    saveMutation.mutate(jobId)
  }

  return (
    <div className="grid grid-cols-12 gap-4 pb-6">
      <div className="col-span-12 space-y-3 lg:col-span-8">
        <SavedJobsHighlight maxItems={5} />
        <Card>
          <Card.Header><h2 className="text-lg font-semibold">More jobs for you</h2></Card.Header>
          <Card.Body className="space-y-2">
            {query.isLoading ? (
              <div className="space-y-2 p-1">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-20" />
                ))}
              </div>
            ) : visibleJobs.length === 0 && jobs.length > 0 ? (
              <p className="px-1 py-6 text-center text-sm text-text-secondary">No jobs left in this list — load more or refresh the page.</p>
            ) : (
              visibleJobs.map((job) => (
                <JobListItem
                  key={job.job_id}
                  job={job}
                  onClick={() => navigate(`/jobs/${job.job_id}`)}
                  saved={savedIds.includes(job.job_id)}
                  onSaveToggle={() => toggleSaved(job.job_id, job.title)}
                  onDismiss={() => dismissJob(job.job_id)}
                />
              ))
            )}
            {query.hasNextPage ? (
              <button type="button" onClick={() => void query.fetchNextPage()} className="w-full rounded-md border border-border py-2 text-sm font-semibold text-text-secondary hover:bg-black/5">
                Load more
              </button>
            ) : null}
          </Card.Body>
        </Card>
      </div>

      <div className="col-span-12 space-y-3 lg:col-span-4">
        <Card>
          <Card.Body className="space-y-2">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border bg-white" aria-hidden>
                <Target className="h-5 w-5 text-text-primary" strokeWidth={2} />
              </div>
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-text-primary">Track your applications</h2>
                <p className="mt-0.5 text-sm text-text-secondary">See every role you have applied to and move stages in one place.</p>
              </div>
            </div>
            <Link
              to="/jobs/tracker"
              className="inline-flex w-full items-center justify-center gap-1 rounded-full border border-border py-2 text-sm font-semibold text-text-primary transition hover:border-text-primary hover:bg-black/[0.03]"
            >
              Open job tracker
              <ChevronRight className="h-4 w-4" aria-hidden />
            </Link>
          </Card.Body>
        </Card>
        <Card>
          <Card.Header><h2 className="text-lg font-semibold">Recent job searches</h2></Card.Header>
          <Card.Body className="space-y-2">
            {['SWE intern • San Jose', 'React engineer • Remote', 'Data engineer • Hybrid'].map((item) => (
              <div key={item} className="rounded-md bg-surface p-2 text-sm text-text-secondary">{item}</div>
            ))}
          </Card.Body>
        </Card>
        <RailFooter />
      </div>
    </div>
  )
}
