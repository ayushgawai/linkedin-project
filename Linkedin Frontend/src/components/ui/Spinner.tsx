import { cn } from '../../lib/cn'

type SpinnerSize = 'sm' | 'md' | 'lg'

const spinnerSizeClasses: Record<SpinnerSize, string> = {
  sm: 'h-4 w-4 border-2',
  md: 'h-5 w-5 border-2',
  lg: 'h-7 w-7 border-[3px]',
}

type SpinnerProps = {
  size?: SpinnerSize
  className?: string
}

export function Spinner({ size = 'md', className }: SpinnerProps): JSX.Element {
  return (
    <span
      className={cn(
        'inline-block animate-spin rounded-full border-current border-r-transparent',
        spinnerSizeClasses[size],
        className,
      )}
      role="status"
      aria-label="Loading"
    />
  )
}
