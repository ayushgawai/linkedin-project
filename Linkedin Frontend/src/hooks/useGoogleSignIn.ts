import { useMutation } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { signInWithGoogle, MISSING_GOOGLE_CLIENT_ID } from '../api/googleAuth'
import { useAuthStore } from '../store/authStore'
import { useProfileStore } from '../store/profileStore'
import { useToast } from '../components/ui'

type Options = {
  /** Where to go after a successful sign-in. Default: `/feed`. */
  redirectTo?: string
}

export function useGoogleSignIn({ redirectTo = '/feed' }: Options = {}) {
  const navigate = useNavigate()
  const { toast } = useToast()
  const setAuth = useAuthStore((s) => s.setAuth)

  return useMutation({
    mutationFn: signInWithGoogle,
    onSuccess: ({ token, user }) => {
      setAuth(token, user)
      useProfileStore.getState().hydrateFromAuthMember(user)
      navigate(redirectTo)
    },
    onError: (error: Error) => {
      if (error.message === MISSING_GOOGLE_CLIENT_ID) {
        toast({
          variant: 'error',
          title: 'Add VITE_GOOGLE_CLIENT_ID in .env.local (Google Cloud OAuth 2.0 Web client ID).',
        })
        return
      }
      if (error.message === 'GOOGLE_OAUTH_USER_CANCELLED') {
        return
      }
      toast({ variant: 'error', title: error.message || 'Could not sign in with Google.' })
    },
  })
}
