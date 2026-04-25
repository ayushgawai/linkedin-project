import { useQuery } from '@tanstack/react-query'
import {
  ArrowLeft,
  Briefcase,
  CalendarCheck,
  CheckCircle,
  ChevronRight,
  ThumbsDown,
  ThumbsUp,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { listMemberApplications } from '../../api/applications'
import { filterByDatePosted, type DatePostedOption } from '../../lib/datePostedFilter'
import { mapStatusToTab } from '../../lib/statusUtils'
import { useAuthStore } from '../../store/authStore'
import { useTrackerHiddenStore } from '../../store/trackerHiddenStore'
import { useTrackerNotesStore } from '../../store/trackerNotesStore'
import { cn } from '../../lib/cn'
import type { MemberApplication, MemberApplicationTab } from '../../types/tracker'
import { Card, EmptyState, Skeleton } from '../../components/ui'
import { ApplicationDetailModal } from './ApplicationDetailModal'
import { DatePostedFilter } from './DatePostedFilter'
import { JobTrackerRow, JOB_TRACKER_PAGE_SIZE } from './JobTrackerRow'
import { NoteModal } from './NoteModal'

const pillOn = 'bg-success text-white'
const pillOff = 'border border-border bg-transparent text-text-primary hover:border-text-primary hover:bg-black/[0.03]'

function TrackerSkeleton(): JSX.Element {
  return (
    <div className="space-y-0">
      {Array.from({ length: 10 }).map((_, i) => (
        <div
          key={i}
          className="grid grid-cols-12 gap-2 border-b border-border py-4"
        >
          <div className="col-span-12 flex gap-3 lg:col-span-5">
            <Skeleton className="h-12 w-12 rounded" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
          <div className="hidden lg:col-span-2 lg:block">
            <div className="flex -space-x-2">
              <Skeleton className="h-7 w-7 rounded-full" />
            </div>
          </div>
          <div className="col-span-6 lg:col-span-2">
            <Skeleton className="h-3 w-20" />
          </div>
          <div className="col-span-6 flex justify-end gap-1 lg:col-span-3">
            <Skeleton className="h-6 w-16" />
            <Skeleton className="h-6 w-6 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  )
}

export default function JobTrackerPage(): JSX.Element {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const hiddenSet = useTrackerHiddenStore((s) => s.hiddenApplicationIds)
  const noteMap = useTrackerNotesStore((s) => s.notes)
  const [tab, setTab] = useState<MemberApplicationTab>('applied')
  const [datePosted, setDatePosted] = useState<DatePostedOption>('all')
  const [dateDraft, setDateDraft] = useState<DatePostedOption>('all')
  const [page, setPage] = useState(1)
  const [noteForId, setNoteForId] = useState<string | null>(null)
  const [detailApp, setDetailApp] = useState<MemberApplication | null>(null)

  const q = useQuery({
    queryKey: ['my-applications', user?.member_id],
    queryFn: () => {
      if (!user) {
        return Promise.resolve([] as MemberApplication[])
      }
      return listMemberApplications(user.member_id)
    },
    enabled: Boolean(user),
  })

  const raw = q.data ?? []

  const applications = useMemo(() => {
    return raw
      .filter((a) => !hiddenSet.includes(a.application_id))
      .filter((a) => mapStatusToTab(a.status) === tab)
  }, [raw, tab, hiddenSet])

  const dateFiltered = useMemo(() => filterByDatePosted(applications, datePosted), [applications, datePosted])

  const totalPages = Math.max(1, Math.ceil(dateFiltered.length / JOB_TRACKER_PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pageItems = useMemo(() => {
    const start = (currentPage - 1) * JOB_TRACKER_PAGE_SIZE
    return dateFiltered.slice(start, start + JOB_TRACKER_PAGE_SIZE)
  }, [dateFiltered, currentPage])

  const counts = useMemo(() => {
    const visible = raw.filter((a) => !hiddenSet.includes(a.application_id))
    return {
      applied: visible.filter((a) => mapStatusToTab(a.status) === 'applied').length,
      interview: visible.filter((a) => mapStatusToTab(a.status) === 'interview').length,
      offer: visible.filter((a) => mapStatusToTab(a.status) === 'offer').length,
      rejected: visible.filter((a) => mapStatusToTab(a.status) === 'rejected').length,
    }
  }, [raw, hiddenSet])

  return (
    <div className="mx-auto w-full max-w-6xl pb-8">
      <div className="mb-1 flex items-center gap-3">
        <Link
          to="/jobs"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-text-primary transition hover:bg-black/5"
          aria-label="Back to jobs"
        >
          <ArrowLeft className="h-5 w-5" strokeWidth={2} aria-hidden />
        </Link>
        <h1 className="text-xl font-semibold tracking-tight text-text-primary">Job tracker</h1>
      </div>

      <div className="mb-6 mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Application status">
          {(
            [
              { id: 'applied' as const, label: 'Applied', c: counts.applied },
              { id: 'interview' as const, label: 'Interview', c: counts.interview },
              { id: 'offer' as const, label: 'Offer', c: counts.offer },
              { id: 'rejected' as const, label: 'Rejected', c: counts.rejected },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => {
                setTab(t.id)
                setPage(1)
              }}
              className={cn(
                'rounded-full px-4 py-1.5 text-sm font-semibold transition',
                tab === t.id ? pillOn : pillOff,
              )}
            >
              {t.label} · {t.c}
            </button>
          ))}
        </div>
        <DatePostedFilter
          draft={dateDraft}
          onDraftChange={setDateDraft}
          onApply={() => {
            setDatePosted(dateDraft)
            setPage(1)
          }}
          onClear={() => {
            setDateDraft('all')
            setDatePosted('all')
            setPage(1)
          }}
        />
      </div>

      <Card className="mb-0 overflow-hidden rounded-xl border border-border bg-white shadow-sm ring-1 ring-black/[0.04]">
        <Card.Body className="p-0">
          <div className="hidden grid-cols-12 gap-2 border-b border-border px-4 pb-2 pt-4 lg:grid">
            <div className="col-span-5 text-sm font-semibold text-text-secondary">Jobs</div>
            <div className="col-span-2 text-sm font-semibold text-text-secondary">Connections</div>
            <div className="col-span-2 text-sm font-semibold text-text-secondary">Notes</div>
            <div className="col-span-3 text-right text-sm font-semibold text-text-secondary">Status</div>
          </div>

          {q.isLoading ? (
            <div className="px-4">
              <TrackerSkeleton />
            </div>
          ) : pageItems.length === 0 ? (
            <div className="p-6">
              {tab === 'applied' ? (
                <EmptyState
                  icon={<Briefcase className="h-6 w-6" />}
                  title="No applications yet"
                  description="Start applying to jobs to track them here"
                  actionLabel="Search jobs"
                  onAction={() => navigate('/jobs')}
                />
              ) : null}
              {tab === 'interview' ? (
                <EmptyState
                  icon={<CalendarCheck className="h-6 w-6" />}
                  title="No interviews yet"
                  description="Applications that move to the interview stage will appear here"
                />
              ) : null}
              {tab === 'offer' ? (
                <EmptyState
                  icon={<CheckCircle className="h-6 w-6" />}
                  title="No offers yet"
                  description="Applications moved to Offer will appear here"
                />
              ) : null}
              {tab === 'rejected' ? (
                <EmptyState
                  icon={<CheckCircle className="h-6 w-6" />}
                  title="No rejections"
                  description="Keep going — no news is good news!"
                />
              ) : null}
            </div>
          ) : (
            <>
              <div className="hidden px-4 lg:block">
                {pageItems.map((app) => (
                  <JobTrackerRow
                    key={app.application_id}
                    app={app}
                    tab={tab}
                    layout="table"
                    onOpenNote={(id) => setNoteForId(id)}
                    onOpenApplication={(a) => setDetailApp(a)}
                  />
                ))}
              </div>
              <div className="space-y-3 p-4 lg:hidden">
                {pageItems.map((app) => (
                  <JobTrackerRow
                    key={app.application_id}
                    app={app}
                    tab={tab}
                    layout="card"
                    onOpenNote={(id) => setNoteForId(id)}
                    onOpenApplication={(a) => setDetailApp(a)}
                  />
                ))}
              </div>
            </>
          )}
        </Card.Body>
      </Card>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <button type="button" className="text-left text-sm text-text-secondary hover:text-text-primary">
          Not seeing some jobs?
        </button>
        {totalPages > 1 ? (
          <div className="flex items-center gap-1">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setPage(n)}
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-full text-sm',
                  n === currentPage ? 'bg-text-primary font-semibold text-white' : 'text-text-primary hover:bg-black/5',
                )}
              >
                {n}
              </button>
            ))}
            {currentPage < totalPages ? (
              <button
                type="button"
                className="ml-1 inline-flex items-center gap-0.5 text-sm font-semibold text-text-primary"
                onClick={() => setPage((p) => p + 1)}
              >
                Next
                <ChevronRight className="h-4 w-4" aria-hidden />
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="mt-4 flex w-full items-center justify-end gap-2 py-4">
        <span className="text-sm text-text-secondary">Is job tracker helpful?</span>
        <button
          type="button"
          className="rounded-full p-1.5 text-text-tertiary transition hover:text-success"
          aria-label="Thumbs up"
          onClick={() => {
            console.log('job tracker feedback: thumbs up')
          }}
        >
          <ThumbsUp className="h-[18px] w-[18px]" />
        </button>
        <button
          type="button"
          className="rounded-full p-1.5 text-text-tertiary transition hover:text-danger"
          aria-label="Thumbs down"
          onClick={() => {
            console.log('job tracker feedback: thumbs down')
          }}
        >
          <ThumbsDown className="h-[18px] w-[18px]" />
        </button>
      </div>

      <NoteModal
        isOpen={Boolean(noteForId)}
        onClose={() => setNoteForId(null)}
        applicationId={noteForId}
        initial={noteForId ? noteMap[noteForId] ?? '' : ''}
      />
      <ApplicationDetailModal isOpen={Boolean(detailApp)} onClose={() => setDetailApp(null)} app={detailApp} />
    </div>
  )
}
