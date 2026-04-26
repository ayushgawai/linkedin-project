import { getExternal } from './client'
import { VITE_REMOTIVE_API_BASE, isExternalDataEnabled } from './config'
import type { RemotiveRemoteJobsResponse } from './types'
import { MOCK_REMOTIVE_RESPONSE } from './mocks'

const base = (): string => VITE_REMOTIVE_API_BASE.replace(/\/?$/, '/')

export async function getRemoteDevJobs(limit = 20, category = 'software-dev'): Promise<RemotiveRemoteJobsResponse> {
  if (!isExternalDataEnabled()) {
    return { ...MOCK_REMOTIVE_RESPONSE, jobs: MOCK_REMOTIVE_RESPONSE.jobs.slice(0, limit) }
  }
  const u = new URL('remote-jobs', base())
  u.searchParams.set('category', category)
  u.searchParams.set('limit', String(limit))
  return getExternal<RemotiveRemoteJobsResponse>(u.toString())
}
