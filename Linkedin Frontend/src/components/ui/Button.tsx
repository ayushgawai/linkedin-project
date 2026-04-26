import { cloneElement, forwardRef, isValidElement } from 'react'
import type { ButtonHTMLAttributes, ReactElement, ReactNode } from 'react'
import { cn } from '../../lib/cn'
import { Spinner } from './Spinner'

type ButtonVariant = 'primary' | 'secondary' | 'tertiary' | 'destructive'
type ButtonSize = 'sm' | 'md' | 'lg'

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-brand-primary text-white hover:bg-brand-primary-hover',
  secondary: 'border border-brand-primary text-brand-primary hover:bg-brand-primary/10',
  tertiary: 'text-text-secondary hover:bg-black/5',
  destructive: 'border border-danger text-danger hover:bg-danger/10',
}

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'px-3 py-1 text-xs',
  md: 'px-4 py-1.5 text-sm',
  lg: 'px-5 py-2 text-base',
}

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  leftIcon?: ReactNode
  rightIcon?: ReactNode
  fullWidth?: boolean
  asChild?: boolean
  square?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    className,
    variant = 'primary',
    size = 'md',
    loading = false,
    leftIcon,
    rightIcon,
    fullWidth = false,
    asChild = false,
    square = false,
    children,
    disabled,
    ...props
  },
  ref,
) {
  const isDisabled = disabled || loading
  const classes = cn(
    'inline-flex items-center justify-center gap-2 font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60',
    variantClasses[variant],
    sizeClasses[size],
    square ? 'rounded-md' : 'rounded-full',
    fullWidth && 'w-full',
    className,
  )

  const content = (
    <>
      {loading ? <Spinner size="sm" className="text-current" /> : leftIcon ? <span aria-hidden>{leftIcon}</span> : null}
      <span>{children}</span>
      {!loading && rightIcon ? <span aria-hidden>{rightIcon}</span> : null}
    </>
  )

  if (asChild && isValidElement(children)) {
    const child = children as ReactElement<{ className?: string }>
    return cloneElement(child, {
      className: cn(child.props.className, classes),
    })
  }

  return (
    <button ref={ref} className={classes} disabled={isDisabled} {...props}>
      {content}
    </button>
  )
})
