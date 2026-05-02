import { useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { closeJob, listJobsByRecruiter } from '../../api/jobs'
import { Badge, Button, Card, Input, Select } from '../../components/ui'
import { useActionToast } from '../../hooks/useActionToast'
import { useAuthStore } from '../../store/authStore'

export default function RecruiterJobsPage(): JSX.Element {
  const actionToast = useActionToast()
  const user = useAuthStore((s) => s.user)
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('all')

  const recruiterId = (user?.recruiter_id || user?.member_id) ?? ''

  const jobsQuery = useQuery({
    queryKey: ['recruiter-jobs', recruiterId],
    queryFn: async () => listJobsByRecruiter(recruiterId, { page: 1, page_size: 100 }),
    enabled: Boolean(user) && Boolean(recruiterId),
  })

  const closeMutation = useMutation({ mutationFn: closeJob })

  const rows = useMemo(() => {
    return (jobsQuery.data ?? []).filter((job) => {
      const matchesQuery = job.title.toLowerCase().includes(query.toLowerCase())
      const matchesStatus = status === 'all' ? true : status === 'open' ? job.promoted || job.easy_apply : !job.promoted && !job.easy_apply
      return matchesQuery && matchesStatus
    })
  }, [jobsQuery.data, query, status])

  return (
    <Card>
      <Card.Header className="space-y-3">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Manage jobs</h1>
          <Button onClick={() => navigate('/jobs/post')}>Post a job</Button>
        </div>
        <div className="grid gap-2 md:grid-cols-3">
          <Input placeholder="Search jobs" value={query} onChange={(e) => setQuery(e.target.value)} />
          <Select variant="native" value={status} onValueChange={setStatus} options={[{ value: 'all', label: 'All statuses' }, { value: 'open', label: 'Open' }, { value: 'closed', label: 'Closed' }]} />
        </div>
      </Card.Header>
      <Card.Body className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="text-left text-text-secondary"><tr><th className="pb-2">Title</th><th className="pb-2">Location</th><th className="pb-2">Applicants</th><th className="pb-2">Views</th><th className="pb-2">Posted</th><th className="pb-2">Actions</th></tr></thead>
          <tbody>
            {rows.map((job) => (
              <tr key={job.job_id} className="border-t border-border">
                <td className="py-3"><div className="font-semibold text-text-primary">{job.title}</div><Badge variant={job.promoted || job.easy_apply ? 'success' : 'neutral'}>{job.promoted || job.easy_apply ? 'Open' : 'Closed'}</Badge></td>
                <td className="py-3 text-text-secondary">{job.location}</td>
                <td className="py-3"><Link to={`/jobs/${job.job_id}/applicants`} className="font-semibold text-brand-primary">{job.applicants_count}</Link></td>
                <td className="py-3 text-text-secondary">{job.views_count}</td>
                <td className="py-3 text-text-secondary">{job.posted_time_ago}</td>
                <td className="py-3"><div className="flex gap-2"><Button size="sm" variant="secondary" onClick={() => navigate(`/jobs/post/${job.job_id}/edit`)}>Edit</Button><Button
                  size="sm"
                  variant="tertiary"
                  onClick={() =>
                    closeMutation.mutate(job.job_id, {
                      onSuccess: () => actionToast.jobClosed(job.title),
                    })
                  }
                >
                  Close
                </Button><Button size="sm" variant="tertiary">Duplicate</Button><Button size="sm" variant="tertiary" onClick={() => navigate('/analytics')}>Analytics</Button></div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card.Body>
    </Card>
  )
}
