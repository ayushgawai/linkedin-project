import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Card } from '../../components/ui'
import { isArticleEntry, useSavedPostsStore } from '../../store/savedPostsStore'
import { useSavedJobsStore } from '../../store/savedJobsStore'
import { cn } from '../../lib/cn'
import { SavedEmptyIllustration } from './SavedEmptyIllustration'
import { SavedPostCard } from './SavedPostCard'

const pillBase =
  'inline-flex items-center justify-center rounded-full border px-3 py-1.5 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#01754f] focus-visible:ring-offset-2'
const pillActive = 'border-transparent bg-[#01754f] text-white'
const pillIdle = 'border-border bg-white text-text-primary hover:bg-black/[0.03]'

type FilterTab = 'all' | 'posts' | 'jobs' | 'articles'

const VALID_VIEWS: readonly FilterTab[] = ['all', 'posts', 'jobs', 'articles']

function parseViewParam(raw: string | null): FilterTab | null {
  if (!raw) return null
  const v = raw.toLowerCase()
  return VALID_VIEWS.includes(v as FilterTab) ? (v as FilterTab) : null
}

export default function SavedPage(): JSX.Element {
  const [searchParams, setSearchParams] = useSearchParams()
  const postEntries = useSavedPostsStore((s) => s.entries)
  const jobEntries = useSavedJobsStore((s) => s.entries)
  const [filter, setFilter] = useState<FilterTab>(() => parseViewParam(searchParams.get('view')) ?? 'all')

  useEffect(() => {
    const next = parseViewParam(searchParams.get('view')) ?? 'all'
    setFilter(next)
  }, [searchParams])

  const applyFilter = (tab: FilterTab): void => {
    setFilter(tab)
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (tab === 'all') next.delete('view')
        else next.set('view', tab)
        return next
      },
      { replace: true }
    )
  }

  const hasArticleSaves = useMemo(() => postEntries.some(isArticleEntry), [postEntries])

  const shownPosts = useMemo(() => {
    if (filter === 'articles') {
      return postEntries.filter(isArticleEntry)
    }
    if (filter === 'posts') {
      return postEntries
    }
    if (filter === 'all') {
      return postEntries
    }
    return []
  }, [postEntries, filter])
  const shownJobs = useMemo(() => (filter === 'all' || filter === 'jobs' ? jobEntries : []), [filter, jobEntries])

  const emptyAll = postEntries.length === 0 && jobEntries.length === 0
  const emptyFiltered = !emptyAll && shownPosts.length === 0 && shownJobs.length === 0

  return (
    <div className="space-y-3 pb-6">
      <Card className="overflow-hidden border-border bg-white">
        <Card.Body className="p-0">
          <div className="px-4 py-4">
            <h1 className="text-xl font-bold tracking-tight text-text-primary">Saved items</h1>
            <div className="mt-3 flex flex-wrap gap-2" role="tablist" aria-label="Filter saved content">
              <button
                type="button"
                role="tab"
                aria-selected={filter === 'all'}
                className={cn(pillBase, filter === 'all' ? pillActive : pillIdle)}
                onClick={() => applyFilter('all')}
              >
                All
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={filter === 'posts'}
                className={cn(pillBase, filter === 'posts' ? pillActive : pillIdle)}
                onClick={() => applyFilter('posts')}
              >
                Posts
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={filter === 'jobs'}
                className={cn(pillBase, filter === 'jobs' ? pillActive : pillIdle)}
                onClick={() => applyFilter('jobs')}
              >
                Jobs
              </button>
              {hasArticleSaves ? (
                <button
                  type="button"
                  role="tab"
                  aria-selected={filter === 'articles'}
                  className={cn(pillBase, filter === 'articles' ? pillActive : pillIdle)}
                  onClick={() => applyFilter('articles')}
                >
                  Articles
                </button>
              ) : null}
            </div>
          </div>

          <div className="border-t border-border" />

          {emptyAll ? (
            <div className="flex flex-col items-center px-6 py-14 text-center">
              <SavedEmptyIllustration className="max-w-[280px]" />
              <h2 className="mt-8 text-lg font-bold text-text-primary">Start saving posts</h2>
              <p className="mt-2 max-w-sm text-sm text-text-secondary">Saved posts will show up here</p>
              <Link
                to="/feed"
                className="mt-6 inline-flex items-center justify-center rounded-full border border-brand-primary bg-white px-5 py-2 text-sm font-semibold text-brand-primary transition hover:bg-brand-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2"
              >
                Go to feed
              </Link>
            </div>
          ) : emptyFiltered ? (
            <div className="px-4 py-12 text-center">
              <p className="text-sm font-semibold text-text-primary">No saved items for this filter yet</p>
              <p className="mt-1 text-sm text-text-secondary">Save posts or jobs, then filter here.</p>
              <Link
                to="/feed"
                className="mt-4 inline-flex text-sm font-semibold text-brand-primary hover:underline"
              >
                Go to feed
              </Link>
            </div>
          ) : (
            <div className="space-y-4 p-4">
              {shownJobs.length > 0 ? (
                <div className="space-y-2">
                  <h2 className="text-sm font-semibold text-text-primary">Saved jobs</h2>
                  <ul className="space-y-2">
                    {shownJobs.map((entry) => (
                      <li key={entry.job.job_id} className="rounded-md border border-border p-3">
                        <Link to={`/jobs/${entry.job.job_id}`} className="font-semibold text-text-primary hover:underline">
                          {entry.job.title}
                        </Link>
                        <p className="text-sm text-text-secondary">{entry.job.company_name}</p>
                        <p className="text-xs text-text-tertiary">
                          {entry.job.location} • {entry.job.posted_time_ago}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {shownPosts.length > 0 ? (
                <div className="space-y-2">
                  <h2 className="text-sm font-semibold text-text-primary">Saved posts</h2>
                  <ul className="space-y-3">
                    {shownPosts.map((entry) => (
                      <li key={entry.post.post_id}>
                        <SavedPostCard entry={entry} />
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          )}
        </Card.Body>
      </Card>
    </div>
  )
}
