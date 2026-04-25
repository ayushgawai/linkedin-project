export interface Newsletter {
  id: string
  title: string
  description: string
  frequency: 'daily' | 'weekly' | 'biweekly' | 'monthly'
  logoImage?: string
  createdBy: string
  createdByName: string
  createdByHeadline: string
  createdByAvatar?: string
  createdAt: string
  subscriberCount: number
}
