import { CheckCircle2, MoreHorizontal, Pencil, Plus, XCircle } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ingestEvent } from '../../api/analytics'
import { updateMemberApplicationStatus } from '../../api/applications'
import { companyColorClass, companyInitials } from '../../lib/companyAvatarStyle'
import { timeAgoShort } from '../../lib/formatters'
import { useAuthStore } from '../../store/authStore'
import { useTrackerHiddenStore } from '../../store/trackerHiddenStore'
import { useTrackerNotesStore } from '../../store/trackerNotesStore'
import { cn } from '../../lib/cn'
import type { MemberApplication, MemberApplicationTab } from '../../types/tracker'
import { Dropdown, useToast } from '../../components/ui'
import { useActionToast } from '../../hooks/useActionToast'
import { ConfirmModal } from '../../components/ui/ConfirmModal'

export const JOB_TRACKER_PAGE_SIZE = 25

type JobTrackerRowProps = {
  app: MemberApplication
  tab: MemberApplicationTab
  onOpenNote: (applicationId: string) => void
  onOpenApplication: (app: MemberApplication) => void
  layout: 'table' | 'card'
}

function statusDetailParenthetical(job: MemberApplication['job']): string {
  if (job.reposted_at) {
    return `Reposted ${timeAgoShort(job.reposted_at)}`
  }
  if (job.listing_status === 'closed') {
    return 'No longer accepting applications'
  }
  return `Posted ${timeAgoShort(job.posted_at)}`
}

function workModeLabel(m: string): string {
  if (m === 'remote') {
    return 'Remote'
  }
  if (m === 'hybrid') {
    return 'Hybrid'
  }
  return 'On-site'
}

