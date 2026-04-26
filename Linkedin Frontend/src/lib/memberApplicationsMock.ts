import type { MemberApplication, MemberApplicationBackendStatus } from '../types/tracker'

const COMPANIES = [
  'Cadence Systems',
  'MegaCorp',
  'RocketLab',
  'TechBridge',
  'NovaSoft',
  'DataForge',
  'CloudNine',
  'QuantumLeap',
  'NeuralNet Inc',
  'ByteWorks',
] as const

const TITLES = [
  'AI Intern (Summer 2026)',
  'ML Engineer — New Grad',
  'Software Engineer Intern',
  'Data Analyst',
  'Full Stack Developer',
  'Backend Engineer',
  'Frontend Engineer',
  'Applied Scientist Intern',
  'Data Engineer',
  'Security Engineer',
  'DevOps Intern',
  'Product Engineer',
] as const

const LOCATIONS = [
  'San Jose, CA',
  'San Francisco, CA',
  'Seattle, WA',
  'Austin, TX',
  'New York, NY',
  'Remote',
  'Chicago, IL',
] as const

const AVATAR_POOL = [
  'https://picsum.photos/seed/c1/64/64',
  'https://picsum.photos/seed/c2/64/64',
  'https://picsum.photos/seed/c3/64/64',
  'https://picsum.photos/seed/c4/64/64',
  'https://picsum.photos/seed/c5/64/64',
]

function mulberry32(seed: number): () => number {
  return () => {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 25 applied, 8 interview, 7 rejected — per spec. */
export function generateMockMemberApplications(member_id: string): MemberApplication[] {
  const rand = mulberry32(20260211)

  const statuses: MemberApplicationBackendStatus[] = [
    ...Array.from({ length: 21 }, () => 'submitted' as const),
    ...Array.from({ length: 4 }, () => 'under_review' as const),
    ...Array.from({ length: 6 }, () => 'interview' as const),
    ...Array.from({ length: 2 }, () => 'offer' as const),
    ...Array.from({ length: 4 }, () => 'rejected' as const),
    ...Array.from({ length: 3 }, () => 'rejected' as const),
  ]

  // Rejected from: 4 from applied path, 3 from interview path
  const rejectedFrom: Array<'submitted' | 'interview' | undefined> = [
    'submitted',
    'submitted',
    'submitted',
    'submitted',
    'interview',
    'interview',
    'interview',
  ]

  let rejectedIdx = 0
  const apps: MemberApplication[] = statuses.map((status, index) => {
    const company = COMPANIES[index % COMPANIES.length]
    const title = TITLES[index % TITLES.length]
    const location = LOCATIONS[index % LOCATIONS.length]
    const work_mode = (['remote', 'hybrid', 'onsite'] as const)[index % 3]!
    const daysAgo = 1 + Math.floor(rand() * 60)
    const posted = new Date(Date.now() - daysAgo * 86400000).toISOString()
    const applied = new Date(Date.now() - (index % 30) * 3600000 * (1 + (rand() * 2))).toISOString()
    const listing_status = index % 7 === 0 ? 'closed' : 'open'
    const reposted_at = index % 11 === 0 ? new Date(Date.now() - 3 * 86400000).toISOString() : null

    let rejected_from: 'submitted' | 'interview' | undefined
    if (status === 'rejected') {
      rejected_from = rejectedFrom[rejectedIdx] ?? 'submitted'
      rejectedIdx += 1
    }

    const nConn = Math.floor(rand() * 5)
    const connection_avatar_urls: string[] = []
    for (let i = 0; i < nConn; i++) {
      connection_avatar_urls.push(AVATAR_POOL[i % AVATAR_POOL.length]!)
    }

    return {
      application_id: `mock-app-${member_id}-${index + 1}`,
      job_id: `mock-job-${1000 + index}`,
      member_id,
      status,
      applied_at: applied,
      updated_at: applied,
      rejected_from,
      job: {
        title,
        company_name: company,
        company_logo_url: index % 3 === 0 ? `https://picsum.photos/seed/logo${index}/96/96` : null,
        location,
        work_mode,
        posted_at: posted,
        reposted_at,
        listing_status,
      },
      connection_avatar_urls,
    }
  })

  return apps.sort((a, b) => new Date(b.applied_at).getTime() - new Date(a.applied_at).getTime())
}
