import type { TechNewsListItem } from '../api/external/adapters'

/** Google-hosted favicon for a hostname (img-friendly, no CORS issues for <img>). */
function faviconUrlForHostname(host: string): string {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=128`
}

function hostnameFromStoryUrl(url: string): string | null {
  try {
    return new URL(url).hostname
  } catch {
    return null
  }
}

/**
 * HN (Algolia) does not return hero images. Dev.to does (coverImage).
 * For stories without a cover, we show the destination site's favicon so the
 * header is not a blank gradient.
 */
export function getNewsCardHeaderVisual(
  item: TechNewsListItem,
): { kind: 'cover'; url: string } | { kind: 'favicon'; url: string; host: string } {
  if (item.coverImage) {
    return { kind: 'cover', url: item.coverImage }
  }
  const host = hostnameFromStoryUrl(item.url) ?? 'news.ycombinator.com'
  return { kind: 'favicon', url: faviconUrlForHostname(host), host }
}
