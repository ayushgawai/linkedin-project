import type { MemberApplication } from '../types/tracker'

export type DatePostedOption = 'all' | '24h' | '7d' | '30d'

const MS: Record<Exclude<DatePostedOption, 'all'>, number> = {
  '24h': 86400000,
  '7d': 7 * 86400000,
  '30d': 30 * 86400000,
}

export function filterByDatePosted(apps: MemberApplication[], option: DatePostedOption): MemberApplication[] {
  if (option === 'all') {
    return apps
  }
  const windowMs = MS[option]
  const now = Date.now()
  return apps.filter((a) => {
    const t = new Date(a.job.posted_at).getTime()
    return !Number.isNaN(t) && now - t <= windowMs
  })
}
