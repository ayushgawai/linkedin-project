import { Navigate, useParams } from 'react-router-dom'
import { recruiterJobsApplicantsUrl } from '../../lib/recruiterPaths'

/** Sends legacy `/jobs/:jobId/applicants` (and similar) to Manage jobs with inline applicants. */
export default function RecruiterApplicantsRedirect(): JSX.Element {
  const { jobId = '' } = useParams()
  return <Navigate to={recruiterJobsApplicantsUrl(jobId)} replace />
}
