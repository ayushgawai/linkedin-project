import { ChevronDown } from 'lucide-react'
import { useRef, useState } from 'react'
import { useClickOutside } from '../../hooks/useClickOutside'
import type { DatePostedOption } from '../../lib/datePostedFilter'
import { Button } from '../../components/ui'

const OPTIONS: { value: DatePostedOption; label: string }[] = [
  { value: '24h', label: 'Past 24 hours' },
  { value: '7d', label: 'Past week' },
  { value: '30d', label: 'Past month' },
  { value: 'all', label: 'All time' },
]

type DatePostedFilterProps = {
  draft: DatePostedOption
  onDraftChange: (v: DatePostedOption) => void
  onApply: () => void
  onClear: () => void
}

export function DatePostedFilter({ draft, onDraftChange, onApply, onClear }: DatePostedFilterProps): JSX.Element {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useClickOutside(ref, () => setOpen(false), open)

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-sm font-semibold text-text-primary transition hover:bg-black/[0.03]"
      >
        Date posted
        <ChevronDown className="h-4 w-4 text-text-tertiary" aria-hidden />
      </button>
      {open ? (
        <div className="absolute right-0 z-40 mt-2 w-72 rounded-lg border border-border bg-white p-4 shadow-md">
          <p className="text-base font-semibold text-text-primary">Date posted</p>
          <div className="mt-3 space-y-2" role="radiogroup" aria-label="Date posted">
            {OPTIONS.map((opt) => (
              <label key={opt.value} className="flex cursor-pointer items-center gap-2 text-sm text-text-primary">
                <input
                  type="radio"
                  name="date-posted"
                  checked={draft === opt.value}
                  onChange={() => onDraftChange(opt.value)}
                  className="h-4 w-4 border-border text-brand-primary"
                />
                {opt.label}
              </label>
            ))}
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
            <button type="button" className="text-sm font-semibold text-text-secondary hover:text-text-primary" onClick={onClear}>
              Clear
            </button>
            <Button
              size="sm"
              className="rounded-full px-4"
              onClick={() => {
                onApply()
                setOpen(false)
              }}
            >
              Apply
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
