import type { HTMLAttributes } from 'react'
import { cn } from '../../lib/cn'

type BadgeVariant = 'default' | 'brand' | 'success' | 'danger' | 'neutral'

const variantClasses: Record<BadgeVariant, string> = {
  default: 'bg-black/5 text-text-secondary',
  brand: 'bg-brand-primary/10 text-brand-primary',
  success: 'bg-success/10 text-success',
  danger: 'bg-danger/10 text-danger',
  neutral: 'bg-[#EDEBE9] text-text-primary',
}

type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  variant?: BadgeVariant
}

export function Badge({ className, variant = 'default', ...props }: BadgeProps): JSX.Element {
  return (
    <span
      className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', variantClasses[variant], className)}
      {...props}
    />
  )
}
