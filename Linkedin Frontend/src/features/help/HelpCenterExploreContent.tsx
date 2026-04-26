import type { LucideIcon } from 'lucide-react'
import {
  Briefcase,
  Laptop,
  Lightbulb,
  Megaphone,
  Rocket,
  Target,
} from 'lucide-react'
import { useToast } from '../../components/ui/Toast'

const exploreTags = [
  'Tips for Managing Stressors with Mental Toughness',
  'How to Navigate Difficult Conversations for Personal Growth',
  'Top Emerging AI Use Cases and Their Capabilities',
  'How Leaders Foster Psychological Safety',
  'Tips for Curating a Professional Network',
  'Tips for Optimizing Your LinkedIn Profile',
]

type EditorPick = {
  category: string
  title: string
  likes: string
  icon: LucideIcon
  iconClass: string
}

const editorsPicks: EditorPick[] = [
  { category: 'Career', title: 'Career Advancement Strategies for Mid-Career Professionals', likes: '818K likes', icon: Rocket, iconClass: 'text-[#0a66c2]' },
  { category: 'Leadership', title: 'Team Performance and Morale in Hybrid Organizations', likes: '489K likes', icon: Target, iconClass: 'text-[#915907]' },
  { category: 'Innovation', title: 'AI Trends and Innovations Shaping the Workplace', likes: '450K likes', icon: Lightbulb, iconClass: 'text-[#b24020]' },
  { category: 'Training & Development', title: 'Mindset Development Tips for New Managers', likes: '435K likes', icon: Lightbulb, iconClass: 'text-[#5c3bfe]' },
  { category: 'Leadership', title: 'Balancing Leadership Responsibilities Under Pressure', likes: '226K likes', icon: Target, iconClass: 'text-[#915907]' },
  { category: 'Career', title: 'Networking for Professionals in Competitive Industries', likes: '145K likes', icon: Rocket, iconClass: 'text-[#0a66c2]' },
  { category: 'Productivity', title: 'Workday Management Tips for Distributed Teams', likes: '138K likes', icon: Rocket, iconClass: 'text-[#057642]' },
  { category: 'Communication', title: 'Promoting Open Communication Across Levels', likes: '134K likes', icon: Lightbulb, iconClass: 'text-[#b24020]' },
]

type TopicCat = {
  name: string
  posts: string
  icon: LucideIcon
  iconClass: string
}

const topicCategories: TopicCat[] = [
  { name: 'Business Strategy', posts: '77K posts', icon: Target, iconClass: 'text-[#5c3bfe]' },
  { name: 'Marketing', posts: '69K posts', icon: Megaphone, iconClass: 'text-[#0a66c2]' },
  { name: 'Technology', posts: '56K posts', icon: Laptop, iconClass: 'text-[#057642]' },
  { name: 'Sales', posts: '48K posts', icon: Briefcase, iconClass: 'text-[#915907]' },
  { name: 'Leadership', posts: '50K posts', icon: Target, iconClass: 'text-[#b24020]' },
  { name: 'Innovation', posts: '50K posts', icon: Lightbulb, iconClass: 'text-[#e7a500]' },
  { name: 'Finance', posts: '48K posts', icon: Briefcase, iconClass: 'text-[#057642]' },
  { name: 'Career', posts: '60K posts', icon: Rocket, iconClass: 'text-[#0a66c2]' },
  { name: 'Productivity', posts: '29K posts', icon: Laptop, iconClass: 'text-[#5c3bfe]' },
  { name: 'Communication', posts: '27K posts', icon: Megaphone, iconClass: 'text-[#915907]' },
]

export function HelpCenterExploreContent(): JSX.Element {
  const { toast } = useToast()

  return (
    <main className="mx-auto w-full max-w-[1128px] px-4 pb-16 pt-6 sm:px-6 lg:px-8">
      <section className="text-center">
        <h1 className="text-2xl font-semibold leading-snug text-[#1f1f1f] sm:text-[28px]">
          What topics do you want to explore?
        </h1>
        <div className="mx-auto mt-8 flex max-w-[920px] flex-wrap justify-center gap-2 sm:gap-2.5">
          {exploreTags.map((topic) => (
            <button
              key={topic}
              type="button"
              className="rounded-full border border-[#d0d0d0] bg-white px-3.5 py-2 text-left text-[13px] font-normal leading-snug text-[#444] shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition hover:border-[#b6b6b6] hover:bg-[#fafafa]"
              onClick={() => toast({ variant: 'info', title: 'Topic exploration is a demo in this build.', description: topic })}
            >
              {topic}
            </button>
          ))}
        </div>
      </section>

      <section className="mt-16 sm:mt-20">
        <h2 className="text-3xl font-semibold tracking-tight text-[#1f1f1f] sm:text-[40px]">Editor&apos;s Picks</h2>
        <p className="mt-1 text-base text-[#666] sm:text-lg">Handpicked ideas and insights from professionals</p>
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {editorsPicks.map((item) => {
            const Icon = item.icon
            return (
              <button
                key={`${item.category}-${item.title}`}
                type="button"
                className="flex min-h-[148px] flex-col rounded-xl border border-[#e8e8e8] bg-white p-5 text-left shadow-[0_1px_3px_rgba(0,0,0,0.06)] transition hover:border-[#d0d0d0] hover:shadow-sm"
                onClick={() => toast({ variant: 'info', title: 'Article preview is not wired yet.' })}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-xs font-medium uppercase tracking-wide text-[#9a9a9a]">{item.category}</span>
                  <Icon className={`h-5 w-5 shrink-0 ${item.iconClass}`} strokeWidth={1.75} aria-hidden />
                </div>
                <h3 className="mt-4 line-clamp-2 text-lg font-semibold leading-snug text-[#1f1f1f]">{item.title}</h3>
                <p className="mt-auto pt-3 text-sm text-[#666]">{item.likes}</p>
              </button>
            )
          })}
        </div>
      </section>

      <section className="mt-16 sm:mt-20">
        <h2 className="text-3xl font-semibold tracking-tight text-[#1f1f1f] sm:text-[40px]">Topic Categories</h2>
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 lg:gap-4">
          {topicCategories.map((cat) => {
            const Icon = cat.icon
            return (
              <button
                key={cat.name}
                type="button"
                className="flex min-h-[160px] flex-col rounded-xl border border-[#e8e8e8] bg-white p-5 text-left shadow-[0_1px_3px_rgba(0,0,0,0.06)] transition hover:border-[#d0d0d0] hover:shadow-sm"
                onClick={() => toast({ variant: 'info', title: 'Category feed is a demo in this build.', description: cat.name })}
              >
                <Icon className={`h-6 w-6 ${cat.iconClass}`} strokeWidth={1.75} aria-hidden />
                <h3 className="mt-6 line-clamp-2 text-[17px] font-semibold leading-snug text-[#1f1f1f]">{cat.name}</h3>
                <p className="mt-auto pt-2 text-sm text-[#666]">{cat.posts}</p>
              </button>
            )
          })}
        </div>
      </section>
    </main>
  )
}
