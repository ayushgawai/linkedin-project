import { cn } from '../../lib/cn'
import linkedInInMark from '../../assets/linkedin-in-mark.png'

/** Square “in” mark for the logged-in top bar only (not the full wordmark used on landing/auth). */
export function InternalNavLogo({ className }: { className?: string }): JSX.Element {
  return (
    <img
      src={linkedInInMark}
      width={34}
      height={34}
      decoding="async"
      className={cn('h-[34px] w-[34px] shrink-0 object-contain', className)}
      alt=""
      aria-hidden
    />
  )
}
