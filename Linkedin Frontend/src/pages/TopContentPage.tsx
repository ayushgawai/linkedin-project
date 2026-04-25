import { Link } from 'react-router-dom'
import { RailFooter } from '../components/layout/RailFooter'
import linkedInLogo from '../assets/linkedin-logo.png'
import { HelpCenterExploreContent } from '../features/help/HelpCenterExploreContent'
import { useAuthStore } from '../store/authStore'

/** Public marketing-style “top content” surface at `/top-content` (signed-out header). */
export default function TopContentPage(): JSX.Element {
  const user = useAuthStore((state) => state.user)
  const showPublicHeader = !user

  return (
    <div className="min-h-screen bg-[#f4f2ee]">
      {showPublicHeader ? (
        <header className="sticky top-0 z-50 border-b border-[#e0dfdc] bg-white">
          <div className="mx-auto flex h-20 w-full max-w-[1440px] items-center justify-between px-6">
            <Link to="/">
              <img src={linkedInLogo} alt="LinkedIn" className="h-8 w-auto object-contain" />
            </Link>
            <div className="flex items-center gap-8">
              <div className="flex items-center gap-10 text-[16px] font-medium text-[#666]">
                <span>Top Content</span>
                <Link to="/login">People</Link>
                <Link to="/login">Learning</Link>
                <Link to="/login">Jobs</Link>
                <Link to="/login">Games</Link>
              </div>
              <div className="h-7 w-px bg-[#dadada]" />
              <button className="rounded-full border border-[#0a66c2] px-8 py-2.5 text-[16px] font-semibold text-[#0a66c2]">Sign in</button>
              <button className="rounded-full bg-[#0a66c2] px-8 py-2.5 text-[16px] font-semibold text-white">Join now</button>
            </div>
          </div>
        </header>
      ) : null}

      <HelpCenterExploreContent />

      <footer className="mt-10 border-t border-[#e0dfdc] bg-white py-4">
        <RailFooter className="mx-auto mt-0 max-w-[1440px] px-6 pb-4 text-[#666]" />
      </footer>
    </div>
  )
}
