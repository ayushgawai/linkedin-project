import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

type PageContainerProps = {
  children: ReactNode
  className?: string
}

export function PageContainer({ children, className }: PageContainerProps): JSX.Element {
  return <div className={cn('mx-auto grid max-w-[1128px] grid-cols-12 gap-6 px-4 lg:px-0', className)}>{children}</div>
}
