import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Member } from '../types'

type AuthState = {
  token: string | null
  user: (Member & { role?: 'member' | 'recruiter' }) | null
  setAuth: (token: string, user: Member & { role?: 'member' | 'recruiter' }) => void
  setUser: (user: Member & { role?: 'member' | 'recruiter' }) => void
  clearAuth: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      setAuth: (token, user) => set({ token, user }),
      setUser: (user) => set((state) => ({ token: state.token, user })),
      clearAuth: () => set({ token: null, user: null }),
    }),
    {
      name: 'linkedin-auth-store',
      version: 2,
      migrate: () => ({ token: null, user: null }),
      partialize: (state) => ({ token: state.token, user: state.user }),
    },
  ),
)
