import { useEffect, useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { Badge } from '../ui'
import { timeAgoShort } from '../../lib/formatters'
import { getNewsSourceLabel } from '../../lib/newsSourceDisplay'
import { getNewsCardHeaderVisual } from '../../lib/newsCardVisual'
import type { TechNewsListItem } from '../../api/external/adapters'
import { cn } from '../../lib/cn'

type NewsCardProps = { item: TechNewsListItem; className?: string }

export function NewsCard({ item, className }: NewsCardProps): JSX.Element {
  const [imageFailed, setImageFailed] = useState(false)
  const visual = getNewsCardHeaderVisual(item)

  useEffect(() => {
    setImageFailed(false)
  }, [item.id, item.url, item.coverImage])

  return (
    <article
      className={cn(
        'overflow-hidden rounded-lg border border-border bg-surface-raised transition hover:shadow-sm',
        className,
      )}
    >
      <a href={item.url} target="_blank" rel="noopener noreferrer" className="block">
        {imageFailed ? (
          <div
            className="h-32 w-full bg-gradient-to-br from-[#0a66c2]/20 via-[#0a66c2]/5 to-amber-100/30"
            aria-hidden
          />
        ) : visual.kind === 'cover' ? (
          <img
            src={visual.url}
            alt=""
            className="h-32 w-full object-cover"
            loading="lazy"
            onError={() => {
              setImageFailed(true)
            }}
          />
        ) : (
          <div
            className="flex h-32 w-full flex-col items-center justify-center gap-1.5 bg-gradient-to-br from-[#e8f0fe] to-[#fef9e6] px-3"
            title={visual.host}
          >
            <img
              src={visual.url}
              alt=""
              className="h-14 w-14 rounded-lg bg-white object-contain p-1.5 shadow-sm"
              loading="lazy"
              onError={() => {
                setImageFailed(true)
              }}
            />
            <span className="line-clamp-1 max-w-full text-center text-[10px] font-medium text-text-tertiary">
              {visual.host.replace(/^www\./, '')}
            </span>
          </div>
        )}

        <div className="space-y-1.5 p-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="neutral" className="text-[10px] font-semibold text-text-primary">
              {getNewsSourceLabel(item.source)}
            </Badge>
            {item.readTime != null ? (
              <span className="text-[10px] text-text-tertiary">{item.readTime} min read</span>
            ) : null}
          </div>
          <h2 className="line-clamp-2 text-left text-sm font-bold leading-snug text-text-primary hover:text-brand-primary">
            {item.title}
            <ExternalLink className="ml-0.5 inline h-3 w-3 text-text-tertiary" aria-hidden />
          </h2>
          <p className="text-xs text-text-secondary">By {item.author}</p>
          <div className="flex flex-wrap items-center gap-2 text-xs text-text-tertiary">
            <span>{timeAgoShort(item.createdAt)}</span>
            {item.tags && item.tags.length > 0 ? (
              <span className="line-clamp-1">{item.tags.slice(0, 3).join(' · ')}</span>
            ) : null}
          </div>
        </div>
      </a>
    </article>
  )
}
