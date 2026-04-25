import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createPost } from '../../api/posts'
import { CreatePostModal, FeaturedDevToCarousel, FeedTabs, PostFeed, StartPostCard, FEED_QUERY_KEY } from '../../components/feed'
import type { FeedSort, FeedTab, ListFeedResponse } from '../../types/feed'

export default function FeedPage(): JSX.Element {
  const [tab, setTab] = useState<FeedTab>('for_you')
  const [sort, setSort] = useState<FeedSort>('top')
  const [modalOpen, setModalOpen] = useState(false)
  const queryClient = useQueryClient()

  const createPostMutation = useMutation({
    mutationFn: createPost,
    onSuccess: (newPost) => {
      queryClient.setQueryData<{ pages: ListFeedResponse[]; pageParams: number[] }>(
        [FEED_QUERY_KEY, tab, sort],
        (existing) => {
          if (!existing || existing.pages.length === 0) {
            return existing
          }

          const [firstPage, ...restPages] = existing.pages
          return {
            ...existing,
            pages: [
              {
                ...firstPage,
                posts: [newPost, ...firstPage.posts],
              },
              ...restPages,
            ],
          }
        },
      )
      setModalOpen(false)
    },
  })

  return (
    <div className="space-y-0 pb-6">
      <StartPostCard onStartPost={() => setModalOpen(true)} />
      <div className="mt-2">
        <FeaturedDevToCarousel />
      </div>
      <div className="mt-2 border-t border-[#e0e0e0] pt-2.5">
        <FeedTabs tab={tab} sort={sort} onTabChange={setTab} onSortChange={setSort} />
      </div>
      <div className="mt-3">
        <PostFeed tab={tab} sort={sort} />
      </div>
      <CreatePostModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreatePost={(payload) => createPostMutation.mutate(payload)}
        isSubmitting={createPostMutation.isPending}
      />
    </div>
  )
}
