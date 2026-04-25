import { FilePenLine, Image as ImageIcon, Play } from 'lucide-react'
import { Avatar } from '../ui'
import { useAuthStore } from '../../store/authStore'
import { useProfileStore } from '../../store/profileStore'

type StartPostCardProps = {
  onStartPost: () => void
  onAction?: (action: 'video' | 'photo' | 'article') => void
}

export function StartPostCard({ onStartPost, onAction }: StartPostCardProps): JSX.Element {
  const user = useAuthStore((s) => s.user)
  const firstName = useProfileStore((s) => s.profile.first_name)
  const lastName = useProfileStore((s) => s.profile.last_name)
  const avatar = useProfileStore((s) => s.profile.profile_photo_url)
  const fullName = `${firstName} ${lastName}`.trim()

  const handle = (key: 'video' | 'photo' | 'article') => {
    onAction?.(key)
    onStartPost()
  }

  return (
    <div
      className="overflow-hidden rounded-[10px] border border-[#e0e0e0] bg-white"
      style={{ boxShadow: '0 0 0 1px rgba(0,0,0,0.02)' }}
    >
      <div className="p-3 sm:p-4">
        <div className="flex items-center gap-3">
          <Avatar
            size="md"
            name={fullName || user?.full_name || 'You'}
            src={avatar || user?.profile_photo_url || undefined}
            className="shrink-0"
          />
          <button
            type="button"
            onClick={onStartPost}
            className="flex h-12 min-h-12 flex-1 items-center rounded-full border border-[#b0b0b0] bg-white px-4 text-left text-sm font-bold text-[#404040] transition hover:bg-[#f3f2f0] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0a66c2] focus-visible:ring-offset-2"
          >
            Start a post
          </button>
        </div>
      </div>
      <div className="border-t border-[#e0e0e0]">
        <div className="flex min-h-[52px] items-stretch justify-evenly">
          <button
            type="button"
            onClick={() => handle('video')}
            className="inline-flex min-w-0 flex-1 items-center justify-center gap-2 px-2 py-2.5 text-sm font-bold text-[#404040] transition hover:bg-[#f3f2ef] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#0a66c2]/30 sm:gap-2.5 sm:px-3"
          >
            <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-[3px] bg-[#0d4d2e] shadow-sm">
              <Play className="h-2.5 w-2.5 text-white" fill="white" strokeWidth={0} aria-hidden />
            </span>
            Video
          </button>
          <button
            type="button"
            onClick={() => handle('photo')}
            className="inline-flex min-w-0 flex-1 items-center justify-center gap-2 px-2 py-2.5 text-sm font-bold text-[#404040] transition hover:bg-[#f3f2ef] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#0a66c2]/30 sm:gap-2.5 sm:px-3"
          >
            <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-[3px] bg-[#378fe9] shadow-sm">
              <ImageIcon className="h-2.5 w-2.5 text-white" strokeWidth={1.85} aria-hidden />
            </span>
            Photo
          </button>
          <button
            type="button"
            onClick={() => handle('article')}
            className="inline-flex min-w-0 flex-1 items-center justify-center gap-2 px-2 py-2.5 text-sm font-bold text-[#404040] transition hover:bg-[#f3f2ef] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#0a66c2]/30 sm:gap-2.5 sm:px-3"
          >
            <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-[3px] bg-[#c45c1a] shadow-sm">
              <FilePenLine className="h-2.5 w-2.5 text-white" strokeWidth={1.85} aria-hidden />
            </span>
            Write article
          </button>
        </div>
      </div>
    </div>
  )
}
