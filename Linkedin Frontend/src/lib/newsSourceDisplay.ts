/** Internal slugs for external news feeds (not shown verbatim in the UI). */
export type NewsContentSource = 'hn' | 'devto'

const SOURCE_LABEL: Record<NewsContentSource, string> = {
  hn: 'Tech pulse',
  devto: 'Build & learn',
}

/** Accepts slugs or legacy adapter strings (e.g. cached pages). */
export function getNewsSourceLabel(source: NewsContentSource | string): string {
  if (source === 'hn' || source === 'Hacker News') return SOURCE_LABEL.hn
  if (source === 'devto' || source === 'Dev.to') return SOURCE_LABEL.devto
  return SOURCE_LABEL[source as NewsContentSource] ?? 'Tech pulse'
}

export function isHnNewsSource(source: NewsContentSource | string): boolean {
  return source === 'hn' || source === 'Hacker News'
}

/** Page subtitle for /news (no API vendor names). */
export const NEWS_PAGE_SUBTITLE = 'Industry headlines and community articles.'
