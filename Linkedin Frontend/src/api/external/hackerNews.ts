import { getExternal } from './client'
import { VITE_HN_API_BASE, isExternalDataEnabled } from './config'
import type { HNSearchResponse, HNSearchByDateResponse } from './types'
import { MOCK_HN_FOR_RAIL } from './mocks'

const base = (): string => VITE_HN_API_BASE.replace(/\/?$/, '/')

function searchUrl(
  name: 'search' | 'search_by_date',
  params: Record<string, string | number | undefined>,
): string {
  const u = new URL(name, base())
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined) continue
    u.searchParams.set(k, String(v))
  }
  return u.toString()
}

/** Alias: live front-page HN stories (per Algolia HN public API). */
export async function getTopStories(hits = 10): Promise<HNSearchResponse> {
  return getTopFrontPageStories(hits)
}

export async function getTopFrontPageStories(hits = 10): Promise<HNSearchResponse> {
  if (!isExternalDataEnabled()) {
    return { ...MOCK_HN_FOR_RAIL, hits: MOCK_HN_FOR_RAIL.hits.slice(0, Math.min(hits, MOCK_HN_FOR_RAIL.hits.length)) }
  }
  const url = searchUrl('search', { tags: 'front_page', hitsPerPage: hits })
  return getExternal<HNSearchResponse>(url)
}

export type NewsSearchTab = 'top' | 'latest' | 'software' | 'ai' | 'startups'

export async function getStoriesForTab(tab: NewsSearchTab, page: number, hits = 20): Promise<HNSearchResponse> {
  if (!isExternalDataEnabled()) {
    return { ...MOCK_HN_FOR_RAIL, page, hitsPerPage: hits, nbPages: 2 }
  }
  if (tab === 'top') {
    return getExternal<HNSearchResponse>(searchUrl('search', { tags: 'front_page', hitsPerPage: hits, page }))
  }
  if (tab === 'latest') {
    return getExternal<HNSearchByDateResponse>(searchUrl('search_by_date', { tags: 'story', hitsPerPage: hits, page }))
  }
  const queries: Record<Exclude<NewsSearchTab, 'top' | 'latest'>, string> = {
    software: 'software engineering',
    ai: 'artificial intelligence',
    startups: 'startups',
  }
  return getExternal<HNSearchResponse>(searchUrl('search', { query: queries[tab as keyof typeof queries], tags: 'story', hitsPerPage: hits, page }))
}
