import type { HTMLAttributes } from 'react'
import { cn } from '../../lib/cn'

type SkeletonVariant = 'text' | 'circle' | 'rect'

type SkeletonProps = HTMLAttributes<HTMLDivElement> & {
  variant?: SkeletonVariant
}

const variantClasses: Record<SkeletonVariant, string> = {
  text: 'h-4 w-full rounded',
  circle: 'h-10 w-10 rounded-full',
  rect: 'h-24 w-full rounded-md',
}

export function Skeleton({ className, variant = 'text', ...props }: SkeletonProps): JSX.Element {
  return <div className={cn('animate-pulse bg-black/10', variantClasses[variant], className)} aria-hidden {...props} />
}
