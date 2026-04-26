import { z } from 'zod'

export const loginSchema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/\d/, 'Password must include at least 1 number'),
})

export const signupStep1Schema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/\d/, 'Password must include at least 1 number'),
})

export const signupStep2Schema = z.object({
  firstName: z
    .string()
    .min(2, 'First name must be at least 2 characters')
    .regex(/^[A-Za-z]+$/, 'First name can only contain letters'),
  lastName: z
    .string()
    .min(2, 'Last name must be at least 2 characters')
    .regex(/^[A-Za-z]+$/, 'Last name can only contain letters'),
})

export const signupStep3Schema = z.object({
  location: z.string().min(1, 'Location is required'),
  headline: z.string().optional(),
  role: z.enum(['member', 'recruiter']),
})

export const signupSchema = signupStep1Schema.merge(signupStep2Schema).merge(signupStep3Schema)

export type LoginFormValues = z.infer<typeof loginSchema>
export type SignupFormValues = z.infer<typeof signupSchema>
export type SignupStep1Values = z.infer<typeof signupStep1Schema>
export type SignupStep2Values = z.infer<typeof signupStep2Schema>
export type SignupStep3Values = z.infer<typeof signupStep3Schema>
