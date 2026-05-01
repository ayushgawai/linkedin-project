import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Button, ChipInput, Input, Modal, Select, Textarea } from '../../components/ui'
import { COMMON_TECH_SKILLS } from '../../lib/commonSkills'
import { handleImageUpload } from '../../lib/imageUpload'
import { useActionToast } from '../../hooks/useActionToast'
import { USE_MOCKS } from '../../api/client'
import { updateMember } from '../../api/profile'
import { useAuthStore } from '../../store/authStore'
import { makeId, useProfileStore, type Education, type Experience, type License, type Project } from '../../store/profileStore'

export type ProfileModalKey =
  | 'intro'
  | 'about'
  | 'avatar'
  | 'cover'
  | 'experience'
  | 'education'
  | 'license'
  | 'project'
  | 'skill'
  | 'course'
  | 'featured'
  | 'openToWork'
  | 'contact'
  | 'interest'
  | 'customButton'
  | 'resources'
  | null

type Props = {
  active: ProfileModalKey
  editId: string | null
  onClose: () => void
}

const introSchema = z.object({
  first_name: z.string().min(1, 'Required'),
  last_name: z.string().min(1, 'Required'),
  headline: z.string().max(220, 'Max 220 characters').optional().or(z.literal('')),
  location: z.string().min(1, 'Required'),
  pronouns: z.string().optional(),
})

const contactSchema = z.object({
  email: z.string().email(),
  phone: z.string().optional(),
})

const employmentTypes = ['Full-time', 'Part-time', 'Self-employed', 'Freelance', 'Contract', 'Internship', 'Apprenticeship', 'Seasonal'] as const
const workplaceTypes = ['On-site', 'Hybrid', 'Remote'] as const

