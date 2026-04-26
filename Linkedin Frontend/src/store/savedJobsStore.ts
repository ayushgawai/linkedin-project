import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { JobRecord } from '../types/jobs'

export type SavedJobEntry = {
  job: JobRecord
  savedAt: string
}

type SavedJobsState = {
  entries: SavedJobEntry[]
  save: (job: JobRecord) => void
  remove: (jobId: string) => void
  isSaved: (jobId: string) => boolean
}

function sortBySavedAtDesc(a: SavedJobEntry, b: SavedJobEntry): number {
  return new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime()
}

export const useSavedJobsStore = create<SavedJobsState>()(
  persist(
    (set, get) => ({
      entries: [],
      save: (job) => {
        const savedAt = new Date().toISOString()
        set((state) => {
          const next = state.entries.filter((e) => e.job.job_id !== job.job_id)
          next.push({ job, savedAt })
          next.sort(sortBySavedAtDesc)
          return { entries: next }
        })
      },
      remove: (jobId) => set((state) => ({ entries: state.entries.filter((e) => e.job.job_id !== jobId) })),
      isSaved: (jobId) => get().entries.some((e) => e.job.job_id === jobId),
    }),
    { name: 'app-saved-jobs-v1' },
  ),
)
