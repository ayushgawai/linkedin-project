import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Link } from 'react-router-dom'

type Props = { children: ReactNode }
type State = { hasError: boolean; error?: string }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error: error.message }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('Unhandled UI error', error, errorInfo)
  }

  render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children
    }

    return (
      <div className="flex min-h-screen items-center justify-center bg-surface p-6">
        <div className="max-w-lg rounded-lg border border-border bg-surface-raised p-6 text-center">
          <h1 className="text-xl font-semibold text-text-primary">Something went wrong</h1>
          <p className="mt-2 text-sm text-text-secondary">We hit an unexpected UI error. Please retry.</p>
          {this.state.error ? <pre className="mt-3 overflow-auto rounded bg-surface p-2 text-left text-xs text-text-tertiary">{this.state.error}</pre> : null}
          <div className="mt-4 flex justify-center gap-2">
            <button type="button" onClick={() => window.location.reload()} className="rounded-full bg-brand-primary px-4 py-1.5 text-sm font-semibold text-white">Retry</button>
            <Link to="/" className="rounded-full border border-brand-primary px-4 py-1.5 text-sm font-semibold text-brand-primary">Go home</Link>
          </div>
        </div>
      </div>
    )
  }
}
