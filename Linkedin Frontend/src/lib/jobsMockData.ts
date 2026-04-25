import type { JobRecord } from '../types/jobs'

export const MOCK_JOBS: JobRecord[] = Array.from({ length: 80 }).map((_, index) => ({
  job_id: `job-${index + 1}`,
  recruiter_id: `rec-${(index % 7) + 1}`,
  title: ['Frontend Engineer', 'Backend Engineer', 'Product Designer', 'Data Engineer', 'Full Stack Engineer'][index % 5] ?? 'Software Engineer',
  company_name: ['Apex Labs', 'Nimbus AI', 'CloudMile', 'Futura Systems', 'VertexHQ'][index % 5] ?? 'Apex Labs',
  company_logo_url: null,
  description:
    'We are looking for a strong collaborator to build product features end-to-end. You will own delivery quality, work across services, and help improve system reliability at scale.',
  location: ['San Jose, CA', 'San Francisco, CA', 'New York, NY', 'Austin, TX', 'Remote'][index % 5] ?? 'San Jose, CA',
  work_mode: (['remote', 'hybrid', 'onsite'] as const)[index % 3] ?? 'hybrid',
  employment_type: (['full_time', 'part_time', 'contract', 'internship', 'temporary'] as const)[index % 5] ?? 'full_time',
  industry: ['Software', 'FinTech', 'HealthTech', 'EdTech', 'AI'][index % 5] ?? 'Software',
  easy_apply: index % 2 === 0,
  promoted: index % 6 === 0,
  posted_time_ago: ['2h', '6h', '1d', '2d', '3d'][index % 5] ?? '1d',
  applicants_count: 18 + (index % 45),
  views_count: 120 + index * 7,
  skills_required: ['React', 'TypeScript', 'System Design', 'Testing'],
  connections_count: index % 8,
  followers_count: 3000 + index * 13,
  company_size: ['51-200 employees', '201-500 employees', '500+ employees'][index % 3] ?? '201-500 employees',
  company_about: 'Modern product company building reliable software for global teams.',
}))
