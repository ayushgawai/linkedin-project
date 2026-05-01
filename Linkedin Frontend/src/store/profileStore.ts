import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Member } from '../types'

export type Skill = { id: string; name: string }

export type CustomButton = { id: string; label: string; url: string }

type OpenToWorkDetails = { location: string; workplace_type: string }
type InterestPerson = { id: string; name: string; headline: string; avatar?: string | null }
type InterestCompany = { id: string; name: string; industry: string; followers: number; logo?: string | null }
type InterestGroup = { id: string; name: string; members: number; logo?: string | null }
type InterestNewsletter = { id: string; title: string; subscribers: number; logo?: string | null }
type InterestSchool = { id: string; name: string; alumni: number; logo?: string | null }
export type ActivityPost = { id: string; text: string; image?: string | null; reactions: number; comments: number }
export type FeaturedItem = { id: string; type: string; org_logo?: string | null; title: string; subtitle: string; premium?: boolean }
export type Experience = {
  id: string
  title: string
  company: string
  company_logo?: string | null
  employment_type: string
  start_date: string
  end_date?: string | null
  location: string
  workplace: string
  description: string
  skills: string[]
}
export type Education = {
  id: string
  school: string
  school_logo?: string | null
  degree: string
  field: string
  grade?: string | null
  start_date: string
  end_date?: string | null
  skills: string[]
}
export type License = {
  id: string
  name: string
  org: string
  org_logo?: string | null
  issue_date: string
  credential_url?: string | null
  preview_image?: string | null
}
export type Project = {
  id: string
  name: string
  associated_with?: string | null
  start_date: string
  end_date?: string | null
  description: string
  skills: string[]
  media: Array<{ id: string; image: string; title: string; url: string }>
}

export interface ProfileData {
  member_id: string
  first_name: string
  last_name: string
  email: string
  phone: string
  headline: string
  about: string
  location: string
  pronouns: string
  profile_photo_url: string
  cover_photo_url: string
  is_open_to_work: boolean
  open_to_work_details: OpenToWorkDetails
  current_education_id: string
  connections_count: number
  followers_count: number
  profile_views: number
  post_impressions: number
  search_appearances: number
  is_premium: boolean
  experience: Experience[]
  education: Education[]
  licenses: License[]
  projects: Project[]
  skills: Skill[]
  courses: string[]
  featured: FeaturedItem[]
  activity_posts: ActivityPost[]
  custom_buttons: CustomButton[]
  interests: {
    top_voices: InterestPerson[]
    companies: InterestCompany[]
    groups: InterestGroup[]
    newsletters: InterestNewsletter[]
    schools: InterestSchool[]
  }
}

export interface ProfileStore {
  profile: ProfileData
  dismissedSuggestions: Record<string, boolean>
  completionCardDismissed: boolean
  followedCompanyIds: string[]
  initializeProfile: (fields?: Partial<ProfileData>) => void
  patchProfile: (fields: Partial<ProfileData>) => void
  updateBasicInfo: (
    fields: Partial<Pick<ProfileData, 'first_name' | 'last_name' | 'headline' | 'location' | 'email' | 'phone' | 'pronouns'>>,
  ) => void
  updateAbout: (about: string) => void
  updatePhoto: (url: string) => void
  updateCover: (url: string) => void
  setOpenToWork: (enabled: boolean, details?: OpenToWorkDetails) => void
  addExperience: (exp: Experience) => void
  updateExperience: (id: string, fields: Partial<Experience>) => void
  removeExperience: (id: string) => void
  addEducation: (edu: Education) => void
  updateEducation: (id: string, fields: Partial<Education>) => void
  removeEducation: (id: string) => void
  addLicense: (lic: License) => void
  updateLicense: (id: string, fields: Partial<License>) => void
  removeLicense: (id: string) => void
  addProject: (proj: Project) => void
  updateProject: (id: string, fields: Partial<Project>) => void
  removeProject: (id: string) => void
  addSkill: (skill: Skill) => void
  removeSkill: (id: string) => void
  addCourse: (course: string) => void
  removeCourse: (course: string) => void
  addFeatured: (item: FeaturedItem) => void
  removeFeatured: (id: string) => void
  addActivityPost: (post: ActivityPost) => void
  updateInterests: (interests: Partial<ProfileData['interests']>) => void
  addCustomButton: (btn: CustomButton) => void
  removeCustomButton: (id: string) => void
  toggleFollowCompany: (companyId: string) => void
  resetProfile: () => void
  isProfileComplete: () => boolean
  completionPercentage: () => number
  dismissSuggestion: (key: string) => void
  isSuggestionDismissed: (key: string) => boolean
  setCompletionCardDismissed: (value: boolean) => void
}

