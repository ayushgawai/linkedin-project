// ============================================
// INTEGRATION CONTRACT — Profile Service
// ============================================
// Current: reads/writes profileStore (zustand + localStorage). Local credentials for auth.
// Future: replace with real API calls.
//
// POST /members/get    { member_id }              → Member
// POST /members/update { member_id, ...fields }   → Member
// POST /members/create { ...signup_fields }       → { token, member }
// POST /members/search { filters }                → Member[]
// ============================================

import { rewriteMinioUrlForApiGateway } from '../lib/mediaUrl'
import { USE_MOCKS, apiClient, mockDelay } from './client'
import { delay, seedDemoData } from '../lib/mockData'
import { DIRECTORY_MEMBERS, getDirectoryMember } from '../lib/profileDirectory'
import { clearLocalCredentials, getLocalCredentials, saveLocalCredentials } from '../lib/localProfileAuth'
import { makeId, toMemberProfile, useProfileStore, type ProfileData, type Skill } from '../store/profileStore'
import type { Member } from '../types'

type AuthResponse = {
  token: string
  user: Member
}

type SignupPayload = {
  email: string
  password: string
  full_name: string
  location: string
  headline: string | null
  role: 'member' | 'recruiter'
}

type SearchMembersFilters = {
  query?: string
  location?: string
  skills?: string[]
}

/** Profile service returns `{ success, data }` from `ok()`; gateway forwards that body. */
function unwrapProfileResponse(body: unknown): unknown {
  if (body && typeof body === 'object' && (body as { success?: boolean }).success === true && 'data' in body) {
    return (body as { data: unknown }).data
  }
  return body
}

/** Strip values that cannot be loaded by other users (e.g. blob: from another session). */
function normalizePhotoUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const t = value.trim()
  if (!t) return null
  if (t.startsWith('blob:')) return null
  return t
}

function normalizeMember(raw: any): Member {
  const now = new Date().toISOString()
  const first = typeof raw?.first_name === 'string' ? raw.first_name : ''
  const last = typeof raw?.last_name === 'string' ? raw.last_name : ''
  const full =
    (typeof raw?.full_name === 'string' && raw.full_name.trim()) ||
    `${first} ${last}`.trim() ||
    'Member'
  return {
    member_id: String(raw?.member_id ?? ''),
    email: String(raw?.email ?? ''),
    full_name: full,
    role: raw?.role,
    headline: raw?.headline ?? null,
    bio: raw?.bio ?? raw?.about ?? null,
    location: raw?.location ?? null,
    skills: Array.isArray(raw?.skills) ? raw.skills : [],
    profile_photo_url: rewriteMinioUrlForApiGateway(
      normalizePhotoUrl(raw?.profile_photo_url) ?? normalizePhotoUrl(raw?.profilePhotoUrl),
    ),
    cover_photo_url: rewriteMinioUrlForApiGateway(
      normalizePhotoUrl(raw?.cover_photo_url) ?? normalizePhotoUrl(raw?.coverPhotoUrl),
    ),
    is_premium: raw?.is_premium,
    connections_count: raw?.connections_count ?? 0,
    followers_count: raw?.followers_count ?? 0,
    profile_views: raw?.profile_views ?? 0,
    post_impressions: raw?.post_impressions ?? 0,
    search_appearances: raw?.search_appearances ?? 0,
    is_open_to_work: raw?.is_open_to_work ?? false,
    open_to_work_details: raw?.open_to_work_details,
    phone: raw?.phone ?? null,
    public_profile_url: raw?.public_profile_url ?? null,
    experiences: Array.isArray(raw?.experiences) ? raw.experiences : [],
    educations: Array.isArray(raw?.educations) ? raw.educations : [],
    licenses: Array.isArray(raw?.licenses) ? raw.licenses : [],
    projects: Array.isArray(raw?.projects) ? raw.projects : [],
    courses: Array.isArray(raw?.courses) ? raw.courses : [],
    featured: Array.isArray(raw?.featured) ? raw.featured : [],
    activity_posts: Array.isArray(raw?.activity_posts) ? raw.activity_posts : [],
    interests: raw?.interests,
    created_at: String(raw?.created_at ?? now),
    updated_at: String(raw?.updated_at ?? now),
  }
}

