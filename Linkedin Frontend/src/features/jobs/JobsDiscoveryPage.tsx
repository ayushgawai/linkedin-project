import { useInfiniteQuery, useMutation } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ChevronRight, LocateFixed, Target, X } from 'lucide-react'
import { listJobs } from '../../api/jobs'
import { ingestEvent } from '../../api/analytics'
import { JobListItem } from '../../components/jobs'
import { RailFooter } from '../../components/layout/RailFooter'
import { Button, Card, Input, Skeleton } from '../../components/ui'
import { useActionToast } from '../../hooks/useActionToast'
import { useAuthStore } from '../../store/authStore'
import { useSavedJobsStore } from '../../store/savedJobsStore'
import { cn } from '../../lib/cn'

const LOCATION_SUGGESTIONS = ['San Jose, CA', 'San Francisco, CA', 'New York, NY', 'Austin, TX', 'Remote']

export default function JobsDiscoveryPage(): JSX.Element {
  const navigate = useNavigate()
  const location = useLocation()
  const actionToast = useActionToast()
  const user = useAuthStore((state) => state.user)
  const savedEntries = useSavedJobsStore((s) => s.entries)
  const saveJob = useSavedJobsStore((s) => s.save)
  const removeSavedJob = useSavedJobsStore((s) => s.remove)
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(() => new Set())
  const [locationDraft, setLocationDraft] = useState('')
  const [locationFilter, setLocationFilter] = useState('')
  const [remoteOnly, setRemoteOnly] = useState(false)
  const [recruiterBannerDismissed, setRecruiterBannerDismissed] = useState(false)

  const showRecruiterBanner =
    !recruiterBannerDismissed && Boolean((location.state as { recruiterAccessDenied?: boolean } | null)?.recruiterAccessDenied)

  useEffect(() => {
    const t = window.setTimeout(() => setLocationFilter(locationDraft.trim()), 320)
    return () => window.clearTimeout(t)
  }, [locationDraft])

  useEffect(() => {
    setDismissedIds(new Set())
  }, [locationFilter, remoteOnly])

  const query = useInfiniteQuery({
    queryKey: ['jobs-discovery', locationFilter, remoteOnly],
    queryFn: ({ pageParam }) =>
      listJobs({
        page: pageParam,
        pageSize: 15,
        location: locationFilter || undefined,
        remote: remoteOnly || undefined,
      }),
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

  function dismissRecruiterBanner(): void {
    setRecruiterBannerDismissed(true)
    navigate(location.pathname + location.search, { replace: true, state: {} })
  }

  function applyLocationSuggestion(value: string): void {
    if (value === 'Remote') {
      setLocationDraft('')
      setLocationFilter('')
      setRemoteOnly(true)
      return
    }
    setLocationDraft(value)
    setLocationFilter(value)
    setRemoteOnly(false)
  }

  function clearLocationFilters(): void {
    setLocationDraft('')
    setLocationFilter('')
    setRemoteOnly(false)
  }

  const hasActiveFilters = Boolean(locationFilter) || remoteOnly

  return (
    <div className="grid grid-cols-12 gap-4 pb-6">
      <div className="col-span-12 space-y-3 lg:col-span-8">
        {showRecruiterBanner ? (
          <div className="flex items-start gap-3 rounded-lg border border-border bg-surface-raised p-4 text-sm">
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-text-primary">Recruiter tools need a recruiter account</p>
              <p className="mt-1 text-text-secondary">
                You were redirected from a hiring-only area. Post jobs and manage applicants from{' '}
                <Link to="/recruiter/jobs" className="font-medium text-brand-primary hover:underline">
                  Recruiter
                </Link>{' '}
                when your workspace is enabled, or keep browsing roles here.
              </p>
            </div>
            <button
              type="button"
              className="shrink-0 rounded p-1 text-text-secondary hover:bg-black/5 hover:text-text-primary"
              aria-label="Dismiss"
              onClick={() => dismissRecruiterBanner()}
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
        ) : null}

        <Card>
          <Card.Header className="space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h2 className="text-lg font-semibold">More jobs for you</h2>
              <Button variant="secondary" size="sm" asChild>
                <Link to="/jobs/search">Advanced search</Link>
              </Button>
            </div>
            <Input
              label="Filter by location"
              placeholder="City, state, or region"
              value={locationDraft}
              onChange={(e) => setLocationDraft(e.target.value)}
              rightIcon={<LocateFixed className="h-4 w-4" aria-hidden />}
            />
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-text-secondary">Quick picks</span>
              {LOCATION_SUGGESTIONS.map((label) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => applyLocationSuggestion(label)}
                  className={cn(
                    'rounded-full border px-3 py-1 text-xs font-medium transition',
                    (label === 'Remote' ? remoteOnly && !locationFilter : locationFilter === label && !remoteOnly)
                      ? 'border-brand-primary bg-brand-primary/10 text-brand-primary'
                      : 'border-border text-text-secondary hover:border-text-secondary hover:bg-black/[0.03]',
                  )}
                >
                  {label}
                </button>
              ))}
              {hasActiveFilters ? (
                <button type="button" onClick={() => clearLocationFilters()} className="text-xs font-semibold text-brand-primary hover:underline">
                  Clear filters
                </button>
              ) : null}
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-text-primary">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-border"
                checked={remoteOnly}
                onChange={(e) => setRemoteOnly(e.target.checked)}
              />
              Remote roles only
            </label>
          </Card.Header>
          <Card.Body className="space-y-2">
            {query.isLoading ? (
              <div className="space-y-2 p-1">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-20" />
                ))}
              </div>
            ) : visibleJobs.length === 0 && jobs.length > 0 ? (
              <p className="px-1 py-6 text-center text-sm text-text-secondary">No jobs left in this list — load more or refresh the page.</p>
            ) : visibleJobs.length === 0 ? (
              <p className="px-1 py-6 text-center text-sm text-text-secondary">
                {jobs.length === 0
                  ? hasActiveFilters
                    ? 'No jobs match this location or remote filter. Try another city or turn off Remote only.'
                    : 'No jobs to show yet.'
                  : 'No jobs left in this list — load more or refresh the page.'}
              </p>
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
          <Card.Header><h2 className="text-lg font-semibold">Search tips</h2></Card.Header>
          <Card.Body className="space-y-2 text-sm text-text-secondary">
            <p>Use location and Remote only on the left, or open Advanced search for keywords plus filters together.</p>
            <Link to="/jobs/search" className="inline-block font-semibold text-brand-primary hover:underline">
              Open job search
            </Link>
          </Card.Body>
        </Card>
        <RailFooter />
      </div>
    </div>
  )
}
