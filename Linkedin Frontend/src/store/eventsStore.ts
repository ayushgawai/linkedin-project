import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Event } from '../types/event'

type EventsState = {
  events: Event[]
  addEvent: (event: Event) => void
  updateEvent: (eventId: string, patch: Partial<Event>) => void
  deleteEvent: (eventId: string) => void
  attendEvent: (eventId: string, memberId: string) => void
  unattendEvent: (eventId: string, memberId: string) => void
}

const SEED_EVENTS: Event[] = [
  {
    id: 'ev-seed-1',
    eventType: 'online',
    eventFormat: 'Workshop',
    eventName: 'What to Post on LinkedIn in 2026',
    timezone: '(UTC-07:00) Pacific Time',
    startDate: '2026-04-23',
    startTime: '11:00 AM',
    endDate: '2026-04-23',
    endTime: '12:00 PM',
    description: 'Practical strategies and examples for creators and engineering leaders.',
    speakers: [],
    createdBy: 'seed-member-1',
    createdAt: new Date().toISOString(),
    attendees: Array.from({ length: 12 }).map((_, i) => `seed-member-${i + 1}`),
  },
]

export const useEventsStore = create<EventsState>()(
  persist(
    (set) => ({
      events: SEED_EVENTS,
      addEvent: (event) => set((state) => ({ events: [event, ...state.events] })),
      updateEvent: (eventId, patch) =>
        set((state) => ({
          events: state.events.map((item) => (item.id === eventId ? { ...item, ...patch } : item)),
        })),
      deleteEvent: (eventId) => set((state) => ({ events: state.events.filter((item) => item.id !== eventId) })),
      attendEvent: (eventId, memberId) =>
        set((state) => ({
          events: state.events.map((item) =>
            item.id === eventId && !item.attendees.includes(memberId)
              ? { ...item, attendees: [...item.attendees, memberId] }
              : item,
          ),
        })),
      unattendEvent: (eventId, memberId) =>
        set((state) => ({
          events: state.events.map((item) =>
            item.id === eventId ? { ...item, attendees: item.attendees.filter((id) => id !== memberId) } : item,
          ),
        })),
    }),
    { name: 'community-events-v1' },
  ),
)
