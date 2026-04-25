import type { Post } from './feed'

export type SavedPostEntry = {
  post: Post
  savedAt: string
  /** External article URL (e.g. dev.to) */
  externalUrl?: string
}
