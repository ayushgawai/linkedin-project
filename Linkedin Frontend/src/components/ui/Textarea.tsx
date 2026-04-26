import { forwardRef, useId } from 'react'
import type { ReactNode, TextareaHTMLAttributes } from 'react'
import { cn } from '../../lib/cn'

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: string
  error?: string
  helperText?: string
  leftIcon?: ReactNode
  autoResize?: boolean
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, id, label, error, helperText, leftIcon, autoResize = false, onInput, ...props },
  ref,
) {
  const generatedId = useId()
  const textareaId = id ?? `textarea-${generatedId}`
  const messageId = `${textareaId}-message`

  function handleInput(event: React.FormEvent<HTMLTextAreaElement>): void {
    if (autoResize) {
      const target = event.currentTarget
      target.style.height = 'auto'
      target.style.height = `${target.scrollHeight}px`
    }
    onInput?.(event)
  }

  return (
    <div className="w-full">
      <div className="relative">
        {leftIcon ? <span className="absolute left-3 top-3 text-text-secondary" aria-hidden>{leftIcon}</span> : null}
        <textarea
          ref={ref}
          id={textareaId}
          className={cn(
            'peer min-h-28 w-full resize-y rounded-md border border-[#C2C2C2] bg-white px-3 py-2 text-sm text-text-primary transition focus:border-brand-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2',
            label && 'placeholder-transparent',
            leftIcon && 'pl-10',
            autoResize && 'resize-none overflow-hidden',
            error && 'border-danger',
            className,
          )}
          aria-invalid={Boolean(error)}
          aria-describedby={error || helperText ? messageId : undefined}
          placeholder={label ?? props.placeholder ?? ' '}
          onInput={handleInput}
          {...props}
        />
        {label ? (
          <label
            htmlFor={textareaId}
            className={cn(
              'pointer-events-none absolute left-3 top-3 z-10 translate-y-0 bg-white px-1.5 text-sm text-text-secondary transition-all',
              'peer-focus:top-0 peer-focus:-translate-y-1/2 peer-focus:text-xs peer-focus:text-brand-primary',
              'peer-[:not(:placeholder-shown)]:top-0 peer-[:not(:placeholder-shown)]:-translate-y-1/2 peer-[:not(:placeholder-shown)]:text-xs',
              leftIcon && 'left-10',
            )}
          >
            {label}
          </label>
        ) : null}
      </div>
      {error ? (
        <p id={messageId} className="mt-1 text-xs text-danger">{error}</p>
      ) : helperText ? (
        <p id={messageId} className="mt-1 text-xs text-text-tertiary">{helperText}</p>
      ) : null}
    </div>
  )
})
