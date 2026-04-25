import type { HTMLAttributes } from 'react'
import { cn } from '../../lib/cn'

type DividerProps = HTMLAttributes<HTMLDivElement> & {
  label?: string
}

export function Divider({ className, label, ...props }: DividerProps): JSX.Element {
  if (!label) {
    return <hr className={cn('my-4 border-0 border-t border-border', className)} {...props} />
  }

  return (
    <div className={cn('my-4 flex items-center gap-3 text-xs text-text-tertiary', className)} {...props}>
      <span className="h-px flex-1 bg-border" />
      <span>{label}</span>
      <span className="h-px flex-1 bg-border" />
    </div>
  )
}
