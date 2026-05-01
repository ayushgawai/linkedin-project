import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Group } from '../types/group'

type GroupsState = {
  groups: Group[]
  addGroup: (group: Group) => void
  updateGroup: (groupId: string, patch: Partial<Group>) => void
  deleteGroup: (groupId: string) => void
}

const SEED_GROUPS: Group[] = [
  {
    id: 'grp-seed-1',
    name: 'Distributed Systems Engineers',
    description: 'A community for engineers working on scalable systems.',
    industry: ['Engineering'],
    groupType: 'public',
    createdBy: 'seed-member-3',
    createdAt: new Date().toISOString(),
    members: Array.from({ length: 89 }).map((_, i) => `seed-member-${i + 1}`),
    memberCount: 89230,
  },
]

export const useGroupsStore = create<GroupsState>()(
  persist(
    (set) => ({
      groups: SEED_GROUPS,
      addGroup: (group) =>
        set((state) => {
          const withoutSameId = state.groups.filter((g) => g.id !== group.id)
          return { groups: [group, ...withoutSameId] }
        }),
      updateGroup: (groupId, patch) =>
        set((state) => ({ groups: state.groups.map((g) => (g.id === groupId ? { ...g, ...patch } : g)) })),
      deleteGroup: (groupId) => set((state) => ({ groups: state.groups.filter((g) => g.id !== groupId) })),
    }),
    { name: 'community-groups-v1' },
  ),
)
