import { timeAgoShort } from './formatters'
import type { TechNewsListItem } from '../api/external'
import type { Post } from '../types/feed'

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return 'link'
  }
}

/** Maps a feed article (e.g. dev.to card) to a `Post` shape for the saved list. */
export function techNewsItemToSavedPost(item: TechNewsListItem): Post {
  return {
    post_id: item.id,
    author_name: item.author,
    author_headline: 'Article on DEV',
    author_degree: '3rd',
    author_avatar_url: null,
    created_time_ago: timeAgoShort(item.createdAt),
    visibility: 'anyone',
    content: ' ',
    media_type: 'article',
    media_url: item.coverImage ?? undefined,
    article_title: item.title,
    article_source: hostname(item.url),
    reactions_count: 0,
    comments_count: 0,
    reposts_count: 0,
    liked_by_me: false,
    reaction_icons: ['like'],
    comments: [],
  }
}
