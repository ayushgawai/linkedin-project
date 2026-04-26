import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type State = {
  hiddenApplicationIds: string[]
  hide: (applicationId: string) => void
  unhide: (applicationId: string) => void
  isHidden: (applicationId: string) => boolean
}

export const useTrackerHiddenStore = create<State>()(
  persist(
    (set, get) => ({
      hiddenApplicationIds: [],
      hide: (applicationId) => {
        set((s) =>
          s.hiddenApplicationIds.includes(applicationId)
            ? s
            : { hiddenApplicationIds: [...s.hiddenApplicationIds, applicationId] },
        )
      },
      unhide: (applicationId) => {
        set((s) => ({ hiddenApplicationIds: s.hiddenApplicationIds.filter((id) => id !== applicationId) }))
      },
      isHidden: (applicationId) => get().hiddenApplicationIds.includes(applicationId),
    }),
    { name: 'app-job-tracker-hidden-v1' },
  ),
)
