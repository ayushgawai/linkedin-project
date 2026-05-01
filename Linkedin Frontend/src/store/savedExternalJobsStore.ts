import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type SavedExternalState = {
  savedIds: string[]
  toggle: (id: string) => void
  isSaved: (id: string) => boolean
}

export const useSavedExternalJobsStore = create<SavedExternalState>()(
  persist(
    (set, get) => ({
      savedIds: [],
      toggle: (id) => {
        const { savedIds } = get()
        if (savedIds.includes(id)) {
          set({ savedIds: savedIds.filter((x) => x !== id) })
        } else {
          set({ savedIds: [...savedIds, id] })
        }
      },
      isSaved: (id) => get().savedIds.includes(id),
    }),
    { name: 'linkedin-external-saved-jobs' },
  ),
)