export function makeId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}-${Date.now()}`
}

function newSkill(name: string): Skill {
  return { id: makeId('skill'), name: name.trim() }
}

export function createEmptyProfile(seed?: Partial<ProfileData>): ProfileData {
  return {
    member_id: seed?.member_id ?? '',
    first_name: seed?.first_name ?? '',
    last_name: seed?.last_name ?? '',
    email: seed?.email ?? '',
    phone: seed?.phone ?? '',
    headline: seed?.headline ?? '',
    about: seed?.about ?? '',
    location: seed?.location ?? '',
    pronouns: seed?.pronouns ?? '',
    profile_photo_url: seed?.profile_photo_url ?? '',
    cover_photo_url: seed?.cover_photo_url ?? '',
    is_open_to_work: seed?.is_open_to_work ?? false,
    open_to_work_details: seed?.open_to_work_details ?? { location: '', workplace_type: '' },
    current_education_id: seed?.current_education_id ?? '',
    connections_count: seed?.connections_count ?? 0,
    followers_count: seed?.followers_count ?? 0,
    profile_views: seed?.profile_views ?? 0,
    post_impressions: seed?.post_impressions ?? 0,
    search_appearances: seed?.search_appearances ?? 0,
    is_premium: seed?.is_premium ?? false,
    experience: seed?.experience ?? [],
    education: seed?.education ?? [],
    licenses: seed?.licenses ?? [],
    projects: seed?.projects ?? [],
    skills: seed?.skills ?? [],
    courses: seed?.courses ?? [],
    featured: seed?.featured ?? [],
    activity_posts: seed?.activity_posts ?? [],
    custom_buttons: seed?.custom_buttons ?? [],
    interests: seed?.interests ?? { top_voices: [], companies: [], groups: [], newsletters: [], schools: [] },
  }
}

function normalizeSkills(skills: unknown): Skill[] {
  if (!Array.isArray(skills)) return []
  if (skills.length === 0) return []
  if (typeof skills[0] === 'string') {
    return (skills as string[]).filter(Boolean).map((name) => newSkill(name))
  }
  return (skills as Skill[]).map((s) =>
    typeof s === 'object' && s && 'name' in s && 'id' in s ? (s as Skill) : newSkill(String((s as { name?: string }).name ?? '')),
  )
}

export function toMemberProfile(profile: ProfileData): Member {
  const fullName = `${profile.first_name} ${profile.last_name}`.trim()
  const now = new Date().toISOString()
  const memberId = profile.member_id || 'pending-member'
  return {
    member_id: memberId,
    email: profile.email || 'you@local.dev',
    full_name: fullName || 'Member',
    headline: profile.headline || null,
    bio: profile.about || null,
    location: profile.location || null,
    skills: profile.skills.map((s) => s.name),
    profile_photo_url: profile.profile_photo_url || null,
    cover_photo_url: profile.cover_photo_url || null,
    is_premium: profile.is_premium,
    connections_count: profile.connections_count,
    followers_count: profile.followers_count,
    profile_views: profile.profile_views,
    post_impressions: profile.post_impressions,
    search_appearances: profile.search_appearances,
    is_open_to_work: profile.is_open_to_work,
    open_to_work_details: profile.open_to_work_details.location
      ? `${profile.open_to_work_details.location} · ${profile.open_to_work_details.workplace_type}`
      : '',
    phone: profile.phone || null,
    public_profile_url: `www.clonecorp.com/in/${memberId}`,
    experiences: profile.experience,
    educations: profile.education,
    licenses: profile.licenses,
    projects: profile.projects,
    courses: profile.courses,
    featured: profile.featured,
    activity_posts: profile.activity_posts,
    interests: {
      topVoices: profile.interests.top_voices,
      companies: profile.interests.companies,
      groups: profile.interests.groups,
      newsletters: profile.interests.newsletters,
      schools: profile.interests.schools,
    },
    created_at: now,
    updated_at: now,
  }
}

function progress(profile: ProfileData): number {
  let total = 0
  if (profile.profile_photo_url) total += 15
  if (profile.headline.trim()) total += 10
  if (profile.about.trim()) total += 10
  if (profile.location.trim()) total += 5
  if (profile.experience.length > 0) total += 20
  if (profile.education.length > 0) total += 15
  if (profile.skills.length > 0) total += 15
  if (profile.projects.length > 0) total += 5
  if (profile.licenses.length > 0) total += 5
  return total
}

type PersistedSlice = Pick<ProfileStore, 'profile' | 'dismissedSuggestions' | 'completionCardDismissed' | 'followedCompanyIds'>

function emptyPersistedSlice(): PersistedSlice {
  return {
    profile: createEmptyProfile(),
    dismissedSuggestions: {},
    completionCardDismissed: false,
    followedCompanyIds: [],
  }
}

function migratePersisted(state: unknown): PersistedSlice {
  const s = state as Partial<PersistedSlice> & { profile?: ProfileData }
  if (!s.profile) {
    return emptyPersistedSlice()
  }
  s.profile.skills = normalizeSkills(s.profile.skills)
  if (!s.profile.member_id) {
    s.profile.member_id = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : makeId('member')
  }
  if (!Array.isArray(s.profile.custom_buttons)) {
    s.profile.custom_buttons = []
  }
  if (typeof s.profile.pronouns !== 'string') {
    s.profile.pronouns = ''
  }
  return {
    profile: { ...createEmptyProfile(), ...s.profile, skills: normalizeSkills(s.profile.skills) },
    dismissedSuggestions: s.dismissedSuggestions ?? {},
    completionCardDismissed: s.completionCardDismissed ?? false,
    followedCompanyIds: Array.isArray((s as { followedCompanyIds?: string[] }).followedCompanyIds)
      ? (s as { followedCompanyIds: string[] }).followedCompanyIds
      : [],
  }
}

export const useProfileStore = create<ProfileStore>()(
  persist(
    (set, get) => ({
      profile: createEmptyProfile(),
      dismissedSuggestions: {},
      completionCardDismissed: false,
      followedCompanyIds: [],
      initializeProfile: (fields) =>
        set((state) => ({
          profile: createEmptyProfile({ ...state.profile, ...fields }),
        })),
      patchProfile: (fields) => set((state) => ({ profile: { ...state.profile, ...fields } })),
      updateBasicInfo: (fields) => set((state) => ({ profile: { ...state.profile, ...fields } })),
      updateAbout: (about) => set((state) => ({ profile: { ...state.profile, about } })),
      updatePhoto: (url) => set((state) => ({ profile: { ...state.profile, profile_photo_url: url } })),
      updateCover: (url) => set((state) => ({ profile: { ...state.profile, cover_photo_url: url } })),
      setOpenToWork: (enabled, details) =>
        set((state) => ({
          profile: {
            ...state.profile,
            is_open_to_work: enabled,
            open_to_work_details: details ?? state.profile.open_to_work_details,
          },
        })),
      addExperience: (exp) => set((state) => ({ profile: { ...state.profile, experience: [exp, ...state.profile.experience] } })),
      updateExperience: (id, fields) =>
        set((state) => ({
          profile: {
            ...state.profile,
            experience: state.profile.experience.map((item) => (item.id === id ? { ...item, ...fields } : item)),
          },
        })),
      removeExperience: (id) =>
        set((state) => ({ profile: { ...state.profile, experience: state.profile.experience.filter((item) => item.id !== id) } })),
      addEducation: (edu) => set((state) => ({ profile: { ...state.profile, education: [edu, ...state.profile.education] } })),
      updateEducation: (id, fields) =>
        set((state) => ({
          profile: {
            ...state.profile,
            education: state.profile.education.map((item) => (item.id === id ? { ...item, ...fields } : item)),
          },
        })),
      removeEducation: (id) =>
        set((state) => ({ profile: { ...state.profile, education: state.profile.education.filter((item) => item.id !== id) } })),
      addLicense: (lic) => set((state) => ({ profile: { ...state.profile, licenses: [lic, ...state.profile.licenses] } })),
      updateLicense: (id, fields) =>
        set((state) => ({
          profile: {
            ...state.profile,
            licenses: state.profile.licenses.map((item) => (item.id === id ? { ...item, ...fields } : item)),
          },
        })),
      removeLicense: (id) =>
        set((state) => ({ profile: { ...state.profile, licenses: state.profile.licenses.filter((item) => item.id !== id) } })),
      addProject: (proj) => set((state) => ({ profile: { ...state.profile, projects: [proj, ...state.profile.projects] } })),
      updateProject: (id, fields) =>
        set((state) => ({
          profile: {
            ...state.profile,
            projects: state.profile.projects.map((item) => (item.id === id ? { ...item, ...fields } : item)),
          },
        })),
      removeProject: (id) =>
        set((state) => ({ profile: { ...state.profile, projects: state.profile.projects.filter((item) => item.id !== id) } })),
      addSkill: (skill) =>
        set((state) => {
          const name = skill.name.trim()
          if (!name) return state
          if (state.profile.skills.some((s) => s.name.toLowerCase() === name.toLowerCase())) return state
          return { profile: { ...state.profile, skills: [...state.profile.skills, { ...skill, name }] } }
        }),
      removeSkill: (id) =>
        set((state) => ({
          profile: {
            ...state.profile,
            skills: state.profile.skills.filter((item) => item.id !== id),
          },
        })),
      addCourse: (course) =>
        set((state) => {
          const normalized = course.trim()
          if (!normalized || state.profile.courses.includes(normalized)) return state
          return { profile: { ...state.profile, courses: [...state.profile.courses, normalized] } }
        }),
      removeCourse: (course) =>
        set((state) => ({ profile: { ...state.profile, courses: state.profile.courses.filter((item) => item !== course) } })),
      addFeatured: (item) => set((state) => ({ profile: { ...state.profile, featured: [item, ...state.profile.featured] } })),
      removeFeatured: (id) =>
        set((state) => ({ profile: { ...state.profile, featured: state.profile.featured.filter((item) => item.id !== id) } })),
      addActivityPost: (post) =>
        set((state) => ({ profile: { ...state.profile, activity_posts: [post, ...state.profile.activity_posts] } })),
      updateInterests: (interests) =>
        set((state) => ({
          profile: { ...state.profile, interests: { ...state.profile.interests, ...interests } },
        })),
      addCustomButton: (btn) =>
        set((state) => ({ profile: { ...state.profile, custom_buttons: [...state.profile.custom_buttons, btn] } })),
      removeCustomButton: (id) =>
        set((state) => ({
          profile: { ...state.profile, custom_buttons: state.profile.custom_buttons.filter((b) => b.id !== id) },
        })),
      toggleFollowCompany: (companyId) =>
        set((state) => ({
          followedCompanyIds: state.followedCompanyIds.includes(companyId)
            ? state.followedCompanyIds.filter((id) => id !== companyId)
            : [...state.followedCompanyIds, companyId],
        })),
      resetProfile: () =>
        set({
          profile: createEmptyProfile(),
          dismissedSuggestions: {},
          completionCardDismissed: false,
          followedCompanyIds: [],
        }),
      isProfileComplete: () => {
        const profile = get().profile
        return Boolean(
          profile.first_name.trim() && profile.last_name.trim() && profile.headline.trim() && profile.experience.length > 0,
        )
      },
      completionPercentage: () => progress(get().profile),
      dismissSuggestion: (key) => set((state) => ({ dismissedSuggestions: { ...state.dismissedSuggestions, [key]: true } })),
      isSuggestionDismissed: (key) => Boolean(get().dismissedSuggestions[key]),
      setCompletionCardDismissed: (value) => set({ completionCardDismissed: value }),
    }),
    {
      name: 'linkedin-profile-store',
      version: 4,
      migrate: (persisted, version) => {
        // v4 reset: clear previously persisted user profile data for clean testing.
        if (version < 4) return emptyPersistedSlice()
        if (version === 4) return persisted as PersistedSlice
        return migratePersisted(persisted)
      },
      partialize: (state) => ({
        profile: state.profile,
        dismissedSuggestions: state.dismissedSuggestions,
        completionCardDismissed: state.completionCardDismissed,
        followedCompanyIds: state.followedCompanyIds,
      }),
    },
  ),
)
