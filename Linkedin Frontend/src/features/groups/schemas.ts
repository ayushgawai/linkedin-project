import { z } from 'zod'

export const createGroupSchema = z.object({
  name: z.string().min(1, 'Group name is required').max(100, 'Maximum 100 characters'),
  description: z.string().min(1, 'Description is required').max(2000, 'Maximum 2,000 characters'),
  location: z.string().max(200).optional(),
  rules: z.string().max(4000, 'Maximum 4,000 characters').optional(),
  groupType: z.enum(['public', 'private']),
})

export type CreateGroupValues = z.infer<typeof createGroupSchema>
