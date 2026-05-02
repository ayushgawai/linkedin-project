import { Link } from 'react-router-dom'
import { Briefcase } from 'lucide-react'
import { Button, Card } from '../../components/ui'

type RecruiterAccessNoticeProps = {
  /** Shown when the user opened a hiring URL (e.g. post job) vs the recruiter workspace. */
  variant?: 'posting' | 'workspace' | 'hub'
}

export function RecruiterAccessNotice({ variant = 'posting' }: RecruiterAccessNoticeProps): JSX.Element {
  const isWorkspace = variant === 'workspace'
  const isHub = variant === 'hub'
  const title = isWorkspace ? 'Recruiter workspace' : isHub ? 'Job posting activity is for recruiter accounts' : 'Hiring tools need a recruiter account'
  const description = isWorkspace
    ? 'The recruiter dashboard, AI Copilot for hiring, and team job tools are available when your account is enabled as a recruiter. You can still search and apply to jobs as a member.'
    : isHub
      ? 'Posted jobs, hiring stats, and post management live here for recruiter-enabled accounts. You can still use Job search and Job tracker as a member.'
      : 'Posting jobs and managing applicants are limited to recruiter accounts. Your member profile can still search roles, save listings, and track applications.'

  return (
    <div className="mx-auto w-full max-w-lg px-4 py-10">
      <Card>
        <Card.Body className="space-y-4 p-6 sm:p-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-border bg-black/[0.03]">
            <Briefcase className="h-6 w-6 text-brand-primary" strokeWidth={1.75} aria-hidden />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-text-primary">{title}</h1>
            <p className="mt-2 text-sm leading-relaxed text-text-secondary">{description}</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Button asChild>
              <Link to="/jobs/search">Search jobs by location</Link>
            </Button>
            <Button variant="secondary" asChild>
              <Link to="/feed">Back to home</Link>
            </Button>
          </div>
        </Card.Body>
      </Card>
    </div>
  )
}
