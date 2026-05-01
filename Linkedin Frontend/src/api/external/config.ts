export const VITE_HN_API_BASE = import.meta.env.VITE_HN_API_BASE ?? 'https://hn.algolia.com/api/v1'
export const VITE_DEVTO_API_BASE = import.meta.env.VITE_DEVTO_API_BASE ?? 'https://dev.to/api'
export const VITE_REMOTIVE_API_BASE = import.meta.env.VITE_REMOTIVE_API_BASE ?? 'https://remotive.com/api'
export const VITE_ARBEITNOW_API_BASE = import.meta.env.VITE_ARBEITNOW_API_BASE ?? 'https://www.arbeitnow.com/api'

export const isExternalDataEnabled = (): boolean => {
  return import.meta.env.VITE_ENABLE_EXTERNAL_DATA !== 'false'
}
