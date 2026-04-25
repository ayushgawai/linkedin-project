import { Bell, BriefcaseBusiness, Home, Plus, Users } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { cn } from '../../lib/cn'

function MobileNavItem({ to, icon, label }: { to: string; icon: JSX.Element; label: string }): JSX.Element {
  return (
    <NavLink
      to={to}
      className={({ isActive }) => cn('flex flex-col items-center justify-center text-[11px] text-text-secondary', isActive && 'text-brand-primary')}
    >
      {icon}
      <span>{label}</span>
    </NavLink>
  )
}

export function MobileBottomNav(): JSX.Element {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 grid h-16 grid-cols-5 border-t border-border bg-white lg:hidden">
      <MobileNavItem to="/feed" icon={<Home className="h-5 w-5" aria-hidden />} label="Home" />
      <MobileNavItem to="/mynetwork" icon={<Users className="h-5 w-5" aria-hidden />} label="Network" />
      <button
        type="button"
        className="mx-auto -mt-5 flex h-12 w-12 items-center justify-center rounded-full bg-brand-primary text-white shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2"
        aria-label="Create post"
      >
        <Plus className="h-6 w-6" aria-hidden />
      </button>
      <MobileNavItem to="/jobs" icon={<BriefcaseBusiness className="h-5 w-5" aria-hidden />} label="Jobs" />
      <MobileNavItem to="/notifications" icon={<Bell className="h-5 w-5" aria-hidden />} label="Alerts" />
    </nav>
  )
}
