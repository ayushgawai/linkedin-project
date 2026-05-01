import { Bookmark } from 'lucide-react'
import { useActionToast } from '../../hooks/useActionToast'
import { cn } from '../../lib/cn'
import type { JobRecord } from '../../types/jobs'
import { useSavedExternalJobsStore } from '../../store/savedExternalJobsStore'
import { Avatar, Badge } from '../ui'

type JobMiniCardProps = {
  job: JobRecord
  saved: boolean
  onSaveToggle: () => void
  onOpen: () => void
}

export function JobMiniCard({ job, saved, onSaveToggle, onOpen }: JobMiniCardProps): JSX.Element {
  const actionToast = useActionToast()
  const extSaved = useSavedExternalJobsStore((s) => s.savedIds.includes(job.job_id))
  const extToggle = useSavedExternalJobsStore((s) => s.toggle)
  const isExternal = job.is_external === true
  const savedState = isExternal ? extSaved : saved
  const companyName = (job.company_name ?? '').trim() || 'Company'

  function handleOpen(): void {
    if (isExternal && job.external_url) {
      window.open(job.external_url, '_blank', 'noopener,noreferrer')
      return
    }
    onOpen()
  }

  function handleSave(e: React.MouseEvent): void {
    e.stopPropagation()
    if (isExternal) {
      const willSave = !extSaved
      extToggle(job.job_id)
      if (willSave) {
        actionToast.jobSaved(job.title)
      }
      return
    }
    onSaveToggle()
  }

  return (
    <article className="w-[300px] shrink-0 rounded-lg border border-border bg-surface-raised p-3">
      <div className="flex items-start justify-between">
        {job.company_logo_url ? (
          <img
            src={job.company_logo_url}
            alt=""
            className="h-12 w-12 shrink-0 rounded-md object-contain"
            loading="lazy"
          />
        ) : (
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-surface text-brand-primary">
            {companyName.slice(0, 1)}
          </div>
        )}
        <button type="button" onClick={handleSave} className="rounded-full p-1.5 hover:bg-black/5" aria-label="Save job">
          <Bookmark className={cn('h-4 w-4 text-text-secondary', savedState && 'fill-brand-primary text-brand-primary')} />
        </button>
      </div>
      <button type="button" onClick={handleOpen} className="mt-2 text-left">
        <h3 className="line-clamp-2 text-sm font-semibold text-text-primary">{job.title}</h3>
      </button>
      <p className="text-sm text-text-secondary">{companyName}</p>
      <p className="text-xs text-text-tertiary">
        {job.location} • {job.work_mode}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {isExternal ? (
          <>
            <Badge variant="neutral" className="text-[10px] font-semibold text-text-tertiary">
              External
            </Badge>
            {job.work_mode === 'remote' || job.work_mode === 'hybrid' ? (
              <Badge variant="neutral" className="text-[10px]">
                Remote
              </Badge>
            ) : null}
          </>
        ) : null}
        {!isExternal && job.promoted ? <Badge variant="neutral">Promoted</Badge> : null}
        {!isExternal && job.easy_apply ? <Badge variant="brand">Easy Apply</Badge> : null}
      </div>
      {isExternal ? (
        <a
          href={job.external_url}
          className="mt-2 block text-xs font-semibold text-brand-primary hover:underline"
          rel="noopener noreferrer"
          target="_blank"
          onClick={(e) => e.stopPropagation()}
        >
          Apply on company site
        </a>
      ) : null}
      {!isExternal && job.connections_count > 0 ? (
        <div className="mt-2 flex items-center gap-2 text-xs text-text-secondary">
          <div className="flex -space-x-1">
            <Avatar size="xs" name="A" />
            <Avatar size="xs" name="B" />
            <Avatar size="xs" name="C" />
          </div>
          {job.connections_count} connections
        </div>
      ) : null}
      <p className="mt-2 text-xs text-text-tertiary">
        {/ago/i.test(job.posted_time_ago) ? job.posted_time_ago : `${job.posted_time_ago} ago`}
      </p>
    </article>
  )
}
