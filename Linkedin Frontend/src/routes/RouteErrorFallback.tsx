import { useNavigate, useRouteError } from 'react-router-dom'

export function RouteErrorFallback(): JSX.Element {
  const error = useRouteError() as { message?: string }
  const navigate = useNavigate()

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="max-w-lg rounded-lg border border-border bg-surface-raised p-6 text-center">
        <h1 className="text-xl font-semibold text-text-primary">Page failed to load</h1>
        <p className="mt-2 text-sm text-text-secondary">{error?.message ?? 'Unexpected routing error'}</p>
        <div className="mt-4 flex justify-center gap-2">
          <button type="button" onClick={() => window.location.reload()} className="rounded-full bg-brand-primary px-4 py-1.5 text-sm font-semibold text-white">Retry</button>
          <button type="button" onClick={() => navigate('/')} className="rounded-full border border-brand-primary px-4 py-1.5 text-sm font-semibold text-brand-primary">Go home</button>
        </div>
      </div>
    </div>
  )
}
