import { X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { cn } from '../../lib/cn'

export type ChipInputProps = {
  value: string[]
  onChange: (values: string[]) => void
  max?: number
  placeholder?: string
  suggestions?: string[]
  className?: string
}

export function ChipInput({ value, onChange, max = 20, placeholder = 'Type and press Enter', suggestions = [], className }: ChipInputProps): JSX.Element {
  const [input, setInput] = useState('')
  const [open, setOpen] = useState(false)

  const filtered = useMemo(() => {
    const q = input.trim().toLowerCase()
    if (!q || suggestions.length === 0) return []
    return suggestions.filter((s) => s.toLowerCase().includes(q) && !value.some((v) => v.toLowerCase() === s.toLowerCase())).slice(0, 8)
  }, [input, suggestions, value])

  const atMax = max != null && value.length >= max

  const add = (raw: string): void => {
    const next = raw.trim()
    if (!next || atMax) return
    if (value.some((v) => v.toLowerCase() === next.toLowerCase())) return
    onChange([...value, next])
    setInput('')
    setOpen(false)
  }

  return (
    <div className={cn('relative', className)}>
      <div className="flex min-h-[44px] flex-wrap gap-2 rounded-md border border-border bg-white px-2 py-2">
        {value.map((chip) => (
          <span
            key={chip}
            className="inline-flex items-center gap-1 rounded-full bg-brand-primary/10 px-2 py-0.5 text-sm font-medium text-brand-primary"
          >
            {chip}
            <button
              type="button"
              className="rounded-full p-0.5 hover:bg-brand-primary/20"
              aria-label={`Remove ${chip}`}
              onClick={() => onChange(value.filter((v) => v !== chip))}
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          </span>
        ))}
        <input
          disabled={atMax}
          value={input}
          onChange={(e) => {
            setInput(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add(input)
            }
          }}
          placeholder={value.length === 0 ? placeholder : ''}
          className="min-w-[120px] flex-1 border-0 bg-transparent py-1 text-sm outline-none focus:ring-0 disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>
      {atMax ? <p className="mt-1 text-xs text-text-secondary">Maximum {max} reached.</p> : null}
      {open && filtered.length > 0 ? (
        <ul className="absolute left-0 right-0 top-full z-20 mt-1 max-h-40 overflow-auto rounded-md border border-border bg-white py-1 shadow-md">
          {filtered.map((s) => (
            <li key={s}>
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-sm hover:bg-black/[0.04]"
                onMouseDown={(ev) => {
                  ev.preventDefault()
                  add(s)
                }}
              >
                {s}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
