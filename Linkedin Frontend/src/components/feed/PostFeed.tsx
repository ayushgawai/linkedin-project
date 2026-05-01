import { useEffect, useRef } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { listFeed } from '../../api/posts'
import type { FeedSort, FeedTab } from '../../types/feed'
import { Card, Skeleton } from '../ui'
import { PostCard } from './PostCard'

type PostFeedProps = {
  tab: FeedTab
  sort: FeedSort
}

export const FEED_QUERY_KEY = 'feed-posts'

export function PostFeed({ tab, sort }: PostFeedProps): JSX.Element {
  const sentinelRef = useRef<HTMLDivElement>(null)

  const query = useInfiniteQuery({
    queryKey: [FEED_QUERY_KEY, tab, sort],
    queryFn: ({ pageParam }) => listFeed({ page: pageParam, pageSize: 6, tab, sort }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => (lastPage.has_more ? lastPage.page + 1 : undefined),
  })

  useEffect(() => {
    if (!sentinelRef.current) {
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries
        if (entry?.isIntersecting && query.hasNextPage && !query.isFetchingNextPage) {
          void query.fetchNextPage()
        }
      },
      { threshold: 0.3 },
    )

    observer.observe(sentinelRef.current)

    return () => observer.disconnect()
  }, [query])

  if (query.isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, index) => (
          <Card key={index}><Card.Body className="space-y-3 p-4"><Skeleton className="h-12 w-56" /><Skeleton className="h-4" /><Skeleton className="h-4 w-3/4" /><Skeleton variant="rect" className="h-52" /></Card.Body></Card>
        ))}
      </div>
    )
  }

  const posts = query.data?.pages.flatMap((page) => page.posts) ?? []

  return (
    <div className="space-y-3">
      {posts.map((post) => (
        <PostCard key={post.post_id} post={post} />
      ))}

      {query.isFetchingNextPage ? (
        <Card><Card.Body className="space-y-2 p-4"><Skeleton className="h-4" /><Skeleton className="h-4 w-2/3" /></Card.Body></Card>
      ) : null}

      <div ref={sentinelRef} className="h-2" />

      {!query.hasNextPage ? (
        <p className="py-4 text-center text-sm text-text-tertiary">No more posts</p>
      ) : null}
    </div>
  )
}
