import { ChevronDown } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '../../lib/cn'
import { InternalNavLogo } from './InternalNavLogo'

type RailFooterProps = {
  className?: string
}

const linkClass =
  'inline-flex items-center gap-0.5 text-xs leading-snug text-[#666666] transition hover:text-[#0a66c2] hover:underline'

function FooterLink({
  href,
  to,
  children,
  chevron,
}: {
  href?: string
  to?: string
  children: ReactNode
  chevron?: boolean
}): JSX.Element {
  const inner = (
    <>
      {children}
      {chevron ? <ChevronDown className="h-3 w-3 shrink-0 opacity-90" strokeWidth={2} aria-hidden /> : null}
    </>
  )
  if (to) {
    return (
      <Link to={to} className={linkClass}>
        {inner}
      </Link>
    )
  }
  return (
    <a href={href ?? '#'} className={linkClass} onClick={(e) => e.preventDefault()}>
      {inner}
    </a>
  )
}

/**
 * LinkedIn-style multi-row rail footer (feed, profile, network right rail, landing strip, jobs).
 */
export function RailFooter({ className }: RailFooterProps = {}): JSX.Element {
  const year = new Date().getFullYear()
  return (
    <footer className={cn('mt-2 px-1 pb-4 pt-1 text-center', className)} aria-label="Site footer">
      <nav className="mx-auto space-y-1">
        <div className="flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1">
          <FooterLink to="/top-content">About</FooterLink>
          <FooterLink>Accessibility</FooterLink>
          <FooterLink to="/help">Help Center</FooterLink>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1">
          <FooterLink chevron>Privacy &amp; Terms</FooterLink>
          <FooterLink>Ad Choices</FooterLink>
          <FooterLink>Advertising</FooterLink>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1">
          <FooterLink chevron>Business Services</FooterLink>
          <FooterLink>Get the LinkedIn app</FooterLink>
        </div>
        <div className="flex justify-center">
          <FooterLink>More</FooterLink>
        </div>
      </nav>
      <div className="mx-auto mt-2.5 flex flex-wrap items-center justify-center gap-x-2 gap-y-1.5 text-xs text-[#666666]">
        <span className="inline-flex items-center gap-1.5">
          <InternalNavLogo className="h-4 w-4" />
          <span className="font-semibold text-[#1f1f1f]">LinkedIn</span>
        </span>
        <span className="text-center leading-snug">LinkedIn Corporation © {year}</span>
      </div>
    </footer>
  )
}
