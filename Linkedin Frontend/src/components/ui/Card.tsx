import { forwardRef } from 'react'
import type { HTMLAttributes } from 'react'
import { cn } from '../../lib/cn'

type CardVariant = 'default' | 'raised' | 'flat'

const variantClasses: Record<CardVariant, string> = {
  default: 'border border-border bg-surface-raised',
  raised: 'border border-border bg-surface-raised transition hover:shadow-sm',
  flat: 'border-0 bg-transparent',
}

type CardProps = HTMLAttributes<HTMLDivElement> & {
  variant?: CardVariant
}

const Root = forwardRef<HTMLDivElement, CardProps>(function Card(
  { className, variant = 'default', ...props },
  ref,
) {
  return <div ref={ref} className={cn('rounded-lg', variantClasses[variant], className)} {...props} />
})

const Header = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function CardHeader({ className, ...props }, ref) {
  return <div ref={ref} className={cn('px-4 py-3', className)} {...props} />
})

const Body = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function CardBody({ className, ...props }, ref) {
  return <div ref={ref} className={cn('px-4 py-3', className)} {...props} />
})

const Footer = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function CardFooter({ className, ...props }, ref) {
  return <div ref={ref} className={cn('px-4 py-3', className)} {...props} />
})

const Divider = forwardRef<HTMLHRElement, HTMLAttributes<HTMLHRElement>>(function CardDivider({ className, ...props }, ref) {
  return <hr ref={ref} className={cn('border-0 border-t border-border', className)} {...props} />
})

export const Card = Object.assign(Root, { Header, Body, Footer, Divider })