export function ProfileModals({ active, editId, onClose }: Props): JSX.Element | null {
  const actionToast = useActionToast()
  const profile = useProfileStore((s) => s.profile)
  const authUser = useAuthStore((s) => s.user)
  const updateBasicInfo = useProfileStore((s) => s.updateBasicInfo)
  const updateAbout = useProfileStore((s) => s.updateAbout)
  const patchProfile = useProfileStore((s) => s.patchProfile)
  const updatePhoto = useProfileStore((s) => s.updatePhoto)
  const updateCover = useProfileStore((s) => s.updateCover)
  const setOpenToWork = useProfileStore((s) => s.setOpenToWork)
  const addExperience = useProfileStore((s) => s.addExperience)
  const updateExperience = useProfileStore((s) => s.updateExperience)
  const removeExperience = useProfileStore((s) => s.removeExperience)
  const addEducation = useProfileStore((s) => s.addEducation)
  const updateEducation = useProfileStore((s) => s.updateEducation)
  const removeEducation = useProfileStore((s) => s.removeEducation)
  const addLicense = useProfileStore((s) => s.addLicense)
  const updateLicense = useProfileStore((s) => s.updateLicense)
  const removeLicense = useProfileStore((s) => s.removeLicense)
  const addProject = useProfileStore((s) => s.addProject)
  const updateProject = useProfileStore((s) => s.updateProject)
  const removeProject = useProfileStore((s) => s.removeProject)
  const addSkill = useProfileStore((s) => s.addSkill)
  const addCourse = useProfileStore((s) => s.addCourse)
  const addFeatured = useProfileStore((s) => s.addFeatured)
  const addCustomButton = useProfileStore((s) => s.addCustomButton)
  const updateInterests = useProfileStore((s) => s.updateInterests)

  const existingExp = useMemo(() => profile.experience.find((e) => e.id === editId), [editId, profile.experience])
  const existingEdu = useMemo(() => profile.education.find((e) => e.id === editId), [editId, profile.education])
  const existingLic = useMemo(() => profile.licenses.find((e) => e.id === editId), [editId, profile.licenses])
  const existingProj = useMemo(() => profile.projects.find((e) => e.id === editId), [editId, profile.projects])

  if (!active) return null

  if (active === 'intro') {
    return (
      <IntroModal
        profile={profile}
        onClose={onClose}
        onSave={(v) => {
          updateBasicInfo(v)
          actionToast.profileUpdated()
          onClose()
        }}
      />
    )
  }

  if (active === 'about') {
    return (
      <AboutModal
        initialAbout={profile.about}
        initialSkills={profile.skills.map((s) => s.name)}
        onClose={onClose}
        onSave={async (about, topSkills) => {
          updateAbout(about)
          const nextTopSkills = topSkills
            .map((name) => name.trim())
            .filter(Boolean)
            .slice(0, 20)
          patchProfile({ skills: nextTopSkills.map((name) => ({ id: makeId('skill'), name })) })

          // Persist to backend so Career Coach reads latest skills.
          const memberId = authUser?.member_id || profile.member_id
          if (!USE_MOCKS && memberId) {
            await updateMember(memberId, { about, skills: nextTopSkills })
          }
          actionToast.profileUpdated()
          onClose()
        }}
      />
    )
  }

  if (active === 'avatar') {
    return (
      <AvatarCoverModal
        kind="avatar"
        onClose={onClose}
        onApply={(url) => {
          updatePhoto(url)
          actionToast.profileUpdated()
          onClose()
        }}
        onRemove={() => {
          updatePhoto('')
          actionToast.profileUpdated()
          onClose()
        }}
      />
    )
  }

  if (active === 'cover') {
    return (
      <AvatarCoverModal
        kind="cover"
        onClose={onClose}
        onApply={(url) => {
          updateCover(url)
          actionToast.profileUpdated()
          onClose()
        }}
        onRemove={() => {
          updateCover('')
          actionToast.profileUpdated()
          onClose()
        }}
      />
    )
  }

  if (active === 'experience') {
    return (
      <ExperienceModal
        initial={existingExp}
        onClose={onClose}
        onSave={(payload) => {
          if (payload.id && profile.experience.some((e) => e.id === payload.id)) {
            updateExperience(payload.id, payload)
          } else {
            addExperience({ ...payload, id: payload.id || makeId('exp') })
          }
          actionToast.profileUpdated()
          onClose()
        }}
        onDelete={
          existingExp
            ? () => {
                removeExperience(existingExp.id)
                actionToast.profileUpdated()
                onClose()
              }
            : undefined
        }
      />
    )
  }

  if (active === 'education') {
    return (
      <EducationModal
        initial={existingEdu}
        onClose={onClose}
        onSave={(payload) => {
          if (payload.id && profile.education.some((e) => e.id === payload.id)) {
            updateEducation(payload.id, payload)
          } else {
            addEducation({ ...payload, id: payload.id || makeId('edu') })
          }
          actionToast.profileUpdated()
          onClose()
        }}
        onDelete={
          existingEdu
            ? () => {
                removeEducation(existingEdu.id)
                actionToast.profileUpdated()
                onClose()
              }
            : undefined
        }
      />
    )
  }

  if (active === 'license') {
    return (
      <LicenseModal
        initial={existingLic}
        onClose={onClose}
        onSave={(payload) => {
          if (payload.id && profile.licenses.some((l) => l.id === payload.id)) {
            updateLicense(payload.id, payload)
          } else {
            addLicense({ ...payload, id: payload.id || makeId('lic') })
          }
          actionToast.profileUpdated()
          onClose()
        }}
        onDelete={
          existingLic
            ? () => {
                removeLicense(existingLic.id)
                actionToast.profileUpdated()
                onClose()
              }
            : undefined
        }
      />
    )
  }

  if (active === 'project') {
    return (
      <ProjectModal
        initial={existingProj}
        education={profile.education}
        onClose={onClose}
        onSave={(payload) => {
          if (payload.id && profile.projects.some((p) => p.id === payload.id)) {
            updateProject(payload.id, payload)
          } else {
            addProject({ ...payload, id: payload.id || makeId('prj') })
          }
          actionToast.profileUpdated()
          onClose()
        }}
        onDelete={
          existingProj
            ? () => {
                removeProject(existingProj.id)
                actionToast.profileUpdated()
                onClose()
              }
            : undefined
        }
      />
    )
  }

  if (active === 'skill') {
    return (
      <SkillModal
        onClose={onClose}
        onSave={async (name) => {
          const trimmed = name.trim()
          if (!trimmed) return

          // Optimistic local update for immediate UI feedback.
          addSkill({ id: makeId('skill'), name: trimmed })

          // Persist to backend so Career Coach reads real skills.
          const memberId = authUser?.member_id || profile.member_id
          const nextSkills = Array.from(
            new Map([...profile.skills.map((s) => s.name), trimmed].map((s) => [s.toLowerCase(), s.trim()])).values(),
          ).filter(Boolean)

          if (!USE_MOCKS && memberId) {
            await updateMember(memberId, { skills: nextSkills })
          }
        }}
        actionToast={actionToast}
      />
    )
  }

  if (active === 'course') {
    return <CourseModal onClose={onClose} onSave={(c) => addCourse(c)} actionToast={actionToast} />
  }

  if (active === 'featured') {
    return <FeaturedModal profile={profile} onClose={onClose} onSave={addFeatured} actionToast={actionToast} />
  }

  if (active === 'openToWork') {
    return <OpenToWorkModal profile={profile} onClose={onClose} onSave={setOpenToWork} actionToast={actionToast} />
  }

  if (active === 'contact') {
    return <ContactModal profile={profile} onClose={onClose} onSave={updateBasicInfo} actionToast={actionToast} />
  }

  if (active === 'interest') {
    return <InterestModal profile={profile} onClose={onClose} onSave={updateInterests} actionToast={actionToast} />
  }

  if (active === 'customButton') {
    return <CustomButtonModal onClose={onClose} onSave={addCustomButton} actionToast={actionToast} />
  }

  if (active === 'resources') {
    return (
      <Modal isOpen onClose={onClose} title="Resources" size="md">
        <Modal.Header>Profile tips</Modal.Header>
        <Modal.Body className="space-y-2 text-sm text-text-primary">
          <p>Add a clear headline, a friendly photo, and proof of impact in your experience bullets.</p>
          <p>Recruiters scan top skills and recent roles first — keep them up to date.</p>
        </Modal.Body>
        <Modal.Footer>
          <Button onClick={onClose}>Close</Button>
        </Modal.Footer>
      </Modal>
    )
  }

  return null
}

