import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Share2, MoreHorizontal } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { closeJob, incrementJobViews } from '../../api/jobs'
import type { JobRecord } from '../../types/jobs'
import { useAuthStore } from '../../store/authStore'
import { useSavedJobsStore } from '../../store/savedJobsStore'
import { Button, Card, ConfirmModal, Dropdown, IconButton } from '../ui'
import { useToast } from '../ui/Toast'
import { ApplyModal } from './ApplyModal'

type JobDetailProps = {
  job: JobRecord
  emitViewed?: boolean
}

export function JobDetail({ job, emitViewed = false }: JobDetailProps): JSX.Element {
  const user = useAuthStore((state) => state.user)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const isOwner = Boolean(user?.member_id && job.recruiter_id === user.member_id)

  const isSaved = useSavedJobsStore((s) => s.isSaved(job.job_id))
  const saveJob = useSavedJobsStore((s) => s.save)
  const removeSavedJob = useSavedJobsStore((s) => s.remove)
  const [applyOpen, setApplyOpen] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [localViews, setLocalViews] = useState(job.views_count)

  const deleteMutation = useMutation({
    mutationFn: () => closeJob(job.job_id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['jobs-discovery'] })
      await queryClient.invalidateQueries({ queryKey: ['jobs-search'] })
      await queryClient.invalidateQueries({ queryKey: ['recruiter-jobs'] })
      await queryClient.invalidateQueries({ queryKey: ['recruiter-jobs-activity'] })
      await queryClient.invalidateQueries({ queryKey: ['job', job.job_id] })
      toast({ variant: 'success', title: 'Job removed', description: `${job.title} is no longer posted.` })
      navigate('/job-posting-activity')
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

  useEffect(() => {
    setLocalViews(job.views_count)
  }, [job.views_count])

  useEffect(() => {
    if (!emitViewed || !user) return
    void incrementJobViews(job.job_id, user.member_id)
    setLocalViews((prev) => prev + 1)
  }, [emitViewed, job.job_id, user])

  const [expanded, setExpanded] = useState(false)

  const postedLabel = (() => {
    const s = job.posted_time_ago
    if (!s) return 'Recently'
    if (s === 'Just now' || s === 'now') return 'Just now'
    if (/\bago\b/i.test(s)) return s
    return `${s} ago`
  })()

  return (
    <div className="space-y-3">
      <Card>
        <Card.Body className="space-y-3 p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-16 w-16 items-center justify-center rounded-md border border-[#ebe9e6] bg-[#f3f2ef] text-xl font-semibold text-[#0a66c2]">
              {job.company_name.slice(0, 1).toUpperCase()}
            </div>
            <div className="flex-1">
              <h1 className="text-2xl font-semibold text-text-primary">{job.title}</h1>
              <p className="text-sm text-text-secondary">{job.company_name}</p>
              <p className="text-xs text-text-tertiary">
                {job.location} · {job.work_mode} · {postedLabel} · {job.applicants_count} applicants
              </p>
            </div>
          </div>
          <p className="text-sm text-text-secondary">{job.applicants_count} applicants • {localViews} views</p>
          <div className="flex flex-wrap items-center gap-2">
            {isOwner ? (
              <Button variant="secondary" onClick={() => navigate(`/jobs/${job.job_id}/applicants`)}>
                View applicants
              </Button>
            ) : (
              <Button onClick={() => setApplyOpen(true)}>Easy Apply</Button>
            )}
            <Button
              variant="secondary"
              onClick={() => {
                if (isSaved) removeSavedJob(job.job_id)
                else saveJob(job)
              }}
            >
              {isSaved ? 'Saved' : 'Save'}
            </Button>
            <IconButton label="Share job" icon={<Share2 className="h-4 w-4" />} />
            {isOwner ? (
              <Dropdown.Root>
                <Dropdown.Trigger showEndChevron={false} className="inline-flex h-9 w-9 items-center justify-center rounded-full text-text-secondary hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2">
                  <MoreHorizontal className="h-4 w-4" aria-hidden />
                  <span className="sr-only">More job options</span>
                </Dropdown.Trigger>
                <Dropdown.Content className="min-w-[10rem]">
                  <Dropdown.Item className="font-medium text-text-primary" onSelect={() => navigate(`/jobs/post/${job.job_id}/edit`)}>
                    Edit job
                  </Dropdown.Item>
                  <Dropdown.Item
                    className="font-medium text-text-primary"
                    onSelect={() => navigate(`/jobs/${job.job_id}/applicants`)}
                  >
                    View applicants
                  </Dropdown.Item>
                  <Dropdown.Item className="font-medium text-danger" onSelect={() => setDeleteConfirmOpen(true)}>
                    Delete job
                  </Dropdown.Item>
                </Dropdown.Content>
              </Dropdown.Root>
            ) : (
              <IconButton label="More options" icon={<MoreHorizontal className="h-4 w-4" />} />
            )}
          </div>
        </Card.Body>
      </Card>

      <Card><Card.Body className="p-4 text-sm text-text-secondary">{job.connections_count} connections work here • 24 alumni from your school</Card.Body></Card>

      <Card>
        <Card.Header><h2 className="text-lg font-semibold">About the job</h2></Card.Header>
        <Card.Body>
          <p className={expanded ? 'text-sm text-text-primary' : 'text-sm text-text-primary [display:-webkit-box] [-webkit-line-clamp:6] [-webkit-box-orient:vertical] overflow-hidden'}>{job.description}</p>
          <button type="button" className="mt-1 text-xs font-semibold text-text-secondary hover:text-text-primary" onClick={() => setExpanded((prev) => !prev)}>
            {expanded ? 'Show less' : 'Show more'}
          </button>
        </Card.Body>
      </Card>

      <Card>
        <Card.Header><h2 className="text-lg font-semibold">Skills</h2></Card.Header>
        <Card.Body className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {job.skills_required.map((skill) => (
              <span key={skill} className="rounded-full border border-[#0a66c2]/40 bg-[#0a66c2]/[0.08] px-3 py-1 text-xs font-semibold text-[#0a66c2]">
                {skill}
              </span>
            ))}
          </div>
          <Button variant="secondary">See how your profile matches</Button>
        </Card.Body>
      </Card>

      <Card>
        <Card.Header><h2 className="text-lg font-semibold">Company</h2></Card.Header>
        <Card.Body className="space-y-1 text-sm">
          <p className="font-semibold text-text-primary">{job.company_name}</p>
          <p className="text-text-secondary">{job.industry} • {job.company_size}</p>
          <p className="text-text-secondary">{job.followers_count} followers</p>
          <p className="text-text-secondary">{job.company_about}</p>
          <Button size="sm" variant="secondary" className="mt-2">Follow</Button>
        </Card.Body>
      </Card>

      <ApplyModal isOpen={applyOpen} onClose={() => setApplyOpen(false)} job={job} />

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
    </div>
  )
}
