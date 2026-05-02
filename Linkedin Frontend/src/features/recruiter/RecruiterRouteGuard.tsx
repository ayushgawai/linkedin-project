import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'

export function RecruiterRouteGuard({ children }: { children: JSX.Element }): JSX.Element {
  const user = useAuthStore((state) => state.user)

  if (!user) {
    return <Navigate to="/login" replace />
  }

  if (user.role !== 'recruiter') {
    return <Navigate to="/jobs" replace state={{ recruiterAccessDenied: true }} />
  }

  return children
}