function IntroModal({
  profile,
  onClose,
  onSave,
}: {
  profile: ReturnType<typeof useProfileStore.getState>['profile']
  onClose: () => void
  onSave: (v: z.infer<typeof introSchema>) => void
}): JSX.Element {
  const form = useForm<z.infer<typeof introSchema>>({
    resolver: zodResolver(introSchema),
    defaultValues: {
      first_name: profile.first_name,
      last_name: profile.last_name,
      headline: profile.headline,
      location: profile.location,
      pronouns: profile.pronouns,
    },
  })
  return (
    <Modal isOpen onClose={onClose} title="Intro" size="lg">
      <Modal.Header>Edit intro</Modal.Header>
      <Modal.Body className="space-y-3">
        <label className="text-sm text-text-secondary">
          First name
          <Input className="mt-1" {...form.register('first_name')} />
        </label>
        {form.formState.errors.first_name?.message ? <p className="text-xs text-red-600">{form.formState.errors.first_name.message}</p> : null}
        <label className="text-sm text-text-secondary">
          Last name
          <Input className="mt-1" {...form.register('last_name')} />
        </label>
        <label className="text-sm text-text-secondary">
          Headline
          <Textarea className="mt-1 min-h-[80px]" maxLength={220} {...form.register('headline')} />
        </label>
        <label className="text-sm text-text-secondary">
          Location
          <Input className="mt-1" {...form.register('location')} />
        </label>
        <label className="text-sm text-text-secondary">
          Pronouns
          <Select
            variant="native"
            className="mt-1 h-10"
            value={form.watch('pronouns') || ''}
            onValueChange={(v) => form.setValue('pronouns', v)}
            options={[
              { value: '', label: 'Select' },
              { value: 'He/Him', label: 'He/Him' },
              { value: 'She/Her', label: 'She/Her' },
              { value: 'They/Them', label: 'They/Them' },
              { value: 'Custom', label: 'Custom' },
            ]}
          />
        </label>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="tertiary" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={form.handleSubmit(onSave)}>Save</Button>
      </Modal.Footer>
    </Modal>
  )
}

