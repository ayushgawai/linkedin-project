import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { USE_MOCKS } from '../../api/client'
import { appendApplicationToMemberTracker, submitApplication } from '../../api/applications'
import { ingestEvent } from '../../api/analytics'
import { incrementJobApplicants } from '../../api/jobs'
import type { JobRecord, SubmitApplicationPayload } from '../../types/jobs'
import { useAuthStore } from '../../store/authStore'
import { useProfileStore } from '../../store/profileStore'
import { useActionToast } from '../../hooks/useActionToast'
import { Avatar, Button, Input, Modal, Textarea, useToast } from '../ui'

type ApplyModalProps = {
  isOpen: boolean
  onClose: () => void
  job: JobRecord
}

const steps = ['Contact', 'Resume', 'Questions', 'Review'] as const

export function ApplyModal({ isOpen, onClose, job }: ApplyModalProps): JSX.Element {
  const member = useAuthStore((state) => state.user)
  const profile = useProfileStore((state) => state.profile)
  const applicantMemberId = [member?.member_id, profile.member_id].find((id) => id && String(id).trim()) ?? ''
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const actionToast = useActionToast()
  const [step, setStep] = useState(0)
  const [firstName, setFirstName] = useState(profile.first_name || member?.full_name.split(' ')[0] || '')
  const [lastName, setLastName] = useState(profile.last_name || member?.full_name.split(' ').slice(1).join(' ') || '')
  const [location, setLocation] = useState(profile.location || member?.location || '')
  const [email, setEmail] = useState(profile.email || member?.email || '')
  const [phone, setPhone] = useState(profile.phone || '')
  const [resumeUrl, setResumeUrl] = useState('')
  const [resumeFileName, setResumeFileName] = useState('')
  const [resumeText, setResumeText] = useState<string | null>(null)
  const [questionFit, setQuestionFit] = useState('')
  const [questionProject, setQuestionProject] = useState('')

  const mutation = useMutation({
    mutationFn: async () => {
      if (!member) throw new Error('Please sign in to apply')
      if (!applicantMemberId) {
        throw new Error('Your account ID is missing. Sign out, sign in again, then try applying.')
      }
      const payload: SubmitApplicationPayload = {
        job_id: job.job_id,
        member_id: applicantMemberId,
        // `blob:` URLs are browser-local; recruiters can't access them. Prefer `resume_text`.
        resume_url: resumeUrl?.startsWith('http') ? resumeUrl : null,
        resume_text: resumeText,
        contact_email: email,
        contact_phone: phone,
        answers: {
          motivation: questionFit,
          project_highlight: questionProject,
          first_name: firstName,
          last_name: lastName,
          location,
          ...(resumeFileName.trim() ? { resume_file_name: resumeFileName.trim() } : {}),
        },
      }
      const application = await submitApplication(payload)
      const resolvedMemberId = application.member_id || applicantMemberId
      await ingestEvent({
        event_type: 'application.submitted',
        trace_id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        actor_id: resolvedMemberId,
        entity: { entity_type: 'job', entity_id: job.job_id },
        idempotency_key: `application-submitted-${applicantMemberId}-${job.job_id}`,
        metadata: {
          city: location.trim() || undefined,
          location: location.trim() || undefined,
        },
      })
      return application
    },
    onSuccess: (application) => {
      if (member) {
        const trackerMemberId = application.member_id || applicantMemberId
        if (USE_MOCKS) {
          appendApplicationToMemberTracker(
            trackerMemberId,
            {
              application_id: application.application_id,
              job_id: application.job_id,
              applied_at: application.applied_at,
            },
            job,
          )
        }
        void incrementJobApplicants(job.job_id)
        void queryClient.invalidateQueries({ queryKey: ['my-applications', trackerMemberId] })
        void queryClient.invalidateQueries({ queryKey: ['jobs-discovery'] })
        void queryClient.invalidateQueries({ queryKey: ['job', job.job_id] })
        void queryClient.invalidateQueries({ queryKey: ['jobs-search'] })
        void queryClient.invalidateQueries({ queryKey: ['recruiter-jobs', trackerMemberId] })
        void queryClient.invalidateQueries({ queryKey: ['job-applicants', job.job_id] })
        void queryClient.invalidateQueries({ queryKey: ['recruiter-dashboard'] })
      }
      actionToast.applicationSubmitted(job.title, job.company_name)
      onClose()
      setStep(0)
    },
    onError: (error: { message?: string }) => {
      if (error.message?.toLowerCase().includes('duplicate')) {
        toast({ variant: 'error', title: "You've already applied to this job" })
        return
      }
      toast({ variant: 'error', title: error.message ?? 'Unable to submit application' })
    },
  })

  const canGoNext =
    (step === 0 && firstName.trim() && lastName.trim() && location.trim() && email.trim() && phone.trim()) ||
    (step === 1 && (resumeUrl.trim() || resumeFileName.trim())) ||
    (step === 2 && questionFit.trim() && questionProject.trim()) ||
    step === 3

  function onPickResume(file: File | undefined): void {
    if (!file) return
    const url = URL.createObjectURL(file)
    setResumeUrl(url)
    setResumeFileName(file.name)
    setResumeText(null)

    // Best-effort: store resume bytes as a data URL in resume_text so recruiters can open it.
    // Keep a conservative cap because the gateway JSON limit is 2mb and services are 1mb.
    const MAX_BYTES = 650_000
    if (file.size > MAX_BYTES) {
      toast({
        variant: 'info',
        title: 'Resume too large to store',
        description: 'Please upload a smaller PDF (≤ ~650KB) for recruiter preview in this demo build.',
      })
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result
      if (typeof result === 'string') {
        setResumeText(result)
      }
    }
    reader.onerror = () => {
      toast({ variant: 'error', title: 'Could not read resume file' })
    }
    reader.readAsDataURL(file)
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Apply to ${job.company_name}`} size="xl">
      <Modal.Header>Apply to {job.company_name}</Modal.Header>
      <Modal.Body className="space-y-5">
        <div className="space-y-2">
          <div className="h-2 w-full rounded-full bg-black/10">
            <div className="h-2 rounded-full bg-brand-primary transition-all" style={{ width: `${(step / (steps.length - 1)) * 100}%` }} />
          </div>
          <div className="flex items-center gap-2 text-xs text-text-secondary">
            {steps.map((label, index) => (
              <span key={label} className={index === step ? 'font-semibold text-brand-primary' : ''}>
                {label}
                {index < steps.length - 1 ? ' •' : ''}
              </span>
            ))}
          </div>
        </div>

        {step === 0 ? (
          <div className="space-y-3">
            <h3 className="text-xl font-semibold text-text-primary">Contact info</h3>
            <div className="flex items-center gap-3">
              <Avatar size="lg" name={`${firstName} ${lastName}`.trim() || member?.full_name || 'Member'} src={profile.profile_photo_url || undefined} />
              <div>
                <p className="text-base font-semibold text-text-primary">{`${firstName} ${lastName}`.trim() || member?.full_name || 'Member'}</p>
                <p className="text-sm text-text-secondary">{profile.headline || 'Add your headline'}</p>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <Input label="First name*" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
              <Input label="Last name*" value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </div>
            <Input label="Location*" value={location} onChange={(e) => setLocation(e.target.value)} />
            <div className="grid gap-3 md:grid-cols-2">
              <Input label="Email address*" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              <Input label="Mobile phone number*" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          </div>
        ) : null}

        {step === 1 ? (
          <div className="space-y-3">
            <h3 className="text-xl font-semibold text-text-primary">Resume</h3>
            <div className="rounded-md border border-dashed border-border bg-surface p-4">
              <p className="text-sm text-text-secondary">Upload resume from your computer</p>
              <label className="mt-3 inline-flex cursor-pointer rounded-full border border-brand-primary px-4 py-2 text-sm font-semibold text-brand-primary hover:bg-brand-primary/10">
                Upload resume
                <input
                  type="file"
                  accept=".pdf,.doc,.docx"
                  className="hidden"
                  onChange={(e) => onPickResume(e.target.files?.[0])}
                />
              </label>
              {resumeFileName ? <p className="mt-3 text-sm font-medium text-text-primary">{resumeFileName}</p> : null}
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="space-y-3">
            <h3 className="text-xl font-semibold text-text-primary">Questions</h3>
            <Textarea
              label="Why are you a good fit for this role?*"
              value={questionFit}
              onChange={(e) => setQuestionFit(e.target.value)}
              autoResize
              className="min-h-[120px]"
            />
            <Textarea
              label="Explain any one project of yours*"
              value={questionProject}
              onChange={(e) => setQuestionProject(e.target.value)}
              autoResize
              className="min-h-[120px]"
            />
          </div>
        ) : null}

        {step === 3 ? (
          <div className="space-y-3">
            <h3 className="text-xl font-semibold text-text-primary">Review your application</h3>
            <div className="flex items-center gap-3 rounded-md border border-border p-3">
              <Avatar size="lg" name={`${firstName} ${lastName}`.trim() || member?.full_name || 'Member'} src={profile.profile_photo_url || undefined} />
              <div>
                <p className="font-semibold text-text-primary">{`${firstName} ${lastName}`.trim()}</p>
                <p className="text-sm text-text-secondary">{profile.headline || 'Professional'}</p>
              </div>
            </div>
            <div className="rounded-md border border-border p-3 text-sm">
              <p><strong>Location:</strong> {location}</p>
              <p><strong>Email:</strong> {email}</p>
              <p><strong>Phone:</strong> {phone}</p>
              <p><strong>Resume:</strong> {resumeFileName || resumeUrl || 'Not provided'}</p>
              <p className="mt-2"><strong>Why are you a good fit?</strong></p>
              <p className="text-text-secondary">{questionFit}</p>
              <p className="mt-2"><strong>Project highlight</strong></p>
              <p className="text-text-secondary">{questionProject}</p>
            </div>
          </div>
        ) : null}
      </Modal.Body>
      <Modal.Footer>
        {step > 0 ? <Button variant="tertiary" onClick={() => setStep((prev) => prev - 1)}>Back</Button> : null}
        {step < 3 ? (
          <Button disabled={!canGoNext} onClick={() => setStep((prev) => prev + 1)}>
            Next
          </Button>
        ) : (
          <Button loading={mutation.isPending} onClick={() => mutation.mutate()}>
            Apply
          </Button>
        )}
      </Modal.Footer>
    </Modal>
  )
}
