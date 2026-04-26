import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ChevronDown, ChevronRight, RefreshCw } from 'lucide-react'
import { cn } from '../../lib/cn'
import {
  type TechNewsListItem,
  clearExternalFailure,
  hackerNewsHitToTechNewsItem,
  getTopFrontPageStories,
} from '../../api/external'
import { EXTERNAL_FAILURE_KEYS, isExternalSectionSuppressed, recordExternalFailure } from '../../api/external/failureSession'
import { EXTERNAL_NEWS_REFETCH_INTERVAL_MS } from '../../lib/externalPolling'
import { isHnNewsSource } from '../../lib/newsSourceDisplay'
import { timeAgoShort } from '../../lib/formatters'
import { RailAdCard } from '../ads'
import { RailFooter } from './RailFooter'
import { EmptyState, Skeleton } from '../ui'

// Demo: when VITE_ENABLE_EXTERNAL_DATA is true, use the Refresh control so the audience sees a live
// Hacker News response — it shows the data is not a static hard-coded list.

type PuzzleItem = {
  id: string
  title: string
  subtitle: string
  icon: 'patches' | 'zip' | 'sudoku' | 'tango'
}

const PUZZLES: PuzzleItem[] = [
  { id: '1', title: 'Patches #36', subtitle: 'Piece it together', icon: 'patches' },
  { id: '2', title: 'Zip #12', subtitle: 'Connect the links', icon: 'zip' },
  { id: '3', title: 'Mini Sudoku #8', subtitle: 'Fill the grid', icon: 'sudoku' },
  { id: '4', title: 'Tango #5', subtitle: 'Balance the board', icon: 'tango' },
]

function PuzzleIcon({ kind }: { kind: PuzzleItem['icon'] }): JSX.Element {
  const box = 'h-7 w-7 shrink-0 overflow-hidden rounded-md'
  switch (kind) {
    case 'patches':
      return (
        <span className={`${box} border border-black/10`}>
          <span className="grid h-full w-full grid-cols-2 grid-rows-2 gap-px bg-white p-px">
            <span className="bg-[#1d5ed8]" />
            <span className="bg-[#c41e3a]" />
            <span className="bg-[#f5c400]" />
            <span className="bg-[#2563eb]" />
          </span>
        </span>
      )
    case 'zip':
      return (
        <span
          className={`${box} flex items-center justify-center border border-black/10 bg-[#e87800] text-xs font-bold text-white`}
        >
          Z
        </span>
      )
    case 'sudoku':
      return (
        <span
          className={`${box} grid grid-cols-3 grid-rows-3 gap-px border border-white/20 bg-[#0d4d2e] p-0.5`}
        >
          {Array.from({ length: 9 }).map((_, i) => (
            <span key={i} className="min-h-0 min-w-0 bg-[#1a7a52]" />
          ))}
        </span>
      )
    case 'tango':
      return (
        <span className={`${box} grid grid-cols-2 grid-rows-2 gap-px border border-black/10`}>
          <span className="bg-[#3b82f6]" />
          <span className="bg-[#facc15]" />
          <span className="bg-[#e5e7eb]" />
          <span className="bg-[#60a5fa]" />
        </span>
      )
    default:
      return <span className={box} />
  }
}

function sublineN(item: TechNewsListItem): string {
  const t = timeAgoShort(item.createdAt)
  if (isHnNewsSource(item.source)) {
    return [t, `${(item.points ?? 0).toLocaleString()} points`].join(' · ')
  }
  return t
}

