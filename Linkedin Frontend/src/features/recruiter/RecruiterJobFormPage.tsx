import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CircleHelp, Sparkles } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Users } from 'lucide-react'
import { createJob, getJob, updateJob } from '../../api/jobs'
import { Button, Card, Input, Select, Textarea } from '../../components/ui'
import { useToast } from '../../components/ui/Toast'
import { cn } from '../../lib/cn'
import { useAuthStore } from '../../store/authStore'
import { useProfileStore } from '../../store/profileStore'

const workplaceOptions = [
  { value: 'onsite', label: 'On-site' },
  { value: 'remote', label: 'Remote' },
  { value: 'hybrid', label: 'Hybrid' },
]

const employmentOptions = [
  { value: 'full_time', label: 'Full-time' },
  { value: 'part_time', label: 'Part-time' },
  { value: 'contract', label: 'Contract' },
  { value: 'internship', label: 'Internship' },
  { value: 'temporary', label: 'Temporary' },
]

function capitalizeWord(word: string): string {
  const w = word.trim()
  if (!w) return ''
  return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
}

/** First name for “Hi, …” — uses profile when auth name is generic or ids match; then full_name; then email. */
function hiringGreetingFirstName(
  authUser: { member_id: string; full_name: string; email: string } | null,
  profile: { member_id: string; first_name: string },
): string {
  if (!authUser) return 'there'

  const profileFirst = profile.first_name?.trim()
  const fullToken = authUser.full_name?.trim().split(/\s+/)[0] ?? ''
  const genericAuth = /^(member|users?|demo|test|guest)$/i.test(fullToken)
  const idsMatch = Boolean(profile.member_id) && profile.member_id === authUser.member_id

  if (profileFirst && (idsMatch || genericAuth)) {
    return capitalizeWord(profileFirst)
  }
  if (fullToken && !genericAuth) {
    return capitalizeWord(fullToken)
  }
  const emailLocal = authUser.email?.split('@')[0]
  if (emailLocal) {
    const fromEmail = emailLocal.split(/[._+-]/).filter(Boolean)[0]
    if (fromEmail && !/^(user|demo|test|guest|noreply)$/i.test(fromEmail)) {
      return capitalizeWord(fromEmail)
    }
  }
  if (profileFirst) {
    return capitalizeWord(profileFirst)
  }
  return 'there'
}

function LabelWithHelp({ children, help }: { children: string; help: string }): JSX.Element {
  return (
    <div className="mb-1 flex items-center gap-1.5">
      <span className="text-sm font-medium text-[#1f1f1f]">{children}</span>
      <button
        type="button"
        className="rounded p-0.5 text-[#666] hover:bg-black/[0.05] hover:text-[#0a66c2]"
        aria-label={help}
        title={help}
      >
        <CircleHelp className="h-4 w-4" strokeWidth={1.75} aria-hidden />
      </button>
    </div>
  )
}

