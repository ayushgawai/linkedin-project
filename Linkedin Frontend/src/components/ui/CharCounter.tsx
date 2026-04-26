import { cn } from '../../lib/cn'

type CharCounterProps = {
  current: number
  max: number
}

export function CharCounter({ current, max }: CharCounterProps): JSX.Element {
  return (
    <p className={cn('mt-0.5 text-right text-xs text-text-tertiary', current > max * 0.9 && 'text-danger')}>
      {current}/{max > 999 ? max.toLocaleString() : max}
    </p>
  )
}
