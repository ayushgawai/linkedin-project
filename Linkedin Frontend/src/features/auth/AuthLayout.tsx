import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { BrandMark } from '../../components/layout'

type AuthLayoutProps = {
  children: ReactNode
}

const footerLinks = ['About', 'Accessibility', 'User Agreement', 'Privacy Policy', 'Cookie Policy']

export function AuthLayout({ children }: AuthLayoutProps): JSX.Element {
  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <header className="border-b border-border bg-white">
        <div className="mx-auto flex h-16 w-full max-w-[1128px] items-center justify-between px-4 lg:px-0">
          <Link to="/" aria-label="LinkedIn Clone home">
            <BrandMark size={48} />
          </Link>
          <div className="flex items-center gap-5 text-sm">
            <Link className="font-medium text-text-secondary hover:text-text-primary" to="/signup">
              Join now
            </Link>
            <Link className="rounded-full border border-brand-primary px-4 py-1.5 font-semibold text-brand-primary hover:bg-brand-primary/10" to="/login">
              Sign in
            </Link>
          </div>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-10">{children}</main>

      <footer className="px-4 py-6 text-center">
        <div className="mb-2 flex flex-wrap items-center justify-center gap-4 text-xs text-text-tertiary">
          {footerLinks.map((item) => (
            <a key={item} href="#" className="hover:text-text-secondary">
              {item}
            </a>
          ))}
        </div>
        <p className="text-xs text-text-tertiary">LinkedIn Clone - Distributed Systems Class Project © 2025</p>
      </footer>
    </div>
  )
}
