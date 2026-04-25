import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type State = {
  notes: Record<string, string>
  setNote: (applicationId: string, text: string) => void
  deleteNote: (applicationId: string) => void
}

export const useTrackerNotesStore = create<State>()(
  persist(
    (set) => ({
      notes: {},
      setNote: (applicationId, text) => {
        set((s) => ({
          notes: { ...s.notes, [applicationId]: text.slice(0, 500) },
        }))
      },
      deleteNote: (applicationId) => {
        set((s) => {
          const next = { ...s.notes }
          delete next[applicationId]
          return { notes: next }
        })
      },
    }),
    { name: 'app-job-tracker-notes-v1' },
  ),
)
