import { Link } from 'react-router-dom'

export default function NotFoundPage(): JSX.Element {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface p-6">
      <div className="rounded-lg border border-border bg-surface-raised p-6 text-center">
        <h1 className="text-2xl font-semibold text-text-primary">404</h1>
        <p className="mt-2 text-sm text-text-secondary">The page you are looking for does not exist.</p>
        <Link to="/" className="mt-4 inline-flex rounded-full bg-brand-primary px-4 py-1.5 text-sm font-semibold text-white">Go home</Link>
      </div>
    </div>
  )
}
