import { ChevronDown, Check } from 'lucide-react'
import { forwardRef, useMemo, useRef, useState } from 'react'
import type { SelectHTMLAttributes } from 'react'
import { cn } from '../../lib/cn'
import { useClickOutside } from '../../hooks/useClickOutside'

export type SelectOption = {
  label: string
  value: string
  disabled?: boolean
}

type SelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children'> & {
  options: SelectOption[]
  variant?: 'native' | 'custom'
  onValueChange?: (value: string) => void
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, options, variant = 'native', value, defaultValue, onChange, onValueChange, disabled, ...props },
  ref,
) {
  const [open, setOpen] = useState(false)
  const [internalValue, setInternalValue] = useState(defaultValue?.toString() ?? options[0]?.value ?? '')
  const containerRef = useRef<HTMLDivElement>(null)

  useClickOutside(containerRef, () => setOpen(false), open)

  const selectedValue = (value?.toString() ?? internalValue) || ''
  const selectedOption = useMemo(
    () => options.find((option) => option.value === selectedValue),
    [options, selectedValue],
  )

  function selectOption(next: string): void {
    if (value === undefined) {
      setInternalValue(next)
    }
    onValueChange?.(next)
    setOpen(false)
  }

  if (variant === 'native') {
    return (
      <div className="relative">
        <select
          ref={ref}
          className={cn(
            'w-full appearance-none rounded-md border border-[#C2C2C2] bg-white px-3 py-2 pr-9 text-sm text-text-primary focus:border-brand-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60',
            className,
          )}
          value={value}
          defaultValue={defaultValue}
          onChange={(event) => {
            onChange?.(event)
            onValueChange?.(event.target.value)
          }}
          disabled={disabled}
          {...props}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary" aria-hidden />
      </div>
    )
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        className={cn(
          'flex w-full items-center justify-between rounded-md border border-[#C2C2C2] bg-white px-3 py-2 text-sm text-text-primary transition hover:border-brand-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60',
          className,
        )}
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span>{selectedOption?.label ?? 'Select an option'}</span>
        <ChevronDown className={cn('h-4 w-4 text-text-secondary transition', open && 'rotate-180')} aria-hidden />
      </button>
      {open ? (
        <ul
          role="listbox"
          className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-md border border-border bg-surface-raised py-1 shadow-sm"
          tabIndex={-1}
        >
          {options.map((option) => (
            <li key={option.value} role="option" aria-selected={option.value === selectedValue}>
              <button
                type="button"
                disabled={option.disabled}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-text-primary hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-inset disabled:cursor-not-allowed disabled:opacity-60"
                onClick={() => selectOption(option.value)}
              >
                {option.label}
                {option.value === selectedValue ? <Check className="h-4 w-4 text-brand-primary" aria-hidden /> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
})
