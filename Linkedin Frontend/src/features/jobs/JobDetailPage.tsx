import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { getJob } from '../../api/jobs'
import { JobDetail } from '../../components/jobs'
import { Card, Skeleton } from '../../components/ui'

export default function JobDetailPage(): JSX.Element {
  const { jobId = '' } = useParams()
  const query = useQuery({
    queryKey: ['job', jobId],
    queryFn: () => getJob(jobId),
    enabled: Boolean(jobId),
    staleTime: 30_000,
  })

  if (query.isLoading) {
    return <Card><Card.Body className="space-y-2 p-4"><Skeleton className="h-8 w-2/3" /><Skeleton variant="rect" className="h-56" /></Card.Body></Card>
  }

  if (!query.data) {
    return <Card><Card.Body>Job not found.</Card.Body></Card>
  }

  return <JobDetail job={query.data} emitViewed />
}