function normalizeAuthResponse(body: unknown): AuthResponse {
  const raw = unwrapProfileResponse(body) as AuthResponse
  if (!raw?.user || typeof raw.user !== 'object') return raw
  return { ...raw, user: normalizeMember(raw.user as any) as Member }
}

function memberSkillsToStoreSkills(skills: string[] | undefined): Skill[] {
  return (skills ?? []).filter(Boolean).map((name) => ({ id: makeId('skill'), name }))
}

function applyMemberFieldsToProfile(member_id: string, fields: Partial<Member>): void {
  const state = useProfileStore.getState()
  if (member_id !== state.profile.member_id) return
  const names = fields.full_name?.trim().split(/\s+/) ?? []
  const first = names[0] ?? state.profile.first_name
  const last = names.slice(1).join(' ') || state.profile.last_name
  state.updateBasicInfo({
    first_name: first,
    last_name: last,
    headline: fields.headline != null ? fields.headline : state.profile.headline,
    location: fields.location != null ? fields.location : state.profile.location,
    email: fields.email ?? state.profile.email,
    phone: fields.phone != null ? fields.phone ?? '' : state.profile.phone,
  })
  if (typeof fields.bio === 'string') state.updateAbout(fields.bio)
  if (typeof fields.profile_photo_url === 'string' || fields.profile_photo_url === null) {
    state.updatePhoto(fields.profile_photo_url ?? '')
  }
  if (typeof fields.cover_photo_url === 'string' || fields.cover_photo_url === null) {
    state.updateCover(fields.cover_photo_url ?? '')
  }
  if (Array.isArray(fields.skills)) {
    state.patchProfile({ skills: memberSkillsToStoreSkills(fields.skills) })
  }
  if (fields.experiences) state.patchProfile({ experience: fields.experiences })
  if (fields.educations) state.patchProfile({ education: fields.educations })
  if (fields.licenses) state.patchProfile({ licenses: fields.licenses })
  if (fields.projects) state.patchProfile({ projects: fields.projects })
  if (fields.courses) state.patchProfile({ courses: fields.courses })
}

export async function login(email: string, password: string): Promise<AuthResponse> {
  if (USE_MOCKS) {
    await mockDelay()
    const creds = getLocalCredentials()
    const emailMatches = creds?.email?.toLowerCase() === email.toLowerCase()
    const passwordMatches = creds?.password === password

    // Backend auth is not integrated yet: allow direct sign-in in mock mode.
    // If credentials don't exist/match, bootstrap local credentials + profile identity.
    if (!emailMatches || !passwordMatches) {
      const store = useProfileStore.getState()
      if (!store.profile.member_id) {
        store.patchProfile({
          member_id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : makeId('member'),
        })
      }
      if (!store.profile.email) {
        store.patchProfile({ email })
      }
      saveLocalCredentials({ email, password, role: 'member' })
    }

    const profile = useProfileStore.getState().profile
    if (!profile.member_id) {
      return Promise.reject({ status: 401, message: 'No profile found for this account. Please sign up first.' })
    }
    const storedRole = getLocalCredentials()?.role
    const role: 'member' | 'recruiter' = storedRole === 'recruiter' ? 'recruiter' : 'member'
    return {
      token: 'local-session-token',
      user: { ...toMemberProfile(profile), role } as Member & { role?: 'member' | 'recruiter' },
    }
  }
  const response = await apiClient.post<unknown>('/auth/login', { email, password })
  return normalizeAuthResponse(response.data)
}

export async function signup(payload: SignupPayload): Promise<AuthResponse> {
  if (USE_MOCKS) {
    await mockDelay()
    const names = payload.full_name.trim().split(/\s+/)
    const first_name = names[0] ?? ''
    const last_name = names.slice(1).join(' ')
    const member_id =
      useProfileStore.getState().profile.member_id ||
      (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : makeId('member'))

    const store = useProfileStore.getState()
    store.patchProfile({
      member_id,
      email: payload.email,
      first_name,
      last_name,
      location: payload.location,
      headline: payload.headline ?? '',
    })
    saveLocalCredentials({ email: payload.email, password: payload.password, role: payload.role })
    const user = toMemberProfile(useProfileStore.getState().profile)
    const now = new Date().toISOString()
    return {
      token: `local-jwt-${Date.now()}`,
      user: {
        ...user,
        created_at: now,
        updated_at: now,
        role: payload.role,
      } as Member,
    }
  }
  // Recruiter signup lives in Profile service at /recruiters/create (returns token+user),
  // while recruiter CRUD lives in Job service at /recruiters.
  // Members support both POST /members and /members/create; keep legacy endpoint.
  const endpoint = payload.role === 'recruiter' ? '/recruiters/create' : '/members/create'
  const response = await apiClient.post<unknown>(endpoint, payload)
  return normalizeAuthResponse(response.data)
}

