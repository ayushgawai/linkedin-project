import { ChevronDown } from 'lucide-react'
import { useId, useRef, useState } from 'react'
import type { FeedSort, FeedTab } from '../../types/feed'
import { cn } from '../../lib/cn'
import { useClickOutside } from '../../hooks/useClickOutside'

type FeedTabsProps = {
  tab: FeedTab
  sort: FeedSort
  onTabChange: (tab: FeedTab) => void
  onSortChange: (sort: FeedSort) => void
}

const sortLabels: Record<FeedSort, string> = {
  top: 'Top',
  recent: 'Recent',
}

/**
 * For You / Following + "Sort by: Top" — matches LinkedIn feed filter row
 * (first reference: sort right; second reference: For You in blue pill).
 */
export function FeedTabs({ tab, sort, onTabChange, onSortChange }: FeedTabsProps): JSX.Element {
  const [sortOpen, setSortOpen] = useState(false)
  const sortRef = useRef<HTMLDivElement>(null)
  const sortId = useId()
  useClickOutside(sortRef, () => setSortOpen(false), sortOpen)

  return (
    <div className="mt-1 flex min-h-12 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-0">
      <div className="flex flex-wrap items-center gap-2 pl-0.5">
        {(
          [
            ['for_you', 'For You'],
            ['following', 'Following'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => onTabChange(value)}
            className={cn(
              'rounded-full px-3 py-1.5 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0a66c2] focus-visible:ring-offset-2',
              tab === value
                ? 'bg-[#0a66c2] text-white shadow-sm'
                : 'bg-transparent text-[#666666] hover:bg-black/[0.04]',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div ref={sortRef} className="relative flex items-baseline justify-end gap-0 self-end sm:self-auto">
        <div className="inline-flex items-center gap-0.5 text-sm">
          <span className="text-[#00000099]">Sort by:</span>
          <button
            type="button"
            id={sortId}
            aria-haspopup="listbox"
            aria-expanded={sortOpen}
            onClick={() => setSortOpen((o) => !o)}
            className="inline-flex items-center gap-0.5 font-bold text-[#191919] focus:outline-none focus-visible:rounded focus-visible:ring-2 focus-visible:ring-[#0a66c2] focus-visible:ring-offset-1"
          >
            {sortLabels[sort]}
            <ChevronDown className="h-4 w-4 text-[#666666]" strokeWidth={2} aria-hidden />
          </button>
        </div>
        {sortOpen ? (
          <ul
            role="listbox"
            aria-labelledby={sortId}
            className="absolute right-0 top-full z-20 mt-1 min-w-[8rem] rounded-md border border-[#e0e0e0] bg-white py-1 text-sm shadow-lg"
          >
            {(['top', 'recent'] as const).map((key) => (
              <li key={key} role="option" aria-selected={sort === key}>
                <button
                  type="button"
                  className="w-full px-3 py-2 text-left font-semibold text-[#191919] hover:bg-[#f3f2f0]"
                  onClick={() => {
                    onSortChange(key)
                    setSortOpen(false)
                  }}
                >
                  {sortLabels[key]}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  )
}
