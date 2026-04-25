import { Bookmark, Target } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { cn } from '../../lib/cn'

const linkClass = ({ isActive }: { isActive: boolean }): string =>
  cn(
    'flex items-center gap-3 border-l-4 py-3 pl-3 pr-4 text-sm font-semibold transition',
    isActive
      ? 'border-brand-primary bg-black/[0.04] text-text-primary'
      : 'border-transparent text-text-secondary hover:bg-black/[0.03] hover:text-text-primary',
  )

export function SavedLeftRail(): JSX.Element {
  return (
    <aside className="sticky top-[68px] hidden w-full self-start gap-2 lg:col-span-3 lg:block">
      <div className="overflow-hidden rounded-lg border border-border bg-white">
        <nav className="flex flex-col" aria-label="Saved items sections">
          <NavLink to="/saved" className={linkClass} end>
            <Bookmark className="h-5 w-5 shrink-0 text-text-primary" strokeWidth={2} aria-hidden />
            My items
          </NavLink>
          <NavLink to="/jobs/tracker" className={linkClass}>
            <Target className="h-5 w-5 shrink-0 text-text-primary" strokeWidth={2} aria-hidden />
            Job tracker
          </NavLink>
        </nav>
      </div>
    </aside>
  )
}
