import { useMemo, useState } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import {
  devToArticleToTechNewsItem,
  hackerNewsHitToTechNewsItem,
  getStoriesForTab,
  getTopArticles,
  type NewsSearchTab,
  type TechNewsListItem,
  clearExternalFailure,
} from '../../api/external'
import { EXTERNAL_FAILURE_KEYS, isExternalSectionSuppressed, recordExternalFailure } from '../../api/external/failureSession'
import { NewsCard } from '../../components/news/NewsCard'
import { Button, EmptyState, Skeleton } from '../../components/ui'
import { cn } from '../../lib/cn'
import { EXTERNAL_NEWS_REFETCH_INTERVAL_MS } from '../../lib/externalPolling'
import { NEWS_PAGE_SUBTITLE } from '../../lib/newsSourceDisplay'

const TABS: { id: NewsSearchTab; label: string }[] = [
  { id: 'top', label: 'Top' },
  { id: 'latest', label: 'Latest' },
  { id: 'software', label: 'Software' },
  { id: 'ai', label: 'AI' },
  { id: 'startups', label: 'Startups' },
]

function byRecency(a: TechNewsListItem, b: TechNewsListItem): number {
  return +new Date(b.createdAt) - +new Date(a.createdAt)
}

export default function NewsPage(): JSX.Element {
  const [tab, setTab] = useState<NewsSearchTab>('top')
  const key = EXTERNAL_FAILURE_KEYS.newsPage
  const hidden = isExternalSectionSuppressed(key)

  const query = useInfiniteQuery({
    queryKey: ['external', 'news', 'page', tab],
    initialPageParam: 0,
    queryFn: async ({ pageParam }: { pageParam: number }) => {
      try {
        const hn = await getStoriesForTab(tab, pageParam, 20)
        const devMapped =
          pageParam === 0
            ? (await getTopArticles(7, 10)).map(devToArticleToTechNewsItem)
            : []
        const hnItems = hn.hits.map(hackerNewsHitToTechNewsItem)
        const hasMore = pageParam + 1 < (hn.nbPages || 0)
        clearExternalFailure(key)
        return { hnItems, devItems: devMapped, hasMore, page: pageParam }
      } catch (e) {
        recordExternalFailure(key)
        console.error('[external] news page', e)
        throw e
      }
    },
    getNextPageParam: (last) => (last.hasMore ? last.page + 1 : undefined),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchInterval: EXTERNAL_NEWS_REFETCH_INTERVAL_MS,
    refetchIntervalInBackground: false,
    retry: false,
    enabled: !hidden,
  })

  const merged = useMemo((): TechNewsListItem[] => {
    const pages = query.data?.pages
    if (!pages?.length) return []
    const [head, ...rest] = pages
    const first = [...head.hnItems, ...head.devItems].sort(byRecency)
    const more = rest.flatMap((p) => p.hnItems)
    return [...first, ...more].sort(byRecency)
  }, [query.data?.pages])

  if (hidden) {
    return (
      <div className="col-span-12 py-4 lg:col-span-8">
        <p className="text-sm text-text-secondary">Tech news is temporarily hidden after multiple failed loads. Refresh the page to try again.</p>
      </div>
    )
  }

  if (query.isError) {
    return (
      <div className="col-span-12 py-4 lg:col-span-8">
        <EmptyState
          title="Could not load news"
          description="We couldn’t load stories right now. Try again in a few minutes."
          actionLabel="Retry"
          onAction={() => {
            void query.refetch()
          }}
        />
      </div>
    )
  }

  return (
    <div className="col-span-12 space-y-4 pb-8 lg:col-span-8">
      <header>
        <h1 className="text-xl font-semibold text-text-primary">Top stories</h1>
        <p className="mt-0.5 text-sm text-text-secondary">{NEWS_PAGE_SUBTITLE}</p>
        <div className="mt-3 flex flex-wrap gap-1 border-b border-border">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setTab(t.id)
              }}
              className={cn(
                '-mb-px border-b-2 px-2.5 py-1.5 text-sm font-semibold',
                tab === t.id
                  ? 'border-brand-primary text-brand-primary'
                  : 'border-transparent text-text-tertiary hover:text-text-primary',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </header>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {query.isLoading
          ? Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-56 rounded-lg" />)
          : merged.map((item) => <NewsCard key={`${item.source}-${item.id}`} item={item} />)}
      </div>
      {query.hasNextPage ? (
        <Button
          type="button"
          variant="secondary"
          className="w-full"
          onClick={() => {
            void query.fetchNextPage()
          }}
          disabled={query.isFetchingNextPage}
        >
          {query.isFetchingNextPage ? 'Loading…' : 'Load more'}
        </Button>
      ) : null}
    </div>
  )
}
