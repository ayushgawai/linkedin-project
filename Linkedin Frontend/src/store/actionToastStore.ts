import { create } from 'zustand'

export type ActionToastIcon =
  | 'success'
  | 'info'
  | 'warning'
  | 'connection'
  | 'saved'
  | 'applied'
  | 'interview'
  | 'rejected'
  | 'message'
  | 'ai'

export interface ActionToastItem {
  id: string
  icon: ActionToastIcon
  message: string
  linkText?: string
  linkTo?: string
  timestamp: number
  duration?: number
  dismissible?: boolean
  exiting?: boolean
  resumeToken?: number
  flashUntil?: number
}

export type ActionToastAddInput = Omit<ActionToastItem, 'id' | 'timestamp' | 'exiting' | 'resumeToken' | 'flashUntil'>

function dedupeKey(message: string, linkTo?: string): string {
  return `${message}||${linkTo ?? ''}`
}

interface ActionToastStore {
  toasts: ActionToastItem[]
  history: ActionToastItem[]
  addToast: (toast: ActionToastAddInput) => void
  dismissToast: (id: string) => void
  purgeToast: (id: string) => void
  clearAll: () => void
}

export const useActionToastStore = create<ActionToastStore>((set, get) => ({
  toasts: [],
  history: [],

  addToast: (input) => {
    const now = Date.now()
    const duration = input.duration ?? 6000
    const dismissible = input.dismissible !== false
    const key = dedupeKey(input.message, input.linkTo)

    const { toasts, history } = get()
    const dup = toasts.find((t) => dedupeKey(t.message, t.linkTo) === key)
    if (dup) {
      set({
        toasts: toasts.map((t) =>
          t.id === dup.id
            ? {
                ...t,
                resumeToken: (t.resumeToken ?? 0) + 1,
                flashUntil: now + 300,
                duration,
                dismissible,
              }
            : t,
        ),
      })
      return
    }

    const id = crypto.randomUUID()
    const item: ActionToastItem = {
      id,
      icon: input.icon,
      message: input.message,
      linkText: input.linkText,
      linkTo: input.linkTo,
      timestamp: now,
      duration,
      dismissible,
      exiting: false,
      resumeToken: 0,
    }

    let nextToasts = [item, ...toasts]
    if (nextToasts.length > 4) {
      nextToasts = nextToasts.slice(0, 4)
    }

    set({
      toasts: nextToasts,
      history: [...history, { ...item }],
    })
  },

  dismissToast: (id) => {
    const { toasts } = get()
    const t = toasts.find((x) => x.id === id)
    if (!t || t.exiting) return
    set({ toasts: toasts.map((x) => (x.id === id ? { ...x, exiting: true } : x)) })
  },

  purgeToast: (id) => {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
  },

  clearAll: () => {
    set({ toasts: [] })
  },
}))
