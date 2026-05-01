import { Globe2 } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { PostOptionsMenu } from '../../components/feed/PostOptionsMenu'
import { cn } from '../../lib/cn'
import type { SavedPostEntry } from '../../types/saved'

function orgInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) {
    return (parts[0]!.charAt(0) + parts[parts.length - 1]!.charAt(0)).toUpperCase()
  }
  return name.slice(0, 2).toUpperCase() || 'Co'
}

type SavedPostCardProps = {
  entry: SavedPostEntry
}

export function SavedPostCard({ entry }: SavedPostCardProps): JSX.Element {
  const { post, externalUrl } = entry
  const [expanded, setExpanded] = useState(false)
  const bodyText = post.content.trim()
  const hasBody = bodyText.length > 0
  const contentShouldClamp = bodyText.length > 220

  const isExternal = Boolean(externalUrl)

  return (
    <article className="overflow-hidden rounded-lg border border-border bg-white">
      <div className="p-4">
        <header className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <div
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-sm bg-gradient-to-br from-blue-500 to-blue-700 text-sm font-bold text-white"
              aria-hidden
            >
              {orgInitials(post.author_name)}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-text-primary">
                <span className="border-b border-transparent transition hover:border-text-primary">{post.author_name}</span>
              </p>
              <p className="text-xs text-text-secondary">{post.author_headline}</p>
              <p className="mt-0.5 flex items-center gap-1 text-xs text-text-tertiary">
                {post.created_time_ago}
                <span>•</span>
                <Globe2 className="h-3.5 w-3.5" aria-hidden />
              </p>
            </div>
          </div>
          <PostOptionsMenu variant="saved" entry={entry} />
        </header>

        {hasBody ? (
          <div className="mt-3 space-y-2">
            <p
              className={cn(
                'whitespace-pre-wrap text-sm text-text-primary',
                !expanded && contentShouldClamp && 'line-clamp-3',
              )}
            >
              {bodyText}
            </p>
            {contentShouldClamp ? (
              <button
                type="button"
                onClick={() => setExpanded((e) => !e)}
                className="text-xs font-semibold text-text-secondary hover:text-text-primary"
              >
                {expanded ? 'See less' : '…see more'}
              </button>
            ) : null}
          </div>
        ) : null}

        {post.media_type === 'image' && post.media_url ? (
          <div className="mt-3 overflow-hidden rounded-md border border-border bg-black/5" style={{ aspectRatio: '16 / 9' }}>
            <img src={post.media_url} alt="" className="h-full w-full object-cover" />
          </div>
        ) : null}

        {post.media_type === 'article' ? (
          (() => {
            const inner = (
              <div className="flex flex-col sm:flex-row">
                {post.media_url ? (
                  <img src={post.media_url} alt="" className="h-28 w-full object-cover sm:h-full sm:min-h-[7rem] sm:w-44" />
                ) : (
                  <div className="h-28 w-full bg-gradient-to-br from-surface to-black/5 sm:min-h-[7rem] sm:w-44" />
                )}
                <div className="min-w-0 p-3">
                  <p className="line-clamp-2 text-sm font-semibold text-text-primary">{post.article_title}</p>
                  <p className="mt-1 text-xs text-text-secondary">{post.article_source}</p>
                </div>
              </div>
            )
            return isExternal ? (
              <a
                href={externalUrl ?? '#'}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 block overflow-hidden rounded-md border border-border bg-surface transition hover:bg-black/[0.03]"
              >
                {inner}
              </a>
            ) : (
              <Link
                to={`/feed?post=${encodeURIComponent(post.post_id)}`}
                className="mt-3 block overflow-hidden rounded-md border border-border bg-surface transition hover:bg-black/[0.03]"
              >
                {inner}
              </Link>
            )
          })()
        ) : null}
      </div>
    </article>
  )
}
