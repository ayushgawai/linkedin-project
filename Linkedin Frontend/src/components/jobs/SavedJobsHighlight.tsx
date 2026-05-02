import { Bookmark } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { useSavedJobsStore } from '../../store/savedJobsStore'
import { Card } from '../ui'
import { JobListItem } from './JobListItem'

type SavedJobsHighlightProps = {
  /** Max rows before relying on “View all”. */
  maxItems?: number
  className?: string
}

export function SavedJobsHighlight({ maxItems = 5, className }: SavedJobsHighlightProps): JSX.Element {
  const navigate = useNavigate()
  const entries = useSavedJobsStore((s) => s.entries)
  const removeSavedJob = useSavedJobsStore((s) => s.remove)
  const slice = entries.slice(0, maxItems)

  if (entries.length === 0) {
    return (
      <Card className={className}>
        <Card.Header>
          <div className="flex items-center gap-2">
            <Bookmark className="h-5 w-5 shrink-0 text-brand-primary" aria-hidden />
            <h2 className="text-lg font-semibold">Saved jobs</h2>
          </div>
        </Card.Header>
        <Card.Body className="space-y-2">
          <p className="text-sm text-text-secondary">
            Save roles with the bookmark on any listing — they show up here, on job search, and in the tracker.
          </p>
          <Link to="/saved?view=jobs" className="inline-block text-sm font-semibold text-brand-primary hover:underline">
            Open saved items
          </Link>
        </Card.Body>
      </Card>
    )
  }

  return (
    <Card className={className}>
      <Card.Header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Bookmark className="h-5 w-5 shrink-0 text-brand-primary" aria-hidden />
          <h2 className="text-lg font-semibold">Saved jobs</h2>
          <span className="rounded-full bg-black/5 px-2 py-0.5 text-xs font-semibold tabular-nums text-text-secondary">
            {entries.length}
          </span>
        </div>
        <Link to="/saved?view=jobs" className="shrink-0 text-sm font-semibold text-brand-primary hover:underline">
          View all
        </Link>
      </Card.Header>
      <Card.Body className="space-y-2 p-3 pt-0">
        {slice.map(({ job }) => (
          <JobListItem
            key={job.job_id}
            job={job}
            saved
            onClick={() => navigate(`/jobs/${job.job_id}`)}
            onSaveToggle={() => removeSavedJob(job.job_id)}
          />
        ))}
      </Card.Body>
    </Card>
  )
}
