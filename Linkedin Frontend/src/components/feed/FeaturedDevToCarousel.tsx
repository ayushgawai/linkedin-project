import { useQuery } from '@tanstack/react-query'
import { Bookmark, ExternalLink } from 'lucide-react'
import { getTopArticles } from '../../api/external/devTo'
import { devToArticleToTechNewsItem, type TechNewsListItem, clearExternalFailure } from '../../api/external'
import { techNewsItemToSavedPost } from '../../lib/savedFromExternal'
import { EXTERNAL_NEWS_REFETCH_INTERVAL_MS } from '../../lib/externalPolling'
import { EXTERNAL_FAILURE_KEYS, isExternalSectionSuppressed, recordExternalFailure } from '../../api/external/failureSession'
import { timeAgoShort } from '../../lib/formatters'
import { cn } from '../../lib/cn'
import { useActionToast } from '../../hooks/useActionToast'
import { useSavedPostsStore } from '../../store/savedPostsStore'
import { Skeleton } from '../ui'

const failureKey = EXTERNAL_FAILURE_KEYS.devtoFeatured

export function FeaturedDevToCarousel(): JSX.Element | null {
  const hidden = isExternalSectionSuppressed(failureKey)
  const q = useQuery({
    queryKey: ['external', 'devto', 'feed-featured', 5],
    queryFn: async (): Promise<TechNewsListItem[]> => {
      try {
        const list = (await getTopArticles(7, 5)).map(devToArticleToTechNewsItem)
        clearExternalFailure(failureKey)
        return list
      } catch (e) {
        recordExternalFailure(failureKey)
        console.error('[external] dev.to featured', e)
        throw e
      }
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchInterval: EXTERNAL_NEWS_REFETCH_INTERVAL_MS,
    refetchIntervalInBackground: false,
    retry: false,
    enabled: !hidden,
  })

  if (hidden) {
    return null
  }
  if (q.isError) {
    return null
  }
  if (q.isLoading) {
    return (
      <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-48 w-72 shrink-0 rounded-lg" />
        ))}
      </div>
    )
  }
  const items = q.data ?? []
  if (items.length === 0) {
    return null
  }
  return (
    <FeaturedDevToCarouselInner items={items} />
  )
}

function FeaturedDevToCarouselInner({ items }: { items: TechNewsListItem[] }): JSX.Element {
  const actionToast = useActionToast()
  const save = useSavedPostsStore((s) => s.save)
  const remove = useSavedPostsStore((s) => s.remove)
  /** Subscribe to entries so each card re-renders when save/remove runs (the isSaved function alone does not trigger updates). */
  const entries = useSavedPostsStore((s) => s.entries)
  return (
    <div className="mb-3 rounded-[10px] border border-border bg-surface-raised p-3">
      <h2 className="mb-2 text-sm font-bold text-text-primary">Featured articles</h2>
      <div className="flex gap-3 overflow-x-auto pb-1">
        {items.map((item) => {
          const saved = entries.some((e) => e.post.post_id === item.id)
          return (
            <div
              key={item.id}
              className="flex w-72 shrink-0 flex-col overflow-hidden rounded-md border border-border bg-white"
            >
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="min-h-0 flex-1 text-left"
              >
                {item.coverImage ? (
                  <div className="h-24 w-full bg-cover bg-center" style={{ backgroundImage: `url(${item.coverImage})` }} />
                ) : (
                  <div className="h-24 w-full bg-gradient-to-br from-[#0a66c2]/20 to-amber-100/20" />
                )}
                <div className="space-y-1 p-2.5">
                  <p className="line-clamp-2 text-sm font-bold leading-snug text-text-primary hover:text-brand-primary">
                    {item.title}
                    <ExternalLink className="ml-0.5 inline h-3 w-3" aria-hidden />
                  </p>
                  <p className="text-xs text-text-secondary">{item.author}</p>
                  <div className="flex flex-wrap items-center justify-between gap-1 text-[10px] text-text-tertiary">
                    {item.readTime != null ? <span>{item.readTime} min</span> : null}
                    <span>{timeAgoShort(item.createdAt)}</span>
                  </div>
                  <span className="text-xs font-semibold text-brand-primary">Read full article</span>
                </div>
              </a>
              <div className="flex items-center justify-end border-t border-border p-2">
                <button
                  type="button"
                  onClick={() => {
                    if (saved) {
                      remove(item.id)
                    } else {
                      const post = techNewsItemToSavedPost(item)
                      save(post, item.url)
                      actionToast.jobSaved(item.title)
                    }
                  }}
                  aria-pressed={saved}
                  aria-label={saved ? 'Remove article from saved' : 'Save article'}
                  className={cn(
                    'flex min-w-[52px] flex-col items-center justify-center gap-0.5 rounded-md border py-1.5 pl-2 pr-2 text-[11px] font-semibold leading-tight transition-colors duration-100 ease-out',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2',
                    saved
                      ? 'border-brand-primary bg-brand-primary text-white shadow-sm hover:bg-brand-primary-hover'
                      : 'border-border bg-white text-text-tertiary hover:border-text-secondary/40 hover:bg-black/[0.02] hover:text-text-secondary',
                  )}
                >
                  <Bookmark
                    className={cn('h-4 w-4 shrink-0', saved && 'scale-[1.02]')}
                    strokeWidth={saved ? 0 : 2}
                    fill={saved ? 'currentColor' : 'none'}
                    aria-hidden
                  />
                  <span>{saved ? 'Saved' : 'Save'}</span>
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