function AboutModal({
  initialAbout,
  initialSkills,
  onClose,
  onSave,
}: {
  initialAbout: string
  initialSkills: string[]
  onClose: () => void
  onSave: (about: string, topSkills: string[]) => void
}): JSX.Element {
  const [about, setAbout] = useState(initialAbout)
  const [topSkills, setTopSkills] = useState<string[]>(initialSkills)
  useEffect(() => setAbout(initialAbout), [initialAbout])
  useEffect(() => setTopSkills(initialSkills), [initialSkills])
  return (
    <Modal isOpen onClose={onClose} title="About" size="lg">
      <Modal.Header>Edit about</Modal.Header>
      <Modal.Body>
        <Textarea
          value={about}
          onChange={(e) => setAbout(e.target.value)}
          maxLength={2600}
          className="min-h-[220px]"
          placeholder="You can write about your years of experience, industry, or skills."
        />
        <p className="mt-2 text-right text-sm text-text-secondary">{about.length}/2,600</p>
        <div className="mt-4">
          <label className="mb-2 block text-sm font-semibold text-text-primary">Top skills</label>
          <ChipInput
            value={topSkills}
            onChange={setTopSkills}
            suggestions={COMMON_TECH_SKILLS}
            placeholder="Add top skills (e.g. React, TypeScript)"
          />
          <p className="mt-1 text-xs text-text-secondary">These will appear under Top skills in your About card.</p>
          {topSkills.length > 0 ? (
            <div className="mt-3 space-y-2">
              {topSkills.map((skill) => (
                <div key={skill} className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                  <span className="text-sm text-text-primary">{skill}</span>
                  <Button size="sm" variant="tertiary" onClick={() => setTopSkills((prev) => prev.filter((s) => s !== skill))}>
                    Remove
                  </Button>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="tertiary" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={() => onSave(about, topSkills)}>Save</Button>
      </Modal.Footer>
    </Modal>
  )
}

function AvatarCoverModal({
  kind,
  onClose,
  onApply,
  onRemove,
}: {
  kind: 'avatar' | 'cover'
  onClose: () => void
  onApply: (url: string) => void
  onRemove: () => void
}): JSX.Element {
  const [err, setErr] = useState<string | null>(null)
  return (
    <Modal isOpen onClose={onClose} title={kind === 'avatar' ? 'Profile photo' : 'Background photo'} size="lg">
      <Modal.Header>{kind === 'avatar' ? 'Update photo' : 'Update cover'}</Modal.Header>
      <Modal.Body className="space-y-3">
        <label className="flex min-h-[120px] cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-border p-6 text-center text-sm text-text-secondary">
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (!f) return
              const r = handleImageUpload(f, 8)
              if (r.error) {
                setErr(r.error)
                return
              }
              setErr(null)
              onApply(r.url)
            }}
          />
          Upload image (max 8MB)
        </label>
        {err ? <p className="text-sm text-red-600">{err}</p> : null}
        <button type="button" className="text-sm font-semibold text-red-600" onClick={onRemove}>
          Remove photo
        </button>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="tertiary" onClick={onClose}>
          Close
        </Button>
      </Modal.Footer>
    </Modal>
  )
}

function ExperienceModal({
  initial,
  onClose,
  onSave,
  onDelete,
}: {
  initial?: Experience
  onClose: () => void
  onSave: (p: Experience) => void
  onDelete?: () => void
}): JSX.Element {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [company, setCompany] = useState(initial?.company ?? '')
  const [employment_type, setEmploymentType] = useState(initial?.employment_type ?? 'Full-time')
  const [location, setLocation] = useState(initial?.location ?? '')
  const [workplace, setWorkplace] = useState(initial?.workplace ?? 'Hybrid')
  const [start_date, setStartDate] = useState(initial?.start_date ?? '')
  const [end_date, setEndDate] = useState(initial?.end_date ?? '')
  const [current, setCurrent] = useState(!initial?.end_date)
  const [description, setDescription] = useState(initial?.description ?? '')
  const [skills, setSkills] = useState<string[]>(initial?.skills ?? [])

  const save = (): void => {
    if (!title.trim() || !company.trim()) return
    onSave({
      id: initial?.id ?? makeId('exp'),
      title: title.trim(),
      company: company.trim(),
      employment_type,
      location: location.trim(),
      workplace,
      start_date: start_date.trim(),
      end_date: current ? null : end_date.trim() || null,
      description: description.slice(0, 2000),
      skills,
    })
  }

  return (
    <Modal isOpen onClose={onClose} title="Experience" size="lg">
      <Modal.Header>{initial ? 'Edit position' : 'Add position'}</Modal.Header>
      <Modal.Body className="max-h-[70vh] space-y-3 overflow-y-auto">
        <label className="text-sm text-text-secondary">
          Title *
          <Input className="mt-1" value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="text-sm text-text-secondary">
          Employment type *
          <Select
            variant="native"
            className="mt-1 h-10"
            value={employment_type}
            onValueChange={(v) => setEmploymentType(v)}
            options={employmentTypes.map((t) => ({ value: t, label: t }))}
          />
        </label>
        <label className="text-sm text-text-secondary">
          Company *
          <Input className="mt-1" value={company} onChange={(e) => setCompany(e.target.value)} />
        </label>
        <label className="text-sm text-text-secondary">
          Location
          <Input className="mt-1" value={location} onChange={(e) => setLocation(e.target.value)} />
        </label>
        <label className="text-sm text-text-secondary">
          Workplace
          <Select
            variant="native"
            className="mt-1 h-10"
            value={workplace}
            onValueChange={(v) => setWorkplace(v)}
            options={workplaceTypes.map((t) => ({ value: t, label: t }))}
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={current} onChange={(e) => setCurrent(e.target.checked)} />I currently work here
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-sm text-text-secondary">
            Start (YYYY-MM)
            <Input className="mt-1" value={start_date} onChange={(e) => setStartDate(e.target.value)} placeholder="2023-01" />
          </label>
          {!current ? (
            <label className="text-sm text-text-secondary">
              End (YYYY-MM)
              <Input className="mt-1" value={end_date} onChange={(e) => setEndDate(e.target.value)} />
            </label>
          ) : null}
        </div>
        <label className="text-sm text-text-secondary">
          Description
          <Textarea className="mt-1 min-h-[100px]" maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
        <div>
          <p className="mb-1 text-sm text-text-secondary">Skills</p>
          <ChipInput value={skills} onChange={setSkills} max={20} suggestions={COMMON_TECH_SKILLS} />
        </div>
      </Modal.Body>
      <Modal.Footer className="flex flex-wrap justify-between gap-2">
        <div>
          {onDelete ? (
            <button type="button" className="text-sm font-semibold text-red-600" onClick={onDelete}>
              Delete experience
            </button>
          ) : null}
        </div>
        <div className="flex gap-2">
          <Button variant="tertiary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save}>Save</Button>
        </div>
      </Modal.Footer>
    </Modal>
  )
}

function EducationModal({
  initial,
  onClose,
  onSave,
  onDelete,
}: {
  initial?: Education
  onClose: () => void
  onSave: (p: Education) => void
  onDelete?: () => void
}): JSX.Element {
  const [school, setSchool] = useState(initial?.school ?? '')
  const [degree, setDegree] = useState(initial?.degree ?? '')
  const [field, setField] = useState(initial?.field ?? '')
  const [start_date, setStart] = useState(initial?.start_date ?? '')
  const [end_date, setEnd] = useState(initial?.end_date ?? '')
  const [grade, setGrade] = useState(initial?.grade ?? '')
  const [skills, setSkills] = useState<string[]>(initial?.skills ?? [])

  const save = (): void => {
    if (!school.trim() || !degree.trim() || !field.trim()) return
    onSave({
      id: initial?.id ?? makeId('edu'),
      school: school.trim(),
      school_logo: initial?.school_logo ?? null,
      degree: degree.trim(),
      field: field.trim(),
      grade: grade.trim() || null,
      start_date: start_date.trim(),
      end_date: end_date.trim() || null,
      skills,
    })
  }

  return (
    <Modal isOpen onClose={onClose} title="Education" size="lg">
      <Modal.Header>{initial ? 'Edit education' : 'Add education'}</Modal.Header>
      <Modal.Body className="space-y-3">
        <label className="text-sm text-text-secondary">
          School *
          <Input className="mt-1" value={school} onChange={(e) => setSchool(e.target.value)} />
        </label>
        <label className="text-sm text-text-secondary">
          Degree *
          <Input className="mt-1" value={degree} onChange={(e) => setDegree(e.target.value)} />
        </label>
        <label className="text-sm text-text-secondary">
          Field of study *
          <Input className="mt-1" value={field} onChange={(e) => setField(e.target.value)} />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-sm text-text-secondary">
            Start
            <Input className="mt-1" value={start_date} onChange={(e) => setStart(e.target.value)} placeholder="2020-08" />
          </label>
          <label className="text-sm text-text-secondary">
            End / Present
            <Input className="mt-1" value={end_date ?? ''} onChange={(e) => setEnd(e.target.value)} placeholder="Present" />
          </label>
        </div>
        <label className="text-sm text-text-secondary">
          Grade (optional)
          <Input className="mt-1" value={grade ?? ''} onChange={(e) => setGrade(e.target.value)} />
        </label>
        <div>
          <p className="mb-1 text-sm text-text-secondary">Skills</p>
          <ChipInput value={skills} onChange={setSkills} max={15} suggestions={COMMON_TECH_SKILLS} />
        </div>
      </Modal.Body>
      <Modal.Footer className="flex flex-wrap justify-between gap-2">
        {onDelete ? (
          <button type="button" className="text-sm font-semibold text-red-600" onClick={onDelete}>
            Delete education
          </button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button variant="tertiary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save}>Save</Button>
        </div>
      </Modal.Footer>
    </Modal>
  )
}

function LicenseModal({
  initial,
  onClose,
  onSave,
  onDelete,
}: {
  initial?: License
  onClose: () => void
  onSave: (p: License) => void
  onDelete?: () => void
}): JSX.Element {
  const [name, setName] = useState(initial?.name ?? '')
  const [org, setOrg] = useState(initial?.org ?? '')
  const [issue_date, setIssue] = useState(initial?.issue_date ?? new Date().toISOString().slice(0, 7))
  const [credential_url, setCred] = useState(initial?.credential_url ?? '')
  const [preview_image, setPreview] = useState(initial?.preview_image ?? '')

  const save = (): void => {
    if (!name.trim() || !org.trim()) return
    onSave({
      id: initial?.id ?? makeId('lic'),
      name: name.trim(),
      org: org.trim(),
      issue_date,
      credential_url: credential_url.trim() || null,
      preview_image: preview_image || null,
    })
  }

  return (
    <Modal isOpen onClose={onClose} title="License" size="lg">
      <Modal.Header>{initial ? 'Edit license' : 'Add license'}</Modal.Header>
      <Modal.Body className="space-y-3">
        <label className="text-sm text-text-secondary">
          Name *
          <Input className="mt-1" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="text-sm text-text-secondary">
          Issuing organization *
          <Input className="mt-1" value={org} onChange={(e) => setOrg(e.target.value)} />
        </label>
        <label className="text-sm text-text-secondary">
          Issue date
          <Input className="mt-1" value={issue_date} onChange={(e) => setIssue(e.target.value)} />
        </label>
        <label className="text-sm text-text-secondary">
          Credential URL
          <Input className="mt-1" value={credential_url} onChange={(e) => setCred(e.target.value)} />
        </label>
        <label className="text-sm text-text-secondary">
          Certificate preview URL
          <Input className="mt-1" value={preview_image ?? ''} onChange={(e) => setPreview(e.target.value)} />
        </label>
      </Modal.Body>
      <Modal.Footer className="flex flex-wrap justify-between gap-2">
        {onDelete ? (
          <button type="button" className="text-sm font-semibold text-red-600" onClick={onDelete}>
            Delete
          </button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button variant="tertiary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save}>Save</Button>
        </div>
      </Modal.Footer>
    </Modal>
  )
}

function ProjectModal({
  initial,
  education,
  onClose,
  onSave,
  onDelete,
}: {
  initial?: Project
  education: Education[]
  onClose: () => void
  onSave: (p: Project) => void
  onDelete?: () => void
}): JSX.Element {
  const [name, setName] = useState(initial?.name ?? '')
  const [start_date, setStart] = useState(initial?.start_date ?? '')
  const [end_date, setEnd] = useState(initial?.end_date ?? '')
  const [associated_with, setAssoc] = useState(initial?.associated_with ?? '')
  const [description, setDesc] = useState(initial?.description ?? '')
  const [skills, setSkills] = useState<string[]>(initial?.skills ?? [])
  const [media, setMedia] = useState(initial?.media ?? [])

  const save = (): void => {
    if (!name.trim()) return
    onSave({
      id: initial?.id ?? makeId('prj'),
      name: name.trim(),
      start_date: start_date.trim(),
      end_date: end_date.trim() || null,
      associated_with: associated_with.trim() || null,
      description: description.slice(0, 2000),
      skills,
      media,
    })
  }

  return (
    <Modal isOpen onClose={onClose} title="Project" size="lg">
      <Modal.Header>{initial ? 'Edit project' : 'Add project'}</Modal.Header>
      <Modal.Body className="max-h-[70vh] space-y-3 overflow-y-auto">
        <label className="text-sm text-text-secondary">
          Name *
          <Input className="mt-1" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-sm text-text-secondary">
            Start
            <Input className="mt-1" value={start_date} onChange={(e) => setStart(e.target.value)} />
          </label>
          <label className="text-sm text-text-secondary">
            End
            <Input className="mt-1" value={end_date} onChange={(e) => setEnd(e.target.value)} />
          </label>
        </div>
        <label className="text-sm text-text-secondary">
          Associated with (education)
          <Select
            variant="native"
            className="mt-1 h-10"
            value={associated_with}
            onValueChange={setAssoc}
            options={[{ value: '', label: 'None' }, ...education.map((e) => ({ value: e.school, label: e.school }))]}
          />
        </label>
        <label className="text-sm text-text-secondary">
          Description
          <Textarea className="mt-1 min-h-[100px]" maxLength={2000} value={description} onChange={(e) => setDesc(e.target.value)} />
        </label>
        <div>
          <p className="mb-1 text-sm text-text-secondary">Skills</p>
          <ChipInput value={skills} onChange={setSkills} max={20} suggestions={COMMON_TECH_SKILLS} />
        </div>
        <label className="text-sm text-text-secondary">
          Add media image URL
          <Input
            className="mt-1"
            placeholder="https://..."
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return
              e.preventDefault()
              const url = (e.target as HTMLInputElement).value.trim()
              if (!url || media.length >= 5) return
              setMedia([...media, { id: makeId('m'), image: url, title: 'Image', url }])
              ;(e.target as HTMLInputElement).value = ''
            }}
          />
        </label>
        <div className="flex flex-wrap gap-2">
          {media.map((m) => (
            <div key={m.id} className="relative h-16 w-24 overflow-hidden rounded border border-border">
              <img src={m.image} alt="" className="h-full w-full object-cover" />
              <button
                type="button"
                className="absolute right-0 top-0 bg-black/60 px-1 text-xs text-white"
                onClick={() => setMedia(media.filter((x) => x.id !== m.id))}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </Modal.Body>
      <Modal.Footer className="flex flex-wrap justify-between gap-2">
        {onDelete ? (
          <button type="button" className="text-sm font-semibold text-red-600" onClick={onDelete}>
            Delete project
          </button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button variant="tertiary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save}>Save</Button>
        </div>
      </Modal.Footer>
    </Modal>
  )
}

function SkillModal({
  onClose,
  onSave,
  actionToast,
}: {
  onClose: () => void
  onSave: (name: string) => void
  actionToast: ReturnType<typeof useActionToast>
}): JSX.Element {
  const [name, setName] = useState('')
  return (
    <Modal isOpen onClose={onClose} title="Skill" size="md">
      <Modal.Header>Add skill</Modal.Header>
      <Modal.Body>
        <label className="text-sm text-text-secondary">
          Skill name *
          <Input className="mt-1" value={name} onChange={(e) => setName(e.target.value)} list="skill-suggestions" />
        </label>
        <datalist id="skill-suggestions">
          {COMMON_TECH_SKILLS.slice(0, 40).map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="tertiary" onClick={onClose}>
          Cancel
        </Button>
        <Button
          onClick={() => {
            const t = name.trim()
            if (!t) return
            onSave(t)
            actionToast.profileUpdated()
            onClose()
          }}
        >
          Save
        </Button>
      </Modal.Footer>
    </Modal>
  )
}

function CourseModal({
  onClose,
  onSave,
  actionToast,
}: {
  onClose: () => void
  onSave: (c: string) => void
  actionToast: ReturnType<typeof useActionToast>
}): JSX.Element {
  const [course, setCourse] = useState('')
  return (
    <Modal isOpen onClose={onClose} title="Course" size="md">
      <Modal.Header>Add course</Modal.Header>
      <Modal.Body>
        <Input value={course} onChange={(e) => setCourse(e.target.value)} placeholder="Course name" />
      </Modal.Body>
      <Modal.Footer>
        <Button variant="tertiary" onClick={onClose}>
          Cancel
        </Button>
        <Button
          onClick={() => {
            if (!course.trim()) return
            onSave(course.trim())
            actionToast.profileUpdated()
            onClose()
          }}
        >
          Save
        </Button>
      </Modal.Footer>
    </Modal>
  )
}

function FeaturedModal({
  profile,
  onClose,
  onSave,
  actionToast,
}: {
  profile: ReturnType<typeof useProfileStore.getState>['profile']
  onClose: () => void
  onSave: ReturnType<typeof useProfileStore.getState>['addFeatured']
  actionToast: ReturnType<typeof useActionToast>
}): JSX.Element {
  const [type, setType] = useState<'Certification' | 'Post' | 'Article' | 'Link'>('Certification')
  const [pickId, setPickId] = useState('')
  const [title, setTitle] = useState('')
  const [subtitle, setSubtitle] = useState('')
  const [url, setUrl] = useState('')

  const save = (): void => {
    if (type === 'Link') {
      if (!title.trim() || !url.trim()) return
      onSave({ id: makeId('feat'), type, title: title.trim(), subtitle: subtitle.trim() || url, premium: false })
    } else if (type === 'Certification') {
      const lic = profile.licenses.find((l) => l.id === pickId)
      if (!lic) return
      onSave({ id: makeId('feat'), type, title: lic.name, subtitle: lic.org, premium: false })
    } else if (type === 'Post') {
      const post = profile.activity_posts.find((p) => p.id === pickId)
      if (!post) return
      onSave({ id: makeId('feat'), type, title: post.text.slice(0, 80), subtitle: 'Your post', premium: false })
    } else {
      if (!title.trim()) return
      onSave({ id: makeId('feat'), type, title: title.trim(), subtitle: subtitle.trim(), premium: false })
    }
    actionToast.profileUpdated()
    onClose()
  }

  return (
    <Modal isOpen onClose={onClose} title="Featured" size="lg">
      <Modal.Header>Add featured</Modal.Header>
      <Modal.Body className="space-y-3">
        <Select
          variant="native"
          className="h-10"
          value={type}
          onValueChange={(v) => setType(v as typeof type)}
          options={[
            { value: 'Certification', label: 'Certification' },
            { value: 'Post', label: 'Post' },
            { value: 'Article', label: 'Article' },
            { value: 'Link', label: 'Link' },
          ]}
        />
        {type === 'Certification' ? (
          <Select
            variant="native"
            className="h-10"
            value={pickId}
            onValueChange={setPickId}
            options={[{ value: '', label: 'Select license' }, ...profile.licenses.map((l) => ({ value: l.id, label: l.name }))]}
          />
        ) : null}
        {type === 'Post' ? (
          <Select
            variant="native"
            className="h-10"
            value={pickId}
            onValueChange={setPickId}
            options={[{ value: '', label: 'Select post' }, ...profile.activity_posts.map((p) => ({ value: p.id, label: p.text.slice(0, 40) }))]}
          />
        ) : null}
        {type === 'Article' || type === 'Link' ? (
          <>
            <Input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
            <Input placeholder="Subtitle" value={subtitle} onChange={(e) => setSubtitle(e.target.value)} />
            {type === 'Link' ? <Input placeholder="https://..." value={url} onChange={(e) => setUrl(e.target.value)} /> : null}
          </>
        ) : null}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="tertiary" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={save}>Save</Button>
      </Modal.Footer>
    </Modal>
  )
}

function OpenToWorkModal({
  profile,
  onClose,
  onSave,
  actionToast,
}: {
  profile: ReturnType<typeof useProfileStore.getState>['profile']
  onClose: () => void
  onSave: ReturnType<typeof useProfileStore.getState>['setOpenToWork']
  actionToast: ReturnType<typeof useActionToast>
}): JSX.Element {
  const [on, setOn] = useState(profile.is_open_to_work)
  const [loc, setLoc] = useState(profile.open_to_work_details.location)
  const [wt, setWt] = useState(profile.open_to_work_details.workplace_type)
  return (
    <Modal isOpen onClose={onClose} title="Open to" size="md">
      <Modal.Header>Open to work</Modal.Header>
      <Modal.Body className="space-y-3">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={on} onChange={(e) => setOn(e.target.checked)} />
          Let recruiters know you&apos;re open to work
        </label>
        {on ? (
          <>
            <Input placeholder="Location" value={loc} onChange={(e) => setLoc(e.target.value)} />
            <Input placeholder="Workplace types (e.g. Hybrid, Remote)" value={wt} onChange={(e) => setWt(e.target.value)} />
          </>
        ) : null}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="tertiary" onClick={onClose}>
          Cancel
        </Button>
        <Button
          onClick={() => {
            onSave(on, { location: loc, workplace_type: wt })
            actionToast.profileUpdated()
            onClose()
          }}
        >
          Save
        </Button>
      </Modal.Footer>
    </Modal>
  )
}

function ContactModal({
  profile,
  onClose,
  onSave,
  actionToast,
}: {
  profile: ReturnType<typeof useProfileStore.getState>['profile']
  onClose: () => void
  onSave: ReturnType<typeof useProfileStore.getState>['updateBasicInfo']
  actionToast: ReturnType<typeof useActionToast>
}): JSX.Element {
  const form = useForm<z.infer<typeof contactSchema>>({
    resolver: zodResolver(contactSchema),
    defaultValues: { email: profile.email, phone: profile.phone },
  })
  return (
    <Modal isOpen onClose={onClose} title="Contact" size="md">
      <Modal.Header>Contact info</Modal.Header>
      <Modal.Body className="space-y-3">
        <label className="text-sm text-text-secondary">
          Email
          <Input className="mt-1" {...form.register('email')} />
        </label>
        <label className="text-sm text-text-secondary">
          Phone
          <Input className="mt-1" {...form.register('phone')} />
        </label>
        <p className="text-sm text-text-secondary">
          Profile URL: <span className="font-medium text-text-primary">clonecorp.com/in/{profile.member_id}</span>
        </p>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="tertiary" onClick={onClose}>
          Cancel
        </Button>
        <Button
          onClick={form.handleSubmit((v) => {
            onSave({ email: v.email, phone: v.phone ?? '' })
            actionToast.profileUpdated()
            onClose()
          })}
        >
          Save
        </Button>
      </Modal.Footer>
    </Modal>
  )
}

const INTEREST_PRESETS = {
  top_voices: [
    { id: 'tv-a', name: 'Alex Morgan', headline: 'Engineering leader' },
    { id: 'tv-b', name: 'Priya Shah', headline: 'Product strategist' },
  ],
  companies: [
    { id: 'co-a', name: 'Acme Cloud', industry: 'Software', followers: 120000 },
    { id: 'co-b', name: 'DataForge', industry: 'Analytics', followers: 45000 },
  ],
  groups: [
    { id: 'gr-a', name: 'Frontend Guild', members: 12000 },
    { id: 'gr-b', name: 'ML Builders', members: 8000 },
  ],
  newsletters: [
    { id: 'nl-a', title: 'Systems Weekly', subscribers: 20000 },
    { id: 'nl-b', title: 'Data Pipelines', subscribers: 9000 },
  ],
  schools: [
    { id: 'sc-a', name: 'State University', alumni: 400000 },
    { id: 'sc-b', name: 'Tech Institute', alumni: 120000 },
  ],
} as const

function InterestModal({
  profile,
  onClose,
  onSave,
  actionToast,
}: {
  profile: ReturnType<typeof useProfileStore.getState>['profile']
  onClose: () => void
  onSave: ReturnType<typeof useProfileStore.getState>['updateInterests']
  actionToast: ReturnType<typeof useActionToast>
}): JSX.Element {
  const [tab, setTab] = useState<keyof typeof INTEREST_PRESETS>('top_voices')
  const addTopVoice = (item: (typeof INTEREST_PRESETS)['top_voices'][number]): void => {
    if (profile.interests.top_voices.some((x) => x.id === item.id)) return
    onSave({ top_voices: [...profile.interests.top_voices, item] })
    actionToast.profileUpdated()
  }
  const addCompany = (item: (typeof INTEREST_PRESETS)['companies'][number]): void => {
    if (profile.interests.companies.some((x) => x.id === item.id)) return
    onSave({ companies: [...profile.interests.companies, item] })
    actionToast.profileUpdated()
  }
  const addGroup = (item: (typeof INTEREST_PRESETS)['groups'][number]): void => {
    if (profile.interests.groups.some((x) => x.id === item.id)) return
    onSave({ groups: [...profile.interests.groups, item] })
    actionToast.profileUpdated()
  }
  const addNewsletter = (item: (typeof INTEREST_PRESETS)['newsletters'][number]): void => {
    if (profile.interests.newsletters.some((x) => x.id === item.id)) return
    onSave({ newsletters: [...profile.interests.newsletters, item] })
    actionToast.profileUpdated()
  }
  const addSchool = (item: (typeof INTEREST_PRESETS)['schools'][number]): void => {
    if (profile.interests.schools.some((x) => x.id === item.id)) return
    onSave({ schools: [...profile.interests.schools, item] })
    actionToast.profileUpdated()
  }

  return (
    <Modal isOpen onClose={onClose} title="Interests" size="lg">
      <Modal.Header>Add interest</Modal.Header>
      <Modal.Body className="space-y-3">
        <div className="flex flex-wrap gap-2 border-b border-border pb-2">
          {(Object.keys(INTEREST_PRESETS) as (keyof typeof INTEREST_PRESETS)[]).map((k) => (
            <button
              key={k}
              type="button"
              className={`rounded-full px-3 py-1 text-sm ${tab === k ? 'bg-brand-primary text-white' : 'border border-border'}`}
              onClick={() => setTab(k)}
            >
              {k.replace('_', ' ')}
            </button>
          ))}
        </div>
        {tab === 'top_voices'
          ? INTEREST_PRESETS.top_voices.map((item) => (
              <div key={item.id} className="flex items-center justify-between rounded border border-border p-2">
                <span className="text-sm font-medium">{item.name}</span>
                <Button size="sm" onClick={() => addTopVoice(item)}>
                  Follow
                </Button>
              </div>
            ))
          : null}
        {tab === 'companies'
          ? INTEREST_PRESETS.companies.map((item) => (
              <div key={item.id} className="flex items-center justify-between rounded border border-border p-2">
                <span className="text-sm font-medium">{item.name}</span>
                <Button size="sm" onClick={() => addCompany(item)}>
                  Follow
                </Button>
              </div>
            ))
          : null}
        {tab === 'groups'
          ? INTEREST_PRESETS.groups.map((item) => (
              <div key={item.id} className="flex items-center justify-between rounded border border-border p-2">
                <span className="text-sm font-medium">{item.name}</span>
                <Button size="sm" onClick={() => addGroup(item)}>
                  Join
                </Button>
              </div>
            ))
          : null}
        {tab === 'newsletters'
          ? INTEREST_PRESETS.newsletters.map((item) => (
              <div key={item.id} className="flex items-center justify-between rounded border border-border p-2">
                <span className="text-sm font-medium">{item.title}</span>
                <Button size="sm" onClick={() => addNewsletter(item)}>
                  Follow
                </Button>
              </div>
            ))
          : null}
        {tab === 'schools'
          ? INTEREST_PRESETS.schools.map((item) => (
              <div key={item.id} className="flex items-center justify-between rounded border border-border p-2">
                <span className="text-sm font-medium">{item.name}</span>
                <Button size="sm" onClick={() => addSchool(item)}>
                  Follow
                </Button>
              </div>
            ))
          : null}
      </Modal.Body>
      <Modal.Footer>
        <Button onClick={onClose}>Done</Button>
      </Modal.Footer>
    </Modal>
  )
}

function CustomButtonModal({
  onClose,
  onSave,
  actionToast,
}: {
  onClose: () => void
  onSave: ReturnType<typeof useProfileStore.getState>['addCustomButton']
  actionToast: ReturnType<typeof useActionToast>
}): JSX.Element {
  const [label, setLabel] = useState('')
  const [url, setUrl] = useState('')
  return (
    <Modal isOpen onClose={onClose} title="Custom button" size="md">
      <Modal.Header>Add custom button</Modal.Header>
      <Modal.Body className="space-y-3">
        <Input placeholder="Label" value={label} onChange={(e) => setLabel(e.target.value)} />
        <Input placeholder="https://..." value={url} onChange={(e) => setUrl(e.target.value)} />
      </Modal.Body>
      <Modal.Footer>
        <Button variant="tertiary" onClick={onClose}>
          Cancel
        </Button>
        <Button
          onClick={() => {
            if (!label.trim() || !url.trim()) return
            onSave({ id: makeId('btn'), label: label.trim(), url: url.trim() })
            actionToast.profileUpdated()
            onClose()
          }}
        >
          Save
        </Button>
      </Modal.Footer>
    </Modal>
  )
}
