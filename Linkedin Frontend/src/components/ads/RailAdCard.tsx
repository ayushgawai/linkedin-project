import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import type { CuratedAd } from '../../lib/curatedAds'
import { curatedAds } from '../../lib/curatedAds'
import { RAIL_AD_ROTATE_INTERVAL_MS } from '../../lib/externalPolling'
import { useAdsStore } from '../../store/adsStore'
import { cn } from '../../lib/cn'

export type RailAdCardProps = {
  /** When set, show this ad only (no random pick or rotation). */
  pinnedAdId?: string
  className?: string
}

function pickRandom<T>(items: T[]): T | null {
  if (items.length === 0) return null
  return items[Math.floor(Math.random() * items.length)] ?? null
}

function availableAds(dismissed: string[]): CuratedAd[] {
  return curatedAds.filter((a) => !dismissed.includes(a.id))
}

export function RailAdCard({ pinnedAdId, className }: RailAdCardProps = {}): JSX.Element | null {
  const dismissAd = useAdsStore((s) => s.dismissAd)
  const [slotClosed, setSlotClosed] = useState(false)
  const [picked, setPicked] = useState<CuratedAd | null>(() => {
    const dismissed = useAdsStore.getState().dismissedAdIds
    if (pinnedAdId) {
      const ad = curatedAds.find((a) => a.id === pinnedAdId)
      if (!ad || dismissed.includes(ad.id)) {
        return null
      }
      return ad
    }
    const pool = availableAds(dismissed)
    return pickRandom(pool)
  })

  // Every N minutes, swap to a different ad from the non-dismissed pool. Timer runs at a steady cadence
  // (not reset when the ad changes). Browsers may throttle `setInterval` when the tab is in the background.
  useEffect(() => {
    if (pinnedAdId) {
      return
    }
    if (slotClosed) {
      return
    }
    if (availableAds(useAdsStore.getState().dismissedAdIds).length === 0) {
      return
    }

    const id = window.setInterval(() => {
      setPicked((prev) => {
        const pool = availableAds(useAdsStore.getState().dismissedAdIds)
        if (pool.length === 0) {
          return null
        }
        if (pool.length === 1) {
          return pool[0] ?? null
        }
        const withoutPrev = pool.filter((a) => a.id !== prev?.id)
        return pickRandom(withoutPrev.length > 0 ? withoutPrev : pool) ?? pool[0] ?? null
      })
    }, RAIL_AD_ROTATE_INTERVAL_MS)

    return () => {
      clearInterval(id)
    }
  }, [slotClosed, pinnedAdId])

  if (slotClosed || picked == null) {
    return null
  }

  return (
    <div
      className={cn('overflow-hidden rounded-lg border border-border bg-white p-4', className)}
      aria-label={`Promoted content from ${picked.advertiser}`}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs text-text-tertiary">Promoted</span>
        <button
          type="button"
          onClick={() => {
            dismissAd(picked.id)
            setSlotClosed(true)
          }}
          className="inline-flex shrink-0 items-center justify-center rounded-full p-1.5 text-text-tertiary transition hover:bg-black/5"
          aria-label="Dismiss promoted content"
        >
          <X className="h-4 w-4" strokeWidth={2} aria-hidden />
        </button>
      </div>

      <div className="mb-2 flex items-center gap-2">
        <div
          className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-xs font-bold text-white',
            picked.gradient,
          )}
          aria-hidden
        >
          {picked.advertiserInitials}
        </div>
        <p className="text-sm font-bold text-text-primary">{picked.advertiser}</p>
      </div>

      <p className="mb-1 line-clamp-2 text-base font-bold text-text-primary">{picked.headline}</p>
      <p className="mb-3 line-clamp-2 text-xs text-text-secondary">{picked.body}</p>

      <a
        href={picked.ctaUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-block rounded-full border border-brand-primary px-3 py-1 text-xs font-semibold text-brand-primary transition hover:bg-brand-primary/10"
      >
        {picked.cta}
      </a>
    </div>
  )
}