export async function getMember(member_id: string): Promise<Member> {
  if (USE_MOCKS) {
    await delay(200)
    const own = useProfileStore.getState().profile
    if (member_id === own.member_id) {
      return toMemberProfile(own)
    }
    const dir = getDirectoryMember(member_id)
    if (dir) return dir
    const seeded = seedDemoData().members.find((m) => m.member_id === member_id)
    if (seeded) return seeded
    return Promise.reject({ status: 404, message: 'Profile not found' })
  }
  const response = await apiClient.post<unknown>('/members/get', { member_id })
  return normalizeMember(unwrapProfileResponse(response.data) as any)
}

export async function updateMember(member_id: string, fields: Partial<Member>): Promise<Member> {
  if (USE_MOCKS) {
    await delay(200)
    applyMemberFieldsToProfile(member_id, fields)
    return toMemberProfile(useProfileStore.getState().profile)
  }
  const response = await apiClient.post<unknown>('/members/update', { member_id, ...fields })
  const next = normalizeMember(unwrapProfileResponse(response.data) as any)
  applyMemberFieldsToProfile(member_id, {
    profile_photo_url: next.profile_photo_url,
    cover_photo_url: next.cover_photo_url,
  })
  return next
}

export async function searchMembers(filters: SearchMembersFilters): Promise<Member[]> {
  if (USE_MOCKS) {
    await delay(200)
    const own = toMemberProfile(useProfileStore.getState().profile)
    const seeded = seedDemoData().members
    const merged = [own, ...DIRECTORY_MEMBERS, ...seeded]
    const deduped = Array.from(new Map(merged.map((m) => [m.member_id, m])).values())
    const rest = deduped
    return rest.filter((member) => {
      const queryMatch = filters.query
        ? `${member.full_name} ${member.headline ?? ''}`.toLowerCase().includes(filters.query.toLowerCase())
        : true
      const locationMatch = filters.location
        ? (member.location ?? '').toLowerCase().includes(filters.location.toLowerCase())
        : true
      const skillsMatch =
        filters.skills && filters.skills.length > 0
          ? filters.skills.every((skill) => member.skills.map((s) => s.toLowerCase()).includes(skill.toLowerCase()))
          : true
      return queryMatch && locationMatch && skillsMatch
    })
  }
  // Backend expects { keyword, location, skill } (not { query, skills[] }).
  const payload: Record<string, unknown> = {
    keyword: filters.query,
    location: filters.location,
    skill: Array.isArray(filters.skills) && filters.skills.length > 0 ? filters.skills[0] : undefined,
  }
  const response = await apiClient.post<unknown>('/members/search', payload)
  const data: any = unwrapProfileResponse(response.data) as any
  if (Array.isArray(data)) return (data as any[]).map(normalizeMember)
  if (data && Array.isArray(data.results)) return (data.results as any[]).map(normalizeMember)
  return []
}

export async function getCurrentMember(member_id: string): Promise<Member> {
  return getMember(member_id)
}

export async function getMemberProfile(memberId: string): Promise<Member> {
  return getMember(memberId)
}

/** Typed helper for profile-page updates that map 1:1 onto ProfileData (local mode). */
export async function updateProfileData(member_id: string, fields: Partial<ProfileData>): Promise<ProfileData> {
  if (USE_MOCKS) {
    await delay(150)
    const state = useProfileStore.getState()
    if (member_id !== state.profile.member_id) {
      return Promise.reject({ status: 403, message: 'Cannot edit another profile locally.' })
    }
    state.patchProfile(fields)
    return useProfileStore.getState().profile
  }
  await apiClient.post('/members/update', { member_id, ...fields })
  return useProfileStore.getState().profile
}

export function logoutLocalProfile(): void {
  clearLocalCredentials()
}
