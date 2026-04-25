import { Inbox } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from './Button'

type EmptyStateProps = {
  title: string
  description: string
  icon?: ReactNode
  actionLabel?: string
  onAction?: () => void
}

export function EmptyState({ title, description, icon, actionLabel, onAction }: EmptyStateProps): JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-surface-raised p-8 text-center">
      <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-full bg-brand-primary/10 text-brand-primary" aria-hidden>
        {icon ?? <Inbox className="h-6 w-6" />}
      </div>
      <h3 className="text-base font-semibold text-text-primary">{title}</h3>
      <p className="mt-1 max-w-md text-sm text-text-secondary">{description}</p>
      {actionLabel && onAction ? (
        <Button className="mt-4" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  )
}
