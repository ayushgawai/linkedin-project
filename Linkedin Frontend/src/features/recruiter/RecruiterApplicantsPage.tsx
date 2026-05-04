import { useParams } from 'react-router-dom'
import { RecruiterApplicantsPanel } from './RecruiterApplicantsPanel'

/** Standalone applicants view (same shell as other recruiter pages). Prefer inline Manage jobs + `?applicants=` when possible. */
export default function RecruiterApplicantsPage(): JSX.Element {
  const { jobId = '' } = useParams()
  return <RecruiterApplicantsPanel jobId={jobId} mode="page" />
}
