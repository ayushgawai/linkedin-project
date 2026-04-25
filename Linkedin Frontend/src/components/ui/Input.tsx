import { forwardRef, useId } from 'react'
import type { InputHTMLAttributes, ReactNode } from 'react'
import { cn } from '../../lib/cn'

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: string
  error?: string
  helperText?: string
  leftIcon?: ReactNode
  rightIcon?: ReactNode
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, id, label, error, helperText, leftIcon, rightIcon, ...props },
  ref,
) {
  const generatedId = useId()
  const inputId = id ?? `input-${generatedId}`
  const messageId = `${inputId}-message`

  return (
    <div className="w-full">
      <div className="relative">
        {leftIcon ? (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" aria-hidden>
            {leftIcon}
          </span>
        ) : null}
        {rightIcon ? (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary">
            {rightIcon}
          </span>
        ) : null}
        <input
          ref={ref}
          id={inputId}
          className={cn(
            'peer w-full rounded-md border border-[#C2C2C2] bg-white px-3 py-2 text-sm text-text-primary transition focus:border-brand-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2',
            label && 'placeholder-transparent',
            leftIcon && 'pl-10',
            rightIcon && 'pr-10',
            error && 'border-danger',
            className,
          )}
          aria-invalid={Boolean(error)}
          aria-describedby={error || helperText ? messageId : undefined}
          placeholder={label ?? props.placeholder ?? ' '}
          {...props}
        />
        {label ? (
          <label
            htmlFor={inputId}
            className={cn(
              'pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 bg-white px-1 text-sm text-text-secondary transition-all peer-focus:top-0 peer-focus:text-xs peer-focus:text-brand-primary peer-[:not(:placeholder-shown)]:top-0 peer-[:not(:placeholder-shown)]:text-xs',
              leftIcon && 'left-10',
            )}
          >
            {label}
          </label>
        ) : null}
      </div>
      {error ? (
        <p id={messageId} className="mt-1 text-xs text-danger">
          {error}
        </p>
      ) : helperText ? (
        <p id={messageId} className="mt-1 text-xs text-text-tertiary">
          {helperText}
        </p>
      ) : null}
    </div>
  )
})
