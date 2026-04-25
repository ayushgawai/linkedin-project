import { getExternal } from './client'
import { VITE_DEVTO_API_BASE, isExternalDataEnabled } from './config'
import type { DevToArticle } from './types'
import { MOCK_DEVTO } from './mocks'

const base = (): string => VITE_DEVTO_API_BASE.replace(/\/?$/, '/')

function articlesUrl(params: Record<string, string | number | undefined>): string {
  const u = new URL('articles', base())
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined) continue
    u.searchParams.set(k, String(v))
  }
  return u.toString()
}

export async function getTopArticles(periodDays = 7, per = 10): Promise<DevToArticle[]> {
  if (!isExternalDataEnabled()) {
    return MOCK_DEVTO
  }
  return getExternal<DevToArticle[]>(articlesUrl({ per_page: per, top: periodDays }))
}

export async function getArticlesForPage(per = 20, page = 1): Promise<DevToArticle[]> {
  if (!isExternalDataEnabled()) {
    return MOCK_DEVTO
  }
  return getExternal<DevToArticle[]>(articlesUrl({ per_page: per, page }))
}
