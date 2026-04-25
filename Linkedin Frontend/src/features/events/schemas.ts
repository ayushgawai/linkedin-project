import { z } from 'zod'

export const createEventSchema = z.object({
  eventType: z.enum(['online', 'in_person']),
  eventFormat: z.string().min(1, 'Event format is required'),
  eventName: z.string().min(1, 'Event name is required').max(75, 'Maximum 75 characters'),
  timezone: z.string().min(1, 'Timezone is required'),
  startDate: z.string().min(1, 'Start date is required'),
  startTime: z.string().min(1, 'Start time is required'),
  addEndDateTime: z.boolean(),
  endDate: z.string().optional(),
  endTime: z.string().optional(),
  description: z.string().max(5000, 'Maximum 5,000 characters').optional(),
})

export type CreateEventFormValues = z.infer<typeof createEventSchema>