export function JobTrackerRow({ app, tab, onOpenNote, onOpenApplication, layout }: JobTrackerRowProps): JSX.Element {
  const user = useAuthStore((s) => s.user)
  const { toast } = useToast()
  const actionToast = useActionToast()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const note = useTrackerNotesStore((s) => s.notes[app.application_id] ?? '')
  const hide = useTrackerHiddenStore((s) => s.hide)
  const [confirmInterview, setConfirmInterview] = useState(false)
  const [confirmOffer, setConfirmOffer] = useState(false)
  const [confirmReject, setConfirmReject] = useState(false)
  const [rejectReason, setRejectReason] = useState('')

  const moveMutation = useMutation({
    mutationFn: async () => {
      if (!user) {
        throw new Error('Sign in required')
      }
      await updateMemberApplicationStatus(app.application_id, 'interview', undefined, user.member_id)
      try {
        await ingestEvent({
          event_type: 'application.status.changed',
          trace_id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          actor_id: user.member_id,
          entity: { entity_type: 'application', entity_id: app.application_id },
          idempotency_key: crypto.randomUUID(),
          metadata: { from_status: app.status, to_status: 'interview', changed_by: 'member' },
        })
      } catch {
        // analytics optional in local demo
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['my-applications', user?.member_id] })
      actionToast.interview(job.title)
      setConfirmInterview(false)
    },
    onError: () => {
      toast({ variant: 'error', title: 'Could not update status' })
    },
  })

  const rejectMutation = useMutation({
    mutationFn: async (reason: string) => {
      if (!user) {
        throw new Error('Sign in required')
      }
      const from = app.status
      await updateMemberApplicationStatus(app.application_id, 'rejected', reason || undefined, user.member_id)
      try {
        await ingestEvent({
          event_type: 'application.status.changed',
          trace_id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          actor_id: user.member_id,
          entity: { entity_type: 'application', entity_id: app.application_id },
          idempotency_key: crypto.randomUUID(),
          metadata: { from_status: from, to_status: 'rejected', changed_by: 'member' },
        })
      } catch {
        // optional
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['my-applications', user?.member_id] })
      actionToast.rejected(job.title)
      setConfirmReject(false)
      setRejectReason('')
    },
    onError: () => {
      toast({ variant: 'error', title: 'Could not update status' })
    },
  })

  const offerMutation = useMutation({
    mutationFn: async () => {
      if (!user) {
        throw new Error('Sign in required')
      }
      await updateMemberApplicationStatus(app.application_id, 'offer', undefined, user.member_id)
      try {
        await ingestEvent({
          event_type: 'application.status.changed',
          trace_id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          actor_id: user.member_id,
          entity: { entity_type: 'application', entity_id: app.application_id },
          idempotency_key: crypto.randomUUID(),
          metadata: { from_status: app.status, to_status: 'offer', changed_by: 'member' },
        })
      } catch {
        // analytics optional in local demo
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['my-applications', user?.member_id] })
      toast({ variant: 'success', title: `${job.title} moved to Offer` })
      setConfirmOffer(false)
    },
    onError: () => {
      toast({ variant: 'error', title: 'Could not update status' })
    },
  })

  const job = app.job
  const isVerifiedClosed = job.listing_status === 'closed'
  const offer = app.status === 'offer'

  const modals = (
    <>
      <ConfirmModal
        isOpen={confirmInterview}
        onClose={() => setConfirmInterview(false)}
        title="Move to Interview"
        message="Move this application to the Interview stage?"
        confirmLabel="Confirm"
        confirmVariant="primary"
        loading={moveMutation.isPending}
        onConfirm={() => moveMutation.mutate()}
      />
      <ConfirmModal
        isOpen={confirmOffer}
        onClose={() => setConfirmOffer(false)}
        title="Move to Offer"
        message="Move this application to the Offer stage?"
        confirmLabel="Confirm"
        confirmVariant="primary"
        loading={offerMutation.isPending}
        onConfirm={() => offerMutation.mutate()}
      />
      <ConfirmModal
        isOpen={confirmReject}
        onClose={() => setConfirmReject(false)}
        title="Mark as rejected"
        message="Mark this application as rejected?"
        confirmLabel="Confirm"
        confirmVariant="destructive"
        loading={rejectMutation.isPending}
        onConfirm={() => void rejectMutation.mutateAsync(rejectReason)}
      >
        <label className="block text-xs text-text-secondary" htmlFor={`rej-${app.application_id}`}>
          Optional reason
        </label>
        <textarea
          id={`rej-${app.application_id}`}
          className="mt-1 w-full rounded-md border border-border p-2 text-sm"
          rows={3}
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
        />
      </ConfirmModal>
    </>
  )

  const jobCol = (
    <div className="flex min-w-0 items-start gap-3">
      {job.company_logo_url ? (
        <img
          src={job.company_logo_url}
          alt=""
          className="h-12 w-12 shrink-0 rounded border border-border bg-white object-cover"
        />
      ) : (
        <div
          className={cn(
            'flex h-12 w-12 shrink-0 items-center justify-center rounded border border-border text-xs font-bold',
            companyColorClass(job.company_name),
          )}
        >
          {companyInitials(job.company_name)}
        </div>
      )}
      <div className="min-w-0 flex flex-col">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm font-semibold text-text-primary">{job.title}</span>
          {isVerifiedClosed ? <CheckCircle2 className="h-3.5 w-3.5 text-text-tertiary" aria-label="Closed listing" /> : null}
          {offer && tab === 'interview' ? (
            <span className="rounded-full bg-success/15 px-2 py-0.5 text-xs font-semibold text-success">Offer received!</span>
          ) : null}
        </div>
        <p className="text-xs text-text-secondary">
          {job.company_name} · {job.location} ({workModeLabel(job.work_mode)})
        </p>
        <p className="text-xs text-text-tertiary">
          Applied {timeAgoShort(app.applied_at)} ({statusDetailParenthetical(job)})
        </p>
      </div>
    </div>
  )

  const avatars = (
    <>
      {app.connection_avatar_urls.length === 0 ? null : (
        <div className="flex -space-x-2">
          {app.connection_avatar_urls.slice(0, 3).map((url, i) => (
            <span key={i} className="inline-block ring-2 ring-white">
              <img src={url} alt="" className="h-7 w-7 rounded-full object-cover" />
            </span>
          ))}
          {app.connection_avatar_urls.length > 3 ? (
            <span className="ml-1 self-center text-xs text-text-secondary">+{app.connection_avatar_urls.length - 3}</span>
          ) : null}
        </div>
      )}
    </>
  )

  const notesBlock = (
    <div
      className="flex min-w-0 cursor-pointer items-center justify-start gap-1 md:max-lg:justify-center"
      onClick={() => onOpenNote(app.application_id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpenNote(app.application_id)
        }
      }}
      role="button"
      tabIndex={0}
    >
      {note ? (
        <div className="group flex min-w-0 max-w-full items-center gap-1">
          <p className="line-clamp-1 min-w-0 text-xs text-text-secondary lg:max-w-[10rem]">{note}</p>
          <Pencil className="h-3.5 w-3.5 shrink-0 text-text-tertiary opacity-0 transition group-hover:opacity-100" aria-hidden />
        </div>
      ) : (
        <span className="inline-flex items-center gap-1 text-sm text-text-secondary transition hover:text-text-primary">
          <Plus className="h-3.5 w-3.5" aria-hidden />
          <span className="md:max-lg:hidden">Add note</span>
        </span>
      )}
    </div>
  )

  const moreMenuRejected = (
    <Dropdown.Root>
      <Dropdown.Trigger showEndChevron={false} className="!rounded-full !p-1.5 text-text-tertiary" aria-label="More">
        <MoreHorizontal className="h-4 w-4" />
      </Dropdown.Trigger>
      <Dropdown.Content>
        <Dropdown.Item onSelect={() => navigate(`/jobs/${app.job_id}`)}>View job posting</Dropdown.Item>
        <Dropdown.Item
          onSelect={() => {
            hide(app.application_id)
            toast({ variant: 'success', title: 'Removed from tracker' })
          }}
        >
          Remove from tracker
        </Dropdown.Item>
      </Dropdown.Content>
    </Dropdown.Root>
  )

  const moreMenuFull = (
    <Dropdown.Root>
      <Dropdown.Trigger showEndChevron={false} className="!rounded-full !p-1.5 text-text-tertiary" aria-label="More">
        <MoreHorizontal className="h-4 w-4" />
      </Dropdown.Trigger>
      <Dropdown.Content>
        <Dropdown.Item onSelect={() => navigate(`/jobs/${app.job_id}`)}>View job posting</Dropdown.Item>
        <Dropdown.Item onSelect={() => onOpenApplication(app)}>View application</Dropdown.Item>
        <Dropdown.Item
          onSelect={() => {
            hide(app.application_id)
            toast({ variant: 'success', title: 'Removed from tracker' })
          }}
        >
          Remove from tracker
        </Dropdown.Item>
      </Dropdown.Content>
    </Dropdown.Root>
  )

  const statusBlock = (
    <div className="flex flex-col items-end justify-center gap-1">
      {tab === 'applied' ? (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            className="text-sm font-semibold text-brand-primary hover:underline"
            onClick={() => setConfirmInterview(true)}
          >
            Move to Interview
          </button>
          <button
            type="button"
            className="rounded-full p-1 text-text-tertiary transition hover:text-danger"
            title="Mark as rejected"
            aria-label="Mark as rejected"
            onClick={() => setConfirmReject(true)}
          >
            <XCircle className="h-4 w-4" />
          </button>
          {moreMenuFull}
        </div>
      ) : null}
      {tab === 'interview' ? (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className="text-sm font-semibold text-success">In Interview</span>
          <button
            type="button"
            className="text-sm font-semibold text-brand-primary hover:underline"
            onClick={() => setConfirmOffer(true)}
          >
            Move to Offer
          </button>
          <button
            type="button"
            className="rounded-full p-1 text-text-tertiary transition hover:text-danger"
            title="Mark as rejected"
            aria-label="Mark as rejected"
            onClick={() => setConfirmReject(true)}
          >
            <XCircle className="h-4 w-4" />
          </button>
          {moreMenuFull}
        </div>
      ) : null}
      {tab === 'rejected' ? (
        <div className="flex items-center justify-end gap-2">
          <div className="text-right">
            <span className="inline-block rounded-full bg-danger/10 px-2 py-0.5 text-xs font-semibold text-danger">Rejected</span>
            <p className="text-xs text-text-tertiary">
              from {app.rejected_from === 'interview' ? 'Interview' : 'Applied'}
            </p>
          </div>
          {moreMenuRejected}
        </div>
      ) : null}
      {tab === 'offer' ? (
        <div className="flex items-center justify-end gap-2">
          <div className="text-right">
            <span className="inline-block rounded-full bg-success/15 px-2 py-0.5 text-xs font-semibold text-success">Offer</span>
          </div>
          <button
            type="button"
            className="rounded-full p-1 text-text-tertiary transition hover:text-danger"
            title="Mark as rejected"
            aria-label="Mark as rejected"
            onClick={() => setConfirmReject(true)}
          >
            <XCircle className="h-4 w-4" />
          </button>
          {moreMenuFull}
        </div>
      ) : null}
    </div>
  )

  if (layout === 'card') {
    return (
      <div className="rounded-lg border border-border bg-white p-4 shadow-sm">
        {jobCol}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">{statusBlock}</div>
        <div className="mt-2 border-t border-border pt-2">{notesBlock}</div>
        {modals}
      </div>
    )
  }

  return (
    <>
      <div className="grid grid-cols-12 gap-y-2 border-b border-border py-4 transition last:border-b-0 hover:bg-black/[0.02] lg:gap-x-2 lg:gap-y-0">
        <div className="col-span-12 lg:col-span-5">{jobCol}</div>
        <div className="col-span-12 hidden items-center lg:col-span-2 lg:flex">{avatars}</div>
        <div className="col-span-12 md:col-span-6 lg:col-span-2 lg:flex lg:items-center">{notesBlock}</div>
        <div className="col-span-12 flex items-center justify-end md:col-span-6 lg:col-span-3">{statusBlock}</div>
      </div>
      {modals}
    </>
  )
}
