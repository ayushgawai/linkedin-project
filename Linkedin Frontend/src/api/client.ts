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

function resolveApiBaseUrl(): string {
  const configured = String(import.meta.env.VITE_API_BASE_URL ?? '').trim()
  if (configured) return configured
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin
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

    const apiError: ApiError = {
      status,
      message:
        (error.response?.data as { message?: string } | undefined)?.message ??
        error.message ??
        'Unexpected API error',
      details: error.response?.data,
    }

    return Promise.reject(apiError)
  },
)
