// ============================================
// INTEGRATION CONTRACT — Google Auth Bridge
// ============================================
// Current mode: MOCK-FIRST
// To integrate: preserve signature and swap API internals only.
//
// Endpoint:
//   POST /auth/google   → signInWithGoogle()
//   Request:  { access_token: string }
//   Response: { token: string, user: Member }
//
// Auth: returned token should be persisted by authStore
// ============================================

import { USE_MOCKS, apiClient, mockDelay } from './client'
import { requestGoogleAccessToken } from '../lib/googleIdentity'
import { createEmptyProfile, useProfileStore } from '../store/profileStore'
import type { Member } from '../types'

type AuthResponse = {
  token: string
  user: Member & { role?: 'member' | 'recruiter' }
}

type GoogleUserInfo = {
  id: string
  email: string
  name: string
  picture: string | null
}

async function fetchGoogleUserInfo(accessToken: string): Promise<GoogleUserInfo> {
  const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!response.ok) {
    throw new Error('Could not load your Google profile. Try again.')
  }
  const data = (await response.json()) as {
    id: string
    email: string
    name: string
    picture?: string
  }
  return {
    id: data.id,
    email: data.email,
    name: data.name,
    picture: data.picture ?? null,
  }
}

function memberFromGoogleInfo(info: GoogleUserInfo): Member & { role: 'member' } {
  const now = new Date().toISOString()
  return {
    member_id: `google-${info.id}`,
    email: info.email,
    full_name: info.name,
    headline: 'Member',
    bio: null,
    location: null,
    skills: [],
    profile_photo_url: info.picture,
    cover_photo_url: null,
    created_at: now,
    updated_at: now,
    role: 'member',
  }
}

/**
 * Google account chooser + token + session (mock or real API).
 */
export async function signInWithGoogle(): Promise<AuthResponse> {
  const accessToken = await requestGoogleAccessToken()
  const info = await fetchGoogleUserInfo(accessToken)

  if (USE_MOCKS) {
    await mockDelay()
    const names = info.name.trim().split(/\s+/)
    const first_name = names[0] ?? ''
    const last_name = names.slice(1).join(' ')
    const member_id = `google-${info.id}`
    const { patchProfile, initializeProfile } = useProfileStore.getState()
    const current = useProfileStore.getState().profile
    if (current.member_id === member_id) {
      patchProfile({
        email: info.email,
        first_name,
        last_name,
        profile_photo_url: info.picture ?? current.profile_photo_url,
      })
    } else {
      initializeProfile(
        createEmptyProfile({
          member_id,
          email: info.email,
          first_name,
          last_name,
          headline: '',
          profile_photo_url: info.picture ?? '',
        }),
      )
    }
    return {
      token: `mock-google-${info.id}`,
      user: memberFromGoogleInfo(info),
    }
  }

  const { data } = await apiClient.post<AuthResponse>('/auth/google', { access_token: accessToken })
  return data
}

export { MISSING_GOOGLE_CLIENT_ID } from '../lib/googleIdentity'
