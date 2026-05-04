// Shared API client.
//
// This repo defaults to real backend calls. A demo-data mode is still supported
// for pages/features that aren't wired yet, but production/local correctness
// should always prefer the real backend.

import axios, { AxiosError } from 'axios'
import { useAuthStore } from '../store/authStore'
import type { ApiError } from '../types'

export const USE_DEMO_DATA =
  import.meta.env.VITE_USE_DEMO_DATA === 'true' || import.meta.env.VITE_USE_MOCKS === 'true'

// Back-compat export (older modules still import this name).
export const USE_MOCKS = USE_DEMO_DATA

export async function mockDelay(ms = 250): Promise<void> {
  await new Promise((resolve) => window.setTimeout(resolve, ms))
}

/** Without this, missing `.env.local` makes `baseURL` undefined and requests hit Vite (5173) instead of the API gateway — login/signup appear broken. */
function resolveApiBaseUrl(): string {
  const raw = import.meta.env.VITE_API_BASE_URL
  if (typeof raw === 'string' && raw.trim()) return raw.trim().replace(/\/+$/, '')
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.warn(
      '[api] VITE_API_BASE_URL is unset — using http://127.0.0.1:8011. Copy Linkedin Frontend/.env.example to .env.local or set VITE_API_BASE_URL.',
    )
    return 'http://127.0.0.1:8011'
  }
  return ''
}

export const apiClient = axios.create({
  baseURL: resolveApiBaseUrl(),
  headers: {
    'Content-Type': 'application/json',
  },
})

/** Services return `{ success, data }`. The API Gateway often forwards only `data`. Support both. */
export function unwrapApiData<T>(body: unknown): T {
  if (
    body !== null &&
    typeof body === 'object' &&
    'success' in body &&
    (body as { success?: boolean }).success === true &&
    'data' in body
  ) {
    return (body as { data: T }).data
  }
  return body as T
}

apiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

function pickApiErrorMessage(data: unknown): string | undefined {
  if (!data || typeof data !== 'object') return undefined
  const d = data as Record<string, unknown>
  if (typeof d.message === 'string' && d.message.trim()) return d.message
  const nested = d.error
  if (nested && typeof nested === 'object') {
    const e = nested as Record<string, unknown>
    if (typeof e.message === 'string' && e.message.trim()) return e.message
    const det = e.details
    if (det && typeof det === 'object' && Array.isArray((det as { issues?: unknown }).issues)) {
      const arr = (det as { issues: Array<{ path?: string; message?: string }> }).issues
      if (arr[0]?.message) return arr[0].message
    }
  }
  const issues = d.details
  if (Array.isArray(issues)) {
    const first = issues[0] as { path?: string; message?: string } | undefined
    if (first && typeof first.message === 'string') return first.message
  }
  return undefined
}

apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    const status = error.response?.status ?? 500

    if (status === 401) {
      useAuthStore.getState().clearAuth()
      if (window.location.pathname !== '/login') {
        window.location.assign('/login')
      }
    }

    const fromBody = pickApiErrorMessage(error.response?.data)

    const apiError: ApiError = {
      status,
      message: fromBody ?? error.message ?? 'Unexpected API error',
      details: error.response?.data,
    }

    return Promise.reject(apiError)
  },
)
