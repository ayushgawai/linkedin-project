export interface Speaker {
  member_id: string
  name: string
  headline: string
  avatar?: string
}

export interface Event {
  id: string
  coverImage?: string
  eventType: 'online' | 'in_person'
  eventFormat: string
  eventName: string
  timezone: string
  startDate: string
  startTime: string
  endDate?: string
  endTime?: string
  description?: string
  speakers: Speaker[]
  createdBy: string
  createdAt: string
  attendees: string[]
}
