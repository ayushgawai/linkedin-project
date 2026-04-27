import { Bookmark, X } from 'lucide-react'
import { memo, type ReactNode } from 'react'
import { cn } from '../../lib/cn'
import type { JobRecord } from '../../types/jobs'
import { Badge, Button } from '../ui'

type JobListItemProps = {
  job: JobRecord
  selected?: boolean
  onClick: () => void
  saved?: boolean
  onSaveToggle?: () => void
  /** When set, shows a dismiss control below the save button that removes the row from the list (client-side). */
  onDismiss?: () => void
  /** Extra controls in the top-right column (e.g. owner ⋯ menu); row `onClick` is not fired when these are used. */
  trailingMenu?: ReactNode
}

function JobListItemComponent({ job, selected = false, onClick, saved = false, onSaveToggle, onDismiss, trailingMenu }: JobListItemProps): JSX.Element {
  const companyName = (job.company_name ?? '').trim() || 'Company'
  return (
    <article
      className={cn(
        'cursor-pointer rounded-lg border border-[#e0e0e0] bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition hover:border-[#d0d0d0] hover:bg-[#fafafa]',
        selected && 'border-[#0a66c2] ring-1 ring-[#0a66c2]/30',
      )}
      onClick={onClick}
    >
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-[#ebe9e6] bg-[#f3f2ef] text-lg font-semibold text-[#0a66c2]">
          {companyName.slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1 pr-1">
          <h3 className="line-clamp-2 text-[15px] font-semibold leading-snug text-[#1f1f1f]">{job.title}</h3>
          <p className="mt-0.5 text-sm text-[#666]">{companyName}</p>
          <p className="mt-0.5 text-xs text-[#666]/90">
            {job.location} · {job.posted_time_ago}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-[#666]">
            <span>{job.views_count} views</span>
            {job.easy_apply ? (
              <span className="font-semibold text-[#0a66c2]">Easy Apply</span>
            ) : (
              <Badge variant="neutral">Apply on company site</Badge>
            )}
          </div>
        </div>
        <div className="flex w-9 shrink-0 flex-col items-center gap-0.5">
          {trailingMenu ? (
            <div className="flex w-full shrink-0 justify-center" onClick={(event) => event.stopPropagation()}>
              {trailingMenu}
            </div>
          ) : null}
          <Button
            variant="tertiary"
            square
            className="h-9 w-9 shrink-0 rounded-full p-0 text-[#0a66c2] hover:bg-[#0a66c2]/10"
            onClick={(event) => {
              event.stopPropagation()
              onSaveToggle?.()
            }}
            aria-label={saved ? 'Unsave job' : 'Save job'}
          >
            <Bookmark className={cn('h-[18px] w-[18px]', saved && 'fill-[#0a66c2] text-[#0a66c2]')} strokeWidth={saved ? 0 : 2} />
          </Button>
          {onDismiss ? (
            <button
              type="button"
              className="flex h-9 w-9 items-center justify-center rounded-full text-[#666] transition hover:bg-black/[0.08] hover:text-[#1f1f1f]"
              aria-label="Remove from results"
              onClick={(event) => {
                event.stopPropagation()
                onDismiss()
              }}
            >
              <X className="h-4 w-4" strokeWidth={2} aria-hidden />
            </button>
          ) : null}
        </div>
      </div>
    </article>
  )
}

export const JobListItem = memo(JobListItemComponent)