export default function RecruiterJobFormPage(): JSX.Element {
  const { jobId } = useParams()
  const isEdit = Boolean(jobId)
  const user = useAuthStore((s) => s.user)
  const profile = useProfileStore((s) => s.profile)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const [phase, setPhase] = useState(0)

  const [title, setTitle] = useState('')
  const [workplace, setWorkplace] = useState<string>('onsite')
  const [location, setLocation] = useState('')

  const [description, setDescription] = useState('')
  const [company, setCompany] = useState('Apex Labs')
  const [employmentType, setEmploymentType] = useState<string>('full_time')
  const [salaryRange, setSalaryRange] = useState('')

  const [skillInput, setSkillInput] = useState('')
  const [skills, setSkills] = useState<string[]>([])

  const existingQuery = useQuery({
    queryKey: ['job', jobId],
    queryFn: () => getJob(jobId!),
    enabled: isEdit && Boolean(jobId),
  })

  useEffect(() => {
    const job = existingQuery.data
    if (!job || !isEdit) return
    setTitle(job.title)
    setWorkplace(job.work_mode)
    setLocation(job.location)
    setDescription(job.description)
    setCompany(job.company_name)
    setEmploymentType(job.employment_type)
    setSkills([...job.skills_required])
    setSalaryRange(job.salary_range?.trim() ?? '')
  }, [existingQuery.data, isEdit])

  const greeting = useMemo(
    () => hiringGreetingFirstName(user ?? null, profile),
    [user, user?.full_name, user?.email, profile.member_id, profile.first_name],
  )

  const createMutation = useMutation({
    mutationFn: createJob,
    onSuccess: async (job) => {
      await queryClient.invalidateQueries({ queryKey: ['jobs-discovery'] })
      await queryClient.invalidateQueries({ queryKey: ['jobs-search'] })
      await queryClient.invalidateQueries({ queryKey: ['recruiter-jobs'] })
      await queryClient.invalidateQueries({ queryKey: ['recruiter-jobs-activity'] })
      await queryClient.invalidateQueries({ queryKey: ['job', job.job_id] })
      toast({ variant: 'success', title: 'Job posted', description: `${job.title} is live and visible in job search.` })
      navigate('/job-posting-activity')
    },
    onError: () => {
      toast({ variant: 'error', title: 'Could not post job', description: 'Please try again.' })
    },
  })

  const updateMutation = useMutation({
    mutationFn: updateJob,
    onSuccess: async (job) => {
      await queryClient.invalidateQueries({ queryKey: ['jobs-discovery'] })
      await queryClient.invalidateQueries({ queryKey: ['jobs-search'] })
      await queryClient.invalidateQueries({ queryKey: ['recruiter-jobs'] })
      await queryClient.invalidateQueries({ queryKey: ['recruiter-jobs-activity'] })
      await queryClient.invalidateQueries({ queryKey: ['job', job.job_id] })
      toast({ variant: 'success', title: 'Job updated' })
      navigate('/job-posting-activity')
    },
  })

  function addSkill(): void {
    const next = skillInput.trim()
    if (!next || skills.includes(next) || skills.length >= 15) return
    setSkills((p) => [...p, next])
    setSkillInput('')
  }

  function canContinuePhase0(): boolean {
    return title.trim().length > 1 && location.trim().length > 1
  }

  function canContinuePhase1(): boolean {
    return description.trim().length >= 24 && company.trim().length > 0
  }

  function submitCreate(): void {
    if (!user) return
    const recruiterId = user.recruiter_id || user.member_id
    createMutation.mutate({
      recruiter_id: recruiterId,
      title: title.trim(),
      description: description.trim(),
      location: location.trim(),
      company_name: company.trim(),
      work_mode: workplace as 'remote' | 'hybrid' | 'onsite',
      employment_type: employmentType as 'full_time' | 'part_time' | 'contract' | 'internship' | 'temporary',
      skills_required: skills.length > 0 ? skills : ['React', 'TypeScript', 'System Design'],
      industry: 'Software',
      easy_apply: true,
      promoted: true,
      salary_range: salaryRange.trim() || null,
    })
  }

  function submitUpdate(): void {
    if (!user || !jobId) return
    updateMutation.mutate({
      job_id: jobId,
      title: title.trim(),
      description: description.trim(),
      location: location.trim(),
      company_name: company.trim(),
      work_mode: workplace as 'remote' | 'hybrid' | 'onsite',
      employment_type: employmentType as 'full_time' | 'part_time' | 'contract' | 'internship' | 'temporary',
      skills_required: skills.length > 0 ? skills : ['React', 'TypeScript'],
      salary_range: salaryRange.trim() || null,
    })
  }

  const showHiringProIntro = !isEdit && phase === 0

  const stepHeading = useMemo(() => {
    if (showHiringProIntro) return ''
    if (isEdit && phase === 0) return 'Edit job posting'
    if (isEdit && phase === 1) return 'Update description'
    if (isEdit && phase === 2) return 'Review changes'
    if (phase === 1) return 'Continue your posting'
    if (phase === 2) return 'Almost there'
    return ''
  }, [isEdit, phase, showHiringProIntro])

  const stepSub = useMemo(() => {
    if (showHiringProIntro) return ''
    if (isEdit && phase === 0) return 'Update the basics for this listing.'
    if (phase === 1) return 'Tell candidates about the role and your company.'
    if (phase === 2) return 'Add skills and review before you publish.'
    return ''
  }, [isEdit, phase, showHiringProIntro])

  const pending = createMutation.isPending || updateMutation.isPending

  if (isEdit && existingQuery.isLoading) {
    return (
      <div className="mx-auto max-w-lg py-16 text-center text-sm text-text-secondary">
        Loading job…
      </div>
    )
  }

  if (isEdit && existingQuery.isError) {
    return (
      <Card>
        <Card.Body className="p-6 text-center text-sm text-text-secondary">We could not load this job.</Card.Body>
      </Card>
    )
  }

  return (
    <div className={cn('mx-auto w-full px-4 pb-16 pt-4', showHiringProIntro ? 'max-w-[min(100%,42rem)]' : 'max-w-[560px]')}>
      {showHiringProIntro ? (
        <>
          <p className="text-center text-lg font-semibold text-[#0a66c2]">Hi {greeting},</p>
          <h1 className="mx-auto mt-3 max-w-[min(100%,38rem)] text-center text-pretty text-xl font-semibold leading-snug tracking-tight text-[#1f1f1f] sm:text-2xl md:text-[1.65rem] md:leading-snug">
            Meet Hiring Pro. It helps find your next great hire.
          </h1>
          <p className="mx-auto mt-3 max-w-[min(100%,30rem)] text-center text-pretty text-[15px] leading-snug text-[#666]">
            86% of small businesses get a qualified candidate in one day
          </p>
        </>
      ) : (
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-[#1f1f1f]">{stepHeading}</h1>
          <p className="mt-1 text-sm text-[#666]">{stepSub}</p>
          {isEdit && jobId ? (
            <div className="mt-4 flex justify-center">
              <Link
                to={`/jobs/${jobId}/applicants`}
                className="inline-flex items-center gap-2 rounded-full border border-[#0a66c2] bg-white px-4 py-2 text-sm font-semibold text-[#0a66c2] shadow-sm transition hover:bg-[#0a66c2]/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0a66c2] focus-visible:ring-offset-2"
              >
                <Users className="h-4 w-4 shrink-0" aria-hidden />
                View applicants
              </Link>
            </div>
          ) : null}
        </div>
      )}

      <Card className={cn('border border-[#e0e0e0] bg-white shadow-sm', showHiringProIntro ? 'mt-8' : 'mt-6')}>
        <Card.Body className="space-y-5 p-6 sm:p-8">
          {phase === 0 ? (
            <>
              <div>
                <LabelWithHelp help="Use a clear title candidates search for — match the role seniority and specialty.">
                  Job title
                </LabelWithHelp>
                <Input
                  placeholder="Add the title you are hiring for"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  aria-label="Job title"
                />
              </div>
              <div>
                <span className="mb-1 block text-sm font-medium text-[#1f1f1f]">Workplace type</span>
                <Select
                  variant="native"
                  options={workplaceOptions}
                  value={workplace}
                  onValueChange={setWorkplace}
                  aria-label="Workplace type"
                />
              </div>
              <div>
                <LabelWithHelp help="City, state, or region where this role is based (or Remote).">Job location</LabelWithHelp>
                <Input placeholder="e.g. San Jose, CA" value={location} onChange={(e) => setLocation(e.target.value)} aria-label="Job location" />
              </div>
              <Button
                type="button"
                className="mt-2 w-full rounded-full py-3 text-base font-semibold"
                disabled={!canContinuePhase0()}
                onClick={() => setPhase(1)}
                leftIcon={<Sparkles className="h-4 w-4" aria-hidden />}
              >
                Continue
              </Button>
            </>
          ) : null}

          {phase === 1 ? (
            <>
              <Textarea
                label="Job description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={8}
                placeholder="Describe responsibilities, qualifications, and what success looks like."
              />
              <p className="text-xs text-[#666]">{description.length} characters · at least 24 required</p>
              <Input label="Company name" value={company} onChange={(e) => setCompany(e.target.value)} />
              <div>
                <span className="mb-1 block text-sm font-medium text-[#1f1f1f]">Employment type</span>
                <Select variant="native" options={employmentOptions} value={employmentType} onValueChange={setEmploymentType} />
              </div>
              <Input
                label="Salary range (optional)"
                placeholder="e.g. $120,000–$150,000/yr · Remote US"
                value={salaryRange}
                onChange={(e) => setSalaryRange(e.target.value)}
                maxLength={100}
              />
              <div className="flex gap-3 pt-2">
                <Button type="button" variant="secondary" className="flex-1 rounded-full" onClick={() => setPhase(0)}>
                  Back
                </Button>
                <Button type="button" className="flex-1 rounded-full" disabled={!canContinuePhase1()} onClick={() => setPhase(2)}>
                  Continue
                </Button>
              </div>
            </>
          ) : null}

          {phase === 2 ? (
            <>
              <div>
                <span className="mb-2 block text-sm font-medium text-[#1f1f1f]">Skills</span>
                <div className="flex gap-2">
                  <Input placeholder="e.g. React" value={skillInput} onChange={(e) => setSkillInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addSkill())} />
                  <Button type="button" variant="secondary" onClick={addSkill}>
                    Add
                  </Button>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {skills.map((skill) => (
                    <button
                      key={skill}
                      type="button"
                      className="rounded-full bg-black/[0.06] px-3 py-1 text-xs font-medium text-[#333]"
                      onClick={() => setSkills((p) => p.filter((s) => s !== skill))}
                    >
                      {skill} ×
                    </button>
                  ))}
                </div>
              </div>
              <div className="rounded-lg border border-[#e8e8e8] bg-[#fafafa] p-4 text-sm text-[#444]">
                <p className="font-semibold text-[#1f1f1f]">Review</p>
                <ul className="mt-2 space-y-1">
                  <li>
                    <span className="text-[#666]">Title:</span> {title}
                  </li>
                  <li>
                    <span className="text-[#666]">Company:</span> {company}
                  </li>
                  <li>
                    <span className="text-[#666]">Location:</span> {location} · {workplaceOptions.find((o) => o.value === workplace)?.label}
                  </li>
                  <li>
                    <span className="text-[#666]">Salary range:</span> {salaryRange.trim() || '—'}
                  </li>
                  <li>
                    <span className="text-[#666]">Skills:</span> {skills.length ? skills.join(', ') : 'Defaults will be used'}
                  </li>
                </ul>
              </div>
              <div className="flex gap-3 pt-2">
                <Button type="button" variant="secondary" className="flex-1 rounded-full" onClick={() => setPhase(1)}>
                  Back
                </Button>
                <Button
                  type="button"
                  className="flex-1 rounded-full py-3 text-base font-semibold"
                  loading={pending}
                  onClick={() => (isEdit ? submitUpdate() : submitCreate())}
                  leftIcon={isEdit ? undefined : <Sparkles className="h-4 w-4" aria-hidden />}
                >
                  {isEdit ? 'Save changes' : 'Post job'}
                </Button>
              </div>
            </>
          ) : null}
        </Card.Body>
      </Card>
    </div>
  )
}
