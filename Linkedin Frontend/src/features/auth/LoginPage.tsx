import { zodResolver } from '@hookform/resolvers/zod'
import { EyeOff } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { USE_MOCKS } from '../../api/client'
import { login } from '../../api/profile'
import { Button, useToast } from '../../components/ui'
import { useGoogleSignIn } from '../../hooks/useGoogleSignIn'
import { useAuthStore } from '../../store/authStore'
import { useProfileStore } from '../../store/profileStore'
import { loginSchema, type LoginFormValues } from './schemas'
import linkedInLogo from '../../assets/linkedin-logo.png'
import googleLogo from '../../assets/google-logo.png'

export default function LoginPage(): JSX.Element {
  const navigate = useNavigate()
  const { toast } = useToast()
  const setAuth = useAuthStore((state) => state.setAuth)
  const user = useAuthStore((state) => state.user)
  const hydrateFromAuthMember = useProfileStore((state) => state.hydrateFromAuthMember)
  const [showPassword, setShowPassword] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: USE_MOCKS ? undefined : zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  })

  const googleSignIn = useGoogleSignIn()

  const mutation = useMutation({
    mutationFn: (values: LoginFormValues) => login(values.email, values.password),
    onSuccess: ({ token, user: authUser }) => {
      setAuth(token, authUser)
      // Match backend (including profile_photo_url) so own profile does not show a stale local-only photo.
      hydrateFromAuthMember(authUser)
      navigate(authUser.role === 'recruiter' ? '/recruiter' : '/feed')
    },
    onError: (error: { status?: number; message?: string }) => {
      if (error.status === 401) {
        toast({ variant: 'error', title: 'Wrong email or password. Please try again.' })
        return
      }
      toast({ variant: 'error', title: error.message ?? 'Unable to sign in right now.' })
    },
  })

  if (user) {
    return <Navigate to="/feed" replace />
  }

  const emailRegistration = register('email')
  const passwordRegistration = register('password')

  return (
    <div className="flex min-h-screen flex-col bg-[#f3f2ef]">
      <header className="px-8 pt-6">
        <Link to="/" aria-label="LinkedIn home">
          <img src={linkedInLogo} alt="LinkedIn" className="h-7 w-auto" />
        </Link>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-4 pb-10">
        <div className="w-full max-w-[320px] rounded-lg border border-[#e5e5e5] bg-white p-4 shadow-[0_1px_4px_rgba(0,0,0,0.08)]">
          <h1 className="text-[40px] font-semibold leading-tight text-[#1f1f1f]">Sign in</h1>

          <div className="mt-3 space-y-2">
            <button
              type="button"
              disabled={googleSignIn.isPending}
              onClick={() => googleSignIn.mutate()}
              className="flex h-9 w-full items-center justify-center gap-2 rounded-full border border-[#8c8c8c] text-[14px] font-medium text-[#404040] disabled:opacity-60"
            >
              <img src={googleLogo} alt="Google" className="h-4 w-4 object-contain" />
              {googleSignIn.isPending ? 'Opening Google…' : 'Continue with Google'}
            </button>
            <button type="button" className="flex h-9 w-full items-center justify-center gap-2 rounded-full border border-[#8c8c8c] text-[14px] font-medium text-[#404040]">
              <span className="text-[16px] text-black"></span>
              Sign in with Apple
            </button>
          </div>

          <p className="mt-3 text-[10px] leading-4 text-[#666]">
            By clicking Continue, you agree to LinkedIn&apos;s User Agreement, Privacy Policy, and Cookie Policy.
          </p>

          <div className="my-3 flex items-center gap-2 text-[#888]">
            <div className="h-px flex-1 bg-[#d9d9d9]" />
            <span className="text-[11px]">or</span>
            <div className="h-px flex-1 bg-[#d9d9d9]" />
          </div>

          <form className="space-y-2" onSubmit={handleSubmit((values) => mutation.mutate(values))}>
            <input
              className="h-10 w-full rounded border border-[#8f8f8f] px-3 text-[14px] outline-none focus:border-[#0a66c2]"
              placeholder="Email or phone"
              autoFocus
              {...emailRegistration}
              ref={emailRegistration.ref}
            />
            {errors.email?.message ? <p className="text-[11px] text-red-600">{errors.email.message}</p> : null}

            <div className="relative">
              <input
                className="h-10 w-full rounded border border-[#8f8f8f] px-3 pr-14 text-[14px] outline-none focus:border-[#0a66c2]"
                placeholder="Password"
                type={showPassword ? 'text' : 'password'}
                {...passwordRegistration}
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[12px] font-semibold text-[#0a66c2]"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="h-4 w-4" aria-hidden /> : 'Show'}
              </button>
            </div>
            {errors.password?.message ? <p className="text-[11px] text-red-600">{errors.password.message}</p> : null}

            <a href="#" className="block text-[12px] font-semibold text-[#0a66c2] hover:underline">Forgot password?</a>

            <label className="flex items-center gap-2 text-[12px] text-[#444]">
              <input type="checkbox" className="h-3.5 w-3.5 accent-[#0a66c2]" defaultChecked />
              Keep me logged in
            </label>

            <Button type="submit" fullWidth className="h-10 rounded-full text-[14px]" loading={mutation.isPending}>
              {mutation.isPending ? 'Signing in...' : 'Sign in'}
            </Button>
          </form>
        </div>

        <p className="mt-5 text-center text-[14px] text-[#444]">
          New to LinkedIn?{' '}
          <Link to="/signup" className="font-semibold text-[#0a66c2] hover:underline">
            Join now
          </Link>
        </p>
      </main>

      <footer className="px-4 pb-4">
        <div className="mx-auto flex w-full max-w-[1000px] flex-wrap items-center justify-center gap-x-3 gap-y-2 text-[11px] text-[#666]">
          <span className="font-semibold text-[#1f1f1f]">LinkedIn</span>
          <span>© 2026</span>
          <span>User Agreement</span>
          <span>Privacy Policy</span>
          <span>Your California Privacy Choices</span>
          <span>Community Guidelines</span>
          <span>Cookie Policy</span>
          <span>Copyright Policy</span>
          <span>Send Feedback</span>
          <span>Language</span>
        </div>
      </footer>
    </div>
  )
}
