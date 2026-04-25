import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type AdsState = {
  dismissedAdIds: string[]
  dismissAd: (id: string) => void
}

export const useAdsStore = create<AdsState>()(
  persist(
    (set) => ({
      dismissedAdIds: [],
      dismissAd: (id) =>
        set((s) => ({
          dismissedAdIds: s.dismissedAdIds.includes(id) ? s.dismissedAdIds : [...s.dismissedAdIds, id],
        })),
    }),
    { name: 'linkedin-curated-ads-dismissed' },
  ),
)
