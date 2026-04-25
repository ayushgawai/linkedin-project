// ============================================
// INTEGRATION CONTRACT — Shared API Client
// ============================================
// Current mode: MOCK-FIRST (VITE_USE_MOCKS=true by default)
// To integrate: keep this file and swap function bodies in src/api/*.ts modules.
//
// Behavior:
// - USE_MOCKS controls whether API modules return local mock data.
// - mockDelay() simulates network latency for loading states.
// - apiClient injects Bearer token from authStore.
// - 401 responses clear auth and redirect to /login.
// ============================================

import axios, { AxiosError } from 'axios'
import { useAuthStore } from '../store/authStore'
import type { ApiError } from '../types'

export const USE_MOCKS = import.meta.env.VITE_USE_MOCKS === 'true'

export async function mockDelay(ms = 250): Promise<void> {
  await new Promise((resolve) => window.setTimeout(resolve, ms))
}

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

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
