export interface Group {
  id: string
  name: string
  description: string
  coverImage?: string
  logoImage?: string
  industry: string[]
  location?: string
  rules?: string
  groupType: 'public' | 'private'
  createdBy: string
  createdAt: string
  members: string[]
  memberCount: number
}
