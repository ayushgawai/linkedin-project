import { Bot, BriefcaseBusiness, Building2, ChartColumn, LayoutDashboard, MessageSquare } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { Card } from '../ui'
import { cn } from '../../lib/cn'

const items = [
  { to: '/recruiter', label: 'Dashboard', icon: <LayoutDashboard className="h-4 w-4" /> },
  { to: '/recruiter/jobs', label: 'My jobs', icon: <BriefcaseBusiness className="h-4 w-4" /> },
  { to: '/recruiter/jobs', label: 'Applicants', icon: <Building2 className="h-4 w-4" /> },
  { to: '/messaging', label: 'Messaging', icon: <MessageSquare className="h-4 w-4" /> },
  { to: '/recruiter/ai', label: 'AI Copilot', icon: <Bot className="h-4 w-4" />, highlight: true },
  { to: '/analytics', label: 'Analytics', icon: <ChartColumn className="h-4 w-4" /> },
]

export function RecruiterLeftRail(): JSX.Element {
  const visibleItems = items.filter((item) => item.label !== 'My jobs' && item.label !== 'Analytics')

  return (
    <Card className="w-full shadow-sm">
      <Card.Body className="space-y-0.5 p-1.5 sm:p-2">
        {visibleItems.map((item) => (
          <NavLink
            key={item.label}
            to={item.to}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-black/[0.04] hover:text-text-primary sm:px-2.5 sm:py-2 sm:text-sm [&_svg]:h-3.5 [&_svg]:w-3.5 sm:[&_svg]:h-4 sm:[&_svg]:w-4',
                isActive && 'bg-black/[0.06] text-text-primary',
                item.highlight &&
                  'bg-gradient-to-r from-brand-primary/10 to-purple-500/10 font-semibold text-brand-primary hover:text-brand-primary',
              )
            }
          >
            {item.icon}
            <span className="min-w-0 leading-snug">{item.label}</span>
          </NavLink>
        ))}
      </Card.Body>
    </Card>
  )
}
