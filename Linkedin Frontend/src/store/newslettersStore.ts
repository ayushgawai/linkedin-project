import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Newsletter } from '../types/newsletter'

type NewslettersState = {
  newsletters: Newsletter[]
  addNewsletter: (newsletter: Newsletter) => void
  updateNewsletter: (newsletterId: string, patch: Partial<Newsletter>) => void
  deleteNewsletter: (newsletterId: string) => void
}

const SEED_NEWSLETTERS: Newsletter[] = []

export const useNewslettersStore = create<NewslettersState>()(
  persist(
    (set) => ({
      newsletters: SEED_NEWSLETTERS,
      addNewsletter: (newsletter) => set((state) => ({ newsletters: [newsletter, ...state.newsletters] })),
      updateNewsletter: (newsletterId, patch) =>
        set((state) => ({
          newsletters: state.newsletters.map((item) => (item.id === newsletterId ? { ...item, ...patch } : item)),
        })),
      deleteNewsletter: (newsletterId) =>
        set((state) => ({ newsletters: state.newsletters.filter((item) => item.id !== newsletterId) })),
    }),
    { name: 'community-newsletters-v1' },
  ),
)
