import { getExternal } from './client'
import { VITE_ARBEITNOW_API_BASE, isExternalDataEnabled } from './config'
import type { ArbeitnowResponse } from './types'

const base = (): string => VITE_ARBEITNOW_API_BASE.replace(/\/?$/, '/')

const mockArbeit: ArbeitnowResponse = {
  data: [
    {
      slug: 'mock-an-1',
      company_name: 'Remote Labs',
      title: 'Backend engineer (go)',
      description: 'Mock arbeit when external is disabled.',
      remote: true,
      url: 'https://www.arbeitnow.com',
      tags: ['go', 'kubernetes'],
      job_types: ['Full-time'],
      location: 'EU remote',
      created_at: new Date().toISOString(),
    },
  ],
}

export async function getArbeitnowJobs(): Promise<ArbeitnowResponse> {
  if (!isExternalDataEnabled()) {
    return mockArbeit
  }
  const u = new URL('job-board-api', base())
  return getExternal<ArbeitnowResponse>(u.toString())
}
