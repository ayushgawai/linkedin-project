import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import { RecruiterAccessNotice } from './RecruiterAccessNotice'

/**
 * Limits job posting and applicant management routes to recruiter accounts.
 * Member accounts see an explanation instead of a broken form or API errors.
 */
export function RecruiterJobFeatureGate({
  children,
  noticeVariant = 'posting',
}: {
  children: JSX.Element
  noticeVariant?: 'posting' | 'hub'
}): JSX.Element {
  const user = useAuthStore((state) => state.user)

  if (!user) {
    return <Navigate to="/login" replace />
  }

  if (user.role !== 'recruiter') {
    return <RecruiterAccessNotice variant={noticeVariant} />
  }

  return children
}
