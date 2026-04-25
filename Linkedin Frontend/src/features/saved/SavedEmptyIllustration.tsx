import { cn } from '../../lib/cn'
import savedPostEmpty from './assets/saved-post-empty.svg'

type SavedEmptyIllustrationProps = {
  className?: string
}

/** Empty-state artwork for Saved Posts (vector asset bundled with the app). */
export function SavedEmptyIllustration({ className }: SavedEmptyIllustrationProps): JSX.Element {
  return (
    <img
      src={savedPostEmpty}
      alt=""
      width={256}
      height={256}
      decoding="async"
      className={cn('h-auto w-full max-w-[280px] object-contain', className)}
    />
  )
}
