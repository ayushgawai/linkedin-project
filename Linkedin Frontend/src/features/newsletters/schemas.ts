import { z } from 'zod'

export const createNewsletterSchema = z.object({
  title: z.string().min(1, 'Title is required').max(120, 'Maximum 120 characters'),
  description: z.string().min(1, 'Description is required').max(300, 'Maximum 300 characters'),
  frequency: z.enum(['daily', 'weekly', 'biweekly', 'monthly']),
})

export type CreateNewsletterValues = z.infer<typeof createNewsletterSchema>
