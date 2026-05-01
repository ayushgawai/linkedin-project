import { Bot, BriefcaseBusiness, Building2, ChartColumn, LayoutDashboard, MessageSquare, Search } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { Card } from '../ui'
import { cn } from '../../lib/cn'

const items = [
  { to: '/recruiter', label: 'Dashboard', icon: <LayoutDashboard className="h-4 w-4" /> },
  { to: '/recruiter/jobs', label: 'My jobs', icon: <BriefcaseBusiness className="h-4 w-4" /> },
  { to: '/recruiter/jobs', label: 'Applicants', icon: <Building2 className="h-4 w-4" /> },
  { to: '/jobs/search', label: 'Talent search', icon: <Search className="h-4 w-4" /> },
  { to: '/messaging', label: 'Messaging', icon: <MessageSquare className="h-4 w-4" /> },
  { to: '/recruiter/ai', label: 'AI Copilot', icon: <Bot className="h-4 w-4" />, highlight: true },
  { to: '/analytics', label: 'Analytics', icon: <ChartColumn className="h-4 w-4" /> },
]

export function RecruiterLeftRail(): JSX.Element {
  return (
    <Card>
      <Card.Body className="space-y-1 p-2">
        {items.map((item) => (
          <NavLink
            key={item.label}
            to={item.to}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-2 rounded-md px-3 py-2 text-sm text-text-secondary hover:bg-black/5 hover:text-text-primary',
                isActive && 'bg-black/5 text-text-primary',
                item.highlight && 'bg-gradient-to-r from-brand-primary/10 to-purple-500/10 text-brand-primary',
              )
            }
          >
            {item.icon}
            {item.label}
          </NavLink>
        ))}
      </Card.Body>
    </Card>
  )
}
