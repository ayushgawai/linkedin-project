import { HelpCenterExploreContent } from '../features/help/HelpCenterExploreContent'

/** In-app Help Center / topic exploration (LinkedIn-style), shown at `/help`. */
export default function HelpCenterPage(): JSX.Element {
  return (
    <div className="min-h-[calc(100vh-58px)] bg-[#f4f2ee]">
      <HelpCenterExploreContent />
    </div>
  )
}
