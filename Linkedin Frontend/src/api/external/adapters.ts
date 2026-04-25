import type { NewsContentSource } from '../../lib/newsSourceDisplay'
import type { JobRecord } from '../../types/jobs'
import type { ArbeitnowJob, DevToArticle, HNHit, RemotiveJob } from './types'

export type TechNewsListItem = {
  id: string
  source: NewsContentSource
  title: string
  url: string
  author: string
  createdAt: string
  points?: number
  commentsCount?: number
  coverImage?: string | null
  readTime?: number
  tags?: string[]
  score?: number
}

const hnItemUrl = (hit: HNHit): string => {
  if (hit.url && hit.url.length > 0) return hit.url
  return `https://news.ycombinator.com/item?id=${hit.objectID}`
}

export function hackerNewsHitToTechNewsItem(hit: HNHit): TechNewsListItem {
  return {
    id: `hn-${hit.objectID}`,
    source: 'hn',
    title: hit.title,
    url: hnItemUrl(hit),
    author: hit.author,
    createdAt: hit.created_at,
    points: hit.points,
    commentsCount: hit.num_comments,
    score: hit.points,
  }
}

export function devToArticleToTechNewsItem(article: DevToArticle): TechNewsListItem {
  return {
    id: `devto-${article.id}`,
    source: 'devto',
    title: article.title,
    url: article.url,
    author: article.user.name || article.user.username,
    createdAt: article.published_at,
    coverImage: article.social_image || article.cover_image,
    readTime: article.reading_time_minutes,
    tags: String(article.tag_list ?? '')
      .split(/\s+/)
      .map((s) => s.replace(/^#/, ''))
      .filter(Boolean)
      .slice(0, 6),
  }
}

const norm = (s: string): string => s.toLowerCase().replace(/[^a-z]+/g, ' ').trim()

function mapEmploymentType(raw: string): JobRecord['employment_type'] {
  const s = norm(raw)
  if (s.includes('part')) return 'part_time'
  if (s.includes('contract') || s.includes('contractor')) return 'contract'
  if (s.includes('intern')) return 'internship'
  if (s.includes('temporary') || s.includes('temp')) return 'temporary'
  return 'full_time'
}

function postedAgoFromDate(iso: string): string {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T12:00:00.000Z`) : new Date(iso)
  if (Number.isNaN(d.getTime())) return 'recently'
  const diff = Date.now() - d.getTime()
  const m = Math.floor(diff / 60_000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 48) return `${h}h`
  const days = Math.floor(h / 24)
  if (days < 14) return `${days}d`
  return `${Math.floor(days / 7)}w`
}

const tagsArray = (t: string | string[] | null | undefined): string[] => {
  if (t == null) return []
  if (Array.isArray(t)) return t.map(String)
  return t.split(/[,;]/).map((x) => x.trim()).filter(Boolean)
}

export function remotiveJobToJobRecord(job: RemotiveJob): JobRecord {
  return {
    job_id: `remotive-${job.id}`,
    recruiter_id: 'external',
    title: job.title,
    company_name: job.company_name,
    company_logo_url: job.company_logo || null,
    description: job.description ?? 'Remote role listed on Remotive (external).',
    location: job.candidate_required_location || 'Worldwide (remote)',
    work_mode: 'remote',
    employment_type: mapEmploymentType(job.job_type),
    industry: job.category || 'Software',
    easy_apply: false,
    promoted: false,
    posted_time_ago: postedAgoFromDate(job.publication_date),
    applicants_count: 0,
    views_count: 0,
    skills_required: tagsArray(job.tags as string | string[] | null).slice(0, 8),
    connections_count: 0,
    followers_count: 0,
    company_size: '—',
    company_about: 'External listing (Remotive).',
    is_external: true,
    external_url: job.url,
    source: 'remotive',
  }
}

export function arbeitnowJobToJobRecord(job: ArbeitnowJob): JobRecord {
  return {
    job_id: `arbeitnow-${job.slug}`.replace(/[^a-z0-9-_.]/gi, '-'),
    recruiter_id: 'external',
    title: job.title,
    company_name: job.company_name,
    company_logo_url: null,
    description: job.description ?? 'External job from Arbeitnow.',
    location: job.location || (job.remote ? 'Remote' : '—'),
    work_mode: job.remote ? 'remote' : 'hybrid',
    employment_type: (job.job_types && job.job_types[0] ? mapEmploymentType(job.job_types[0]) : 'full_time') as JobRecord['employment_type'],
    industry: 'Software',
    easy_apply: false,
    promoted: false,
    posted_time_ago: postedAgoFromDate(job.created_at),
    applicants_count: 0,
    views_count: 0,
    skills_required: (job.tags ?? []).slice(0, 8),
    connections_count: 0,
    followers_count: 0,
    company_size: '—',
    company_about: 'External listing (Arbeitnow).',
    is_external: true,
    external_url: job.url,
    source: 'arbeitnow',
  }
}
