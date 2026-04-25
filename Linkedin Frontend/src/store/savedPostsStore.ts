import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Post } from '../types/feed'
import type { SavedPostEntry } from '../types/saved'

type SavedPostsState = {
  entries: SavedPostEntry[]
  save: (post: Post, externalUrl?: string) => void
  remove: (postId: string) => void
  isSaved: (postId: string) => boolean
}

function sortBySavedAtDesc(a: SavedPostEntry, b: SavedPostEntry): number {
  return new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime()
}

export const useSavedPostsStore = create<SavedPostsState>()(
  persist(
    (set, get) => ({
      entries: [],
      save: (post, externalUrl) => {
        const savedAt = new Date().toISOString()
        set((s) => {
          const next = s.entries.filter((e) => e.post.post_id !== post.post_id)
          next.push({ post, savedAt, externalUrl: externalUrl || undefined })
          next.sort(sortBySavedAtDesc)
          return { entries: next }
        })
      },
      remove: (postId) => {
        set((s) => ({ entries: s.entries.filter((e) => e.post.post_id !== postId) }))
      },
      isSaved: (postId) => get().entries.some((e) => e.post.post_id === postId),
    }),
    { name: 'app-saved-posts-v1' },
  ),
)

export function isArticleEntry(entry: SavedPostEntry): boolean {
  return entry.post.media_type === 'article'
}
