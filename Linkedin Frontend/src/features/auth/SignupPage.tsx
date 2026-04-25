import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { EyeOff } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { signup } from '../../api/profile'
import { Button, useToast } from '../../components/ui'
import { useGoogleSignIn } from '../../hooks/useGoogleSignIn'
import { useAuthStore } from '../../store/authStore'
import { useProfileStore } from '../../store/profileStore'
import { signupStep1Schema, signupStep2Schema, signupStep3Schema, type SignupStep1Values, type SignupStep2Values, type SignupStep3Values } from './schemas'
import linkedInLogo from '../../assets/linkedin-logo.png'
import googleLogo from '../../assets/google-logo.png'

export default function SignupPage(): JSX.Element {
  const navigate = useNavigate()
  const { toast } = useToast()
  const setAuth = useAuthStore((state) => state.setAuth)
  const user = useAuthStore((state) => state.user)
  const patchProfile = useProfileStore((state) => state.patchProfile)
  const updateBasicInfo = useProfileStore((state) => state.updateBasicInfo)
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [showPassword, setShowPassword] = useState(false)

  const form1 = useForm<SignupStep1Values>({
    resolver: zodResolver(signupStep1Schema),
    defaultValues: { email: '', password: '' },
  })
  const form2 = useForm<SignupStep2Values>({
    resolver: zodResolver(signupStep2Schema),
    defaultValues: { firstName: '', lastName: '' },
  })
  const form3 = useForm<SignupStep3Values>({
    resolver: zodResolver(signupStep3Schema),
    defaultValues: { location: '', headline: '', role: 'member' },
  })

  const googleSignIn = useGoogleSignIn()

  const mutation = useMutation({
    mutationFn: async (values: SignupStep3Values & { email: string; password: string; firstName: string; lastName: string }) => {
      const fullName = `${values.firstName} ${values.lastName}`
      return signup({
        email: values.email,
        password: values.password,
        full_name: fullName,
        location: values.location,
        headline: values.headline || null,
        role: values.role,
      })
    },
    onSuccess: ({ token, user: authUser }, variables) => {
      setAuth(token, authUser)
      navigate(variables.role === 'recruiter' ? '/recruiter' : '/feed')
    },
    onError: (error: { message?: string }) => {
      toast({ variant: 'error', title: error.message ?? 'Unable to complete signup right now.' })
    },
  })

  useEffect(() => {
    form3.setValue('role', 'member')
  }, [form3])

  if (user) {
    return <Navigate to="/feed" replace />
  }

  const emailRegistration = form1.register('email')
  const passwordRegistration = form1.register('password')

  return (
    <div className="flex min-h-screen flex-col bg-[#f3f2ef]">
      <header className="px-8 pt-6">
        <Link to="/" aria-label="LinkedIn home">
          <img src={linkedInLogo} alt="LinkedIn" className="h-7 w-auto" />
        </Link>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-4 pb-10">
        <h1 className="mb-2 text-center text-[32px] font-normal leading-tight text-[#1f1f1f] md:text-[50px]">Join LinkedIn now — it&apos;s free!</h1>
        <p className="mb-4 text-center text-sm text-[#666]">Step {step} of 3</p>
        <div className="w-full max-w-[360px] rounded-lg border border-[#e5e5e5] bg-white p-5 shadow-[0_1px_4px_rgba(0,0,0,0.08)]">
          {step === 1 ? (
            <form
              className="space-y-3"
              onSubmit={form1.handleSubmit((values) => {
                const member_id =
                  typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `member-${Date.now()}`
                patchProfile({ member_id, email: values.email })
                form2.setValue('firstName', '')
                form2.setValue('lastName', '')
                setStep(2)
              })}
            >
              <label className="block text-[12px] font-medium text-[#555]">Email</label>
              <input
                className="h-10 w-full rounded border border-[#8f8f8f] px-3 text-[14px] outline-none focus:border-[#0a66c2]"
                {...emailRegistration}
                ref={emailRegistration.ref}
              />
              {form1.formState.errors.email?.message ? (
                <p className="text-[11px] text-red-600">{form1.formState.errors.email.message}</p>
              ) : null}

              <label className="block text-[12px] font-medium text-[#555]">Password</label>
              <div className="relative">
                <input
                  className="h-10 w-full rounded border border-[#8f8f8f] px-3 pr-14 text-[14px] outline-none focus:border-[#0a66c2]"
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
              {form1.formState.errors.password?.message ? (
                <p className="text-[11px] text-red-600">{form1.formState.errors.password.message}</p>
              ) : null}

              <Button type="submit" fullWidth className="mt-2 h-10 rounded-full text-[15px]">
                Continue
              </Button>
            </form>
          ) : null}

          {step === 2 ? (
            <form
              className="space-y-3"
              onSubmit={form2.handleSubmit((values) => {
                updateBasicInfo({ first_name: values.firstName, last_name: values.lastName })
                setStep(3)
              })}
            >
              <label className="block text-[12px] font-medium text-[#555]">First name</label>
              <input
                className="h-10 w-full rounded border border-[#8f8f8f] px-3 text-[14px] outline-none focus:border-[#0a66c2]"
                {...form2.register('firstName')}
              />
              {form2.formState.errors.firstName?.message ? (
                <p className="text-[11px] text-red-600">{form2.formState.errors.firstName.message}</p>
              ) : null}

              <label className="block text-[12px] font-medium text-[#555]">Last name</label>
              <input
                className="h-10 w-full rounded border border-[#8f8f8f] px-3 text-[14px] outline-none focus:border-[#0a66c2]"
                {...form2.register('lastName')}
              />
              {form2.formState.errors.lastName?.message ? (
                <p className="text-[11px] text-red-600">{form2.formState.errors.lastName.message}</p>
              ) : null}

              <div className="flex gap-2 pt-1">
                <Button type="button" variant="secondary" className="h-10 flex-1 rounded-full" onClick={() => setStep(1)}>
                  Back
                </Button>
                <Button type="submit" className="h-10 flex-1 rounded-full">
                  Continue
                </Button>
              </div>
            </form>
          ) : null}

          {step === 3 ? (
            <form
              className="space-y-3"
              onSubmit={form3.handleSubmit((values) => {
                const email = useProfileStore.getState().profile.email || form1.getValues('email')
                const password = form1.getValues('password')
                const firstName = useProfileStore.getState().profile.first_name || form2.getValues('firstName')
                const lastName = useProfileStore.getState().profile.last_name || form2.getValues('lastName')
                updateBasicInfo({ location: values.location, headline: values.headline ?? '' })
                mutation.mutate({
                  ...values,
                  email,
                  password,
                  firstName,
                  lastName,
                })
              })}
            >
              <label className="block text-[12px] font-medium text-[#555]">Location</label>
              <input
                className="h-10 w-full rounded border border-[#8f8f8f] px-3 text-[14px] outline-none focus:border-[#0a66c2]"
                placeholder="City, State, Country"
                {...form3.register('location')}
              />
              {form3.formState.errors.location?.message ? (
                <p className="text-[11px] text-red-600">{form3.formState.errors.location.message}</p>
              ) : null}

              <label className="block text-[12px] font-medium text-[#555]">Headline (optional)</label>
              <input
                className="h-10 w-full rounded border border-[#8f8f8f] px-3 text-[14px] outline-none focus:border-[#0a66c2]"
                placeholder="Student, role, or goals"
                {...form3.register('headline')}
              />

              <label className="mt-2 block text-[12px] font-medium text-[#555]">Account type</label>
              <div className="flex gap-3 text-[13px]">
                <label className="flex items-center gap-2">
                  <input type="radio" value="member" {...form3.register('role')} className="accent-[#0a66c2]" />
                  Member
                </label>
                <label className="flex items-center gap-2">
                  <input type="radio" value="recruiter" {...form3.register('role')} className="accent-[#0a66c2]" />
                  Recruiter
                </label>
              </div>

              <p className="text-[10px] leading-4 text-[#666]">
                By clicking Agree & Join, you agree to the User Agreement and Privacy Policy.
              </p>

              <div className="flex gap-2 pt-1">
                <Button type="button" variant="secondary" className="h-10 flex-1 rounded-full" onClick={() => setStep(2)}>
                  Back
                </Button>
                <Button type="submit" className="h-10 flex-1 rounded-full" loading={mutation.isPending}>
                  Agree & Join
                </Button>
              </div>
            </form>
          ) : null}

          <div className="my-4 flex items-center gap-2 text-[#888]">
            <div className="h-px flex-1 bg-[#d9d9d9]" />
            <span className="text-[11px]">or</span>
            <div className="h-px flex-1 bg-[#d9d9d9]" />
          </div>

          <button
            type="button"
            disabled={googleSignIn.isPending}
            onClick={() => googleSignIn.mutate()}
            className="flex h-10 w-full items-center justify-center gap-2 rounded-full border border-[#8c8c8c] text-[14px] font-medium text-[#404040] disabled:opacity-60"
          >
            <img src={googleLogo} alt="Google" className="h-4 w-4 object-contain" />
            {googleSignIn.isPending ? 'Opening Google…' : 'Continue with Google'}
          </button>

          <p className="mt-6 text-center text-[14px] text-[#444]">
            Already on LinkedIn?{' '}
            <Link to="/login" className="font-semibold text-[#0a66c2] hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </main>

      <footer className="px-4 pb-4">
        <div className="mx-auto flex w-full max-w-[1000px] flex-wrap items-center justify-center gap-x-3 gap-y-2 text-[11px] text-[#666]">
          <span className="font-semibold text-[#1f1f1f]">LinkedIn</span>
          <span>© 2026</span>
          <span>About</span>
          <span>Accessibility</span>
        </div>
      </footer>
    </div>
  )
}