function TechNewsSection(): JSX.Element | null {
  const qc = useQueryClient()
  const failureKey = EXTERNAL_FAILURE_KEYS.rightRailHn
  const suppressed = isExternalSectionSuppressed(failureKey)

  const query = useQuery({
    queryKey: ['external', 'hn', 'right-rail', 'top5'],
    queryFn: async (): Promise<TechNewsListItem[]> => {
      try {
        const res = await getTopFrontPageStories(10)
        const items = res.hits.slice(0, 5).map(hackerNewsHitToTechNewsItem)
        clearExternalFailure(failureKey)
        return items
      } catch (e) {
        recordExternalFailure(failureKey)
        console.error('[external] HN right rail', e)
        throw e
      }
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchInterval: EXTERNAL_NEWS_REFETCH_INTERVAL_MS,
    refetchIntervalInBackground: false,
    retry: false,
    enabled: !suppressed,
  })

  if (suppressed) {
    return null
  }

  if (query.isError) {
    return (
      <div className="px-3 py-2 sm:px-4">
        <EmptyState
          title="Could not load news"
          description="Could not load news. Try again."
          actionLabel="Try again"
          onAction={() => {
            void qc.invalidateQueries({ queryKey: ['external', 'hn', 'right-rail'] })
          }}
        />
      </div>
    )
  }

  const items = query.data ?? []

  return (
    <div className="px-3 py-3 sm:px-4 sm:pt-3.5">
      <div className="flex items-center justify-between gap-1">
        <h2 className="text-base font-semibold leading-tight text-[#191919]">Tech News</h2>
        <button
          type="button"
          onClick={() => {
            void query.refetch()
          }}
          className="shrink-0 rounded-full p-1.5 text-[#666] transition hover:bg-black/[0.06]"
          aria-label="Refresh tech news"
          title="Refresh"
          disabled={query.isFetching}
        >
          <RefreshCw className={`h-4 w-4 ${query.isFetching ? 'animate-spin' : ''}`} strokeWidth={1.75} />
        </button>
      </div>

      <ul className="mt-2 list-outside list-disc space-y-2.5 pl-4 text-[#191919]">
        {query.isLoading
          ? Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="ml-1 h-10 rounded-md" />)
          : items.map((item) => (
              <li key={item.id} className="pl-0.5">
                <a
                  href={item.url}
                  rel="noopener noreferrer"
                  target="_blank"
                  className="line-clamp-2 text-left text-sm font-bold leading-snug text-[#191919] hover:text-[#0a66c2]"
                >
                  {item.title}
                </a>
                <p className="mt-0.5 text-xs text-[#666666]">{sublineN(item)}</p>
              </li>
            ))}
      </ul>

      <Link
        to="/news"
        className="mt-2.5 block w-full text-left text-sm font-bold text-[#0a66c2] transition hover:underline"
      >
        See all
      </Link>
    </div>
  )
}

export function RightRail(): JSX.Element {
  const newsSuppressed = isExternalSectionSuppressed(EXTERNAL_FAILURE_KEYS.rightRailHn)
  return (
    <aside className="sticky top-[68px] hidden space-y-3 self-start md:block md:col-span-4 lg:col-span-3">
      <div
        className="overflow-hidden rounded-[10px] border border-[#e0e0e0] bg-white"
        style={{ boxShadow: '0 0 0 1px rgba(0,0,0,0.02)' }}
      >
        <TechNewsSection />
        <div
          className={cn('px-3 py-3 sm:px-4 sm:pb-3.5 sm:pt-3', !newsSuppressed && 'border-t border-[#e0e0e0]')}
        >
          <h2 className="text-base font-semibold leading-tight text-[#191919]">Today&apos;s puzzles</h2>

          <ul className="mt-1.5 space-y-0">
            {PUZZLES.map((puzzle) => (
              <li key={puzzle.id}>
                <button
                  type="button"
                  className="group flex w-full items-center gap-2.5 rounded-md py-2 pr-0 text-left transition hover:bg-black/[0.04]"
                >
                  <PuzzleIcon kind={puzzle.icon} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold leading-tight text-[#191919]">{puzzle.title}</span>
                    <span className="mt-0.5 block text-xs text-[#666666]">{puzzle.subtitle}</span>
                  </span>
                  <ChevronRight
                    className="h-4 w-4 shrink-0 text-[#666] opacity-80 group-hover:opacity-100"
                    strokeWidth={1.75}
                    aria-hidden
                  />
                </button>
              </li>
            ))}
          </ul>

          <button
            type="button"
            className="group mt-0.5 flex w-full items-center justify-start gap-0.5 text-left text-sm font-bold text-[#191919] transition hover:text-[#0a66c2]"
          >
            Show more
            <ChevronDown className="h-4 w-4" strokeWidth={2} aria-hidden />
          </button>
        </div>
      </div>

      <RailAdCard />

      <RailFooter />
    </aside>
  )
}
