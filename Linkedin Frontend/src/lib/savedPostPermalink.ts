import type { SavedPostEntry } from '../types/saved'

export function getSavedEntryPermalink(entry: SavedPostEntry): string {
  if (entry.externalUrl) {
    return entry.externalUrl
  }
  return `${window.location.origin}/feed?post=${encodeURIComponent(entry.post.post_id)}`
}

export function buildPostEmbedFragment(entry: SavedPostEntry): string {
  const href = getSavedEntryPermalink(entry)
  const title = entry.post.article_title ?? entry.post.content.slice(0, 80)
  return `<!-- ${title} -->\n<p><a href="${href}" target="_blank" rel="noopener noreferrer">View this post in the app</a></p>`
}
