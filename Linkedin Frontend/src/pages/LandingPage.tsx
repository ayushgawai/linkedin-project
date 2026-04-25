import { useState } from 'react'
import { BriefcaseBusiness, ChevronDown, ChevronUp, Gamepad2, GraduationCap, Newspaper, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import { RailFooter } from '../components/layout/RailFooter'
import { useGoogleSignIn } from '../hooks/useGoogleSignIn'
import googleLogo from '../assets/google-logo.png'
import linkedInLogo from '../assets/linkedin-logo.png'
import landingHero from '../assets/landing-hero.svg'
import spotlightOpenToWork from '../assets/spotlight-open-to-work.png'
import spotlightConversations from '../assets/spotlight-conversations.png'
import connectPeopleImage from '../assets/connect-people.svg'
import learnSkillsImage from '../assets/learn-skills.svg'
import whoIsLinkedinPhoto from '../assets/who-is-linkedin-photo.png'
import joinBannerCity from '../assets/join-banner-city.png'

const topicPills = [
  'Career',
  'Productivity',
  'Finance',
  'Soft Skills & Emotional Intelligence',
  'Project Management',
  'Education',
  'Technology',
  'Leadership',
  'Ecommerce',
]

const jobsPills = [
  'Engineering',
  'Business Development',
  'Finance',
  'Administrative Assistant',
  'Retail Associate',
  'Customer Service',
  'Operations',
  'Information Technology',
  'Marketing',
  'Human Resources',
]

const expandedJobsPills = [
  ...jobsPills,
  'Healthcare Service',
  'Sales',
  'Program and Project Management',
  'Accounting',
  'Arts and Design',
  'Community and Social Services',
  'Consulting',
  'Education',
  'Entrepreneurship',
  'Legal',
  'Media and Communications',
  'Military and Protective Services',
  'Product Management',
  'Purchasing',
  'Quality Assurance',
  'Real Estate',
  'Research',
  'Support',
  'Administrative',
]

const softwarePills = [
  'E-Commerce Platforms',
  'CRM Software',
  'Human Resources Management Systems',
  'Recruiting Software',
  'Sales Intelligence Software',
  'Project Management Software',
  'Help Desk Software',
  'Social Networking Software',
  'Desktop Publishing Software',
]

const gamePills = ['Patches', 'Zip', 'Mini Sudoku', 'Queens', 'Tango', 'Pinpoint', 'Crossclimb']
const learningTopics = [
  { title: 'Artificial Intelligence for Business', courses: '1,040+ courses' },
  { title: 'Business Analysis and Strategy', courses: '2,030+ courses' },
  { title: 'Business Software and Tools', courses: '3,480+ courses' },
  { title: 'Career Development', courses: '720+ courses' },
  { title: 'Customer Service', courses: '320+ courses' },
  { title: 'Diversity, Equity, and Inclusion (DEI)', courses: '340+ courses' },
]

const footerColumns = [
  {
    title: 'General',
    links: ['Sign Up', 'Help Center', 'About', 'Press', 'Blog', 'Careers', 'Developers'],
  },
  {
    title: 'Browse LinkedIn',
    links: ['Learning', 'Jobs', 'Games', 'Mobile', 'Services', 'Products', 'Top Companies', 'Top Startups', 'Top Colleges'],
  },
  {
    title: 'Business Solutions',
    links: ['Talent', 'Marketing', 'Sales', 'Learning'],
  },
  {
    title: 'Directories',
    links: ['Members', 'Jobs', 'Companies', 'Featured', 'Learning', 'Posts', 'Articles', 'Schools', 'News', 'News Letters', 'Services', 'Products', 'Advice', 'People Search'],
  },
]

const spotlightSlides = [
  {
    title: "Let the right people know you're open to work",
    description:
      'With the Open To Work feature, you can privately tell recruiters or publicly share with the LinkedIn community that you are looking for new job opportunities.',
    circleClass: 'bg-[radial-gradient(circle_at_35%_35%,#ffffff,#d3d1ce_65%,#b7b5b2)]',
    image: spotlightOpenToWork,
  },
  {
    title: 'Conversations today could lead to opportunity tomorrow',
    description:
      'Sending messages to people you know is a great way to strengthen relationships as you take the next step in your career.',
    circleClass: 'bg-[radial-gradient(circle_at_35%_35%,#ffffff,#d8d3d3_65%,#bcb7b7)]',
    image: spotlightConversations,
  },
]

function TopNavIcon({ icon, label, to }: { icon: JSX.Element; label: string; to?: string }): JSX.Element {
  const content = (
    <div className="hidden flex-col items-center text-[#666666] lg:flex">
      <span aria-hidden>{icon}</span>
      <span className="text-[11px] leading-tight">{label}</span>
    </div>
  )

  if (to) {
    return (
      <Link to={to}>
        {content}
      </Link>
    )
  }

  return content
}

export default function LandingPage(): JSX.Element {
  const [activeSlide, setActiveSlide] = useState(0)
  const [showAllJobs, setShowAllJobs] = useState(false)
  const [showLearningDropdown, setShowLearningDropdown] = useState(false)
  const googleSignIn = useGoogleSignIn()

  const goPrevSlide = () => {
    setActiveSlide((current) => (current - 1 + spotlightSlides.length) % spotlightSlides.length)
  }

  const goNextSlide = () => {
    setActiveSlide((current) => (current + 1) % spotlightSlides.length)
  }

  return (
    <div className="min-h-screen bg-[#f4f2ee] text-text-primary">
      <header className="sticky top-0 z-50 border-b border-[#e0dfdc] bg-white">
        <div className="mx-auto flex h-20 w-full max-w-[1440px] items-center justify-between px-6">
          <img src={linkedInLogo} alt="LinkedIn" className="h-8 w-auto object-contain" />
          <div className="flex items-center gap-6">
            <div className="hidden items-center gap-5 lg:flex">
              <TopNavIcon icon={<Newspaper className="h-4 w-4" />} label="Top Content" to="/top-content" />
              <TopNavIcon icon={<Users className="h-4 w-4" />} label="People" to="/login" />
              <TopNavIcon icon={<GraduationCap className="h-4 w-4" />} label="Learning" to="/login" />
              <TopNavIcon icon={<BriefcaseBusiness className="h-4 w-4" />} label="Jobs" to="/login" />
              <TopNavIcon icon={<Gamepad2 className="h-4 w-4" />} label="Games" to="/login" />
              <div className="h-7 w-px bg-[#dadada]" />
            </div>
            <Link to="/login" className="rounded-full border border-[#0a66c2] px-8 py-2.5 text-[16px] font-semibold text-[#0a66c2]">Sign in</Link>
            <Link to="/signup" className="rounded-full bg-[#0a66c2] px-8 py-2.5 text-[16px] font-semibold text-white">Join now</Link>
          </div>
        </div>
      </header>

      <main>
        <section className="w-full bg-white">
          <div className="mx-auto grid w-full max-w-[1600px] items-center gap-10 px-6 py-12 lg:grid-cols-[1fr_1.1fr]">
            <div>
            <h1 className="text-[52px] font-light leading-[1.1] text-[#1f1f1f]">Explore jobs and grow your network</h1>
            <div className="mt-8 max-w-[380px] space-y-3">
              <button
                type="button"
                disabled={googleSignIn.isPending}
                onClick={() => googleSignIn.mutate()}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#0a66c2] text-sm font-semibold text-white disabled:opacity-60"
              >
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white">
                  <img src={googleLogo} alt="Google" className="h-5 w-5 object-contain" />
                </span>
                {googleSignIn.isPending ? 'Opening Google…' : 'Continue with Google'}
              </button>
              <Link to="/login" className="flex h-12 w-full items-center justify-center rounded-full border border-[#1f1f1f] text-sm font-semibold text-[#1f1f1f]">
                Sign in with email
              </Link>
              <p className="pt-2 text-xs text-text-tertiary">
                By clicking Continue to join or sign in, you agree to LinkedIn Clone&apos;s User Agreement, Privacy Policy, and Cookie Policy.
              </p>
              <p className="pt-2 text-center text-sm text-text-secondary">
                New to LinkedIn?{' '}
                <Link to="/signup" className="font-semibold text-brand-primary">Join now</Link>
              </p>
            </div>
            </div>

            <div className="w-full max-w-[760px] lg:ml-auto lg:mr-[192px]">
              <img src={landingHero} alt="Professional learning and work illustration" className="h-auto w-full" />
            </div>
          </div>
        </section>

        <section className="bg-[#f3f2f0]">
          <div className="mx-auto grid min-h-[380px] w-full max-w-[1240px] content-center gap-12 px-6 py-10 lg:grid-cols-[1fr_1.6fr]">
            <div>
              <h2 className="text-[49px] font-light leading-[1.15] text-[#1f1f1f]">Explore top LinkedIn content</h2>
              <p className="mt-3 max-w-[480px] text-[18px] font-normal leading-[1.35] text-[#1f1f1f]">
                Discover relevant posts and expert insights -
                curated by topic and in one place.
              </p>
            </div>
            <div className="flex flex-wrap content-start gap-3.5">
              {topicPills.map((pill) => (
                <Link
                  key={pill}
                  to="/login"
                  className="rounded-full border border-[#6f6f6f] px-5 py-[10px] text-[20px] leading-none text-[#404040] hover:bg-black/5"
                >
                  {pill}
                </Link>
              ))}
              <Link to="/login" className="rounded-full border border-[#0a66c2] px-5 py-[10px] text-[20px] font-semibold leading-none text-[#0a66c2]">Show all</Link>
            </div>
          </div>
        </section>

        <section className="bg-white">
          <div className="mx-auto grid min-h-[380px] w-full max-w-[1240px] content-center gap-12 px-6 py-10 lg:grid-cols-[1fr_1.6fr]">
            <h2 className="text-[49px] font-light leading-[1.15] text-[#1f1f1f]">Find the right job or internship for you</h2>
            <div className="flex flex-wrap gap-3.5">
              {(showAllJobs ? expandedJobsPills : jobsPills).map((pill) => (
                <Link
                  key={pill}
                  to="/login"
                  className="rounded-full border border-[#6f6f6f] px-5 py-[10px] text-[20px] leading-none text-[#404040] hover:bg-black/5"
                >
                  {pill}
                </Link>
              ))}
              <button
                type="button"
                onClick={() => setShowAllJobs((value) => !value)}
                className="inline-flex items-center gap-2 rounded-full border border-[#6f6f6f] px-5 py-[10px] text-[20px] leading-none text-[#404040]"
              >
                {showAllJobs ? 'Show less' : 'Show more'}
                {showAllJobs ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </section>

        <section className="bg-[#f3f2ef]">
          <div className="mx-auto flex min-h-[380px] w-full max-w-[1240px] flex-col items-center justify-center gap-7 px-6 py-10 text-center">
            <h2 className="text-[44px] font-light text-[#a1482f]">Post your job for millions of people to see</h2>
            <button type="button" className="rounded-full border border-[#0a66c2] px-7 py-3 text-lg font-semibold text-[#0a66c2]">Post a job</button>
          </div>
        </section>

        <section className="bg-white py-14">
          <div className="mx-auto grid min-h-[380px] w-full max-w-[1128px] content-center gap-9 px-4 lg:grid-cols-[1fr_1.6fr]">
            <div>
              <h2 className="whitespace-nowrap text-[44px] font-light leading-[1.15] text-[#1f1f1f] max-lg:whitespace-normal max-lg:text-[36px]">
                Discover the best software tools
              </h2>
              <p className="mt-5 max-w-[440px] text-[18px] font-normal leading-[1.45] text-[#1f1f1f]">
                Connect with buyers who have first-hand experience to find the best products for you.
              </p>
            </div>
            <div className="flex flex-wrap content-start gap-x-2.5 gap-y-3">
              {softwarePills.map((pill) => (
                <Link
                  key={pill}
                  to="/login"
                  className="inline-flex min-h-[38px] items-center rounded-full border border-[#6f6f6f] px-4 py-[9px] text-[15px] font-medium leading-none text-[#404040] hover:bg-black/5"
                >
                  {pill}
                </Link>
              ))}
              <Link
                to="/login"
                className="inline-flex min-h-[38px] items-center rounded-full border border-[#0a66c2] px-4 py-[9px] text-[15px] font-semibold leading-none text-[#0a66c2]"
              >
                Show all
              </Link>
            </div>
          </div>
        </section>

        <section className="bg-white py-14">
          <div className="mx-auto grid min-h-[380px] w-full max-w-[1128px] content-center gap-9 px-4 lg:grid-cols-[1fr_1.6fr]">
            <div>
              <h2 className="whitespace-nowrap text-[44px] font-light leading-[1.15] text-[#1f1f1f] max-lg:whitespace-normal max-lg:text-[36px]">
                Keep your mind sharp with games
              </h2>
              <p className="mt-5 max-w-[440px] text-[18px] font-normal leading-[1.45] text-[#1f1f1f]">
                Take a break and reconnect with your network through quick daily games.
              </p>
            </div>
            <div className="flex flex-wrap content-start gap-x-2.5 gap-y-3">
              {gamePills.map((pill) => (
                <Link
                  key={pill}
                  to="/login"
                  className="inline-flex min-h-[38px] items-center rounded-full border border-[#6f6f6f] px-4 py-[9px] text-[15px] font-medium leading-none text-[#404040] hover:bg-black/5"
                >
                  {pill}
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-[#f3f2ef] py-16">
          <div className="mx-auto w-full max-w-[1240px] px-6">
            <div className="relative overflow-hidden">
              <div
                className="flex transition-transform duration-700 ease-out"
                style={{ transform: `translateX(-${activeSlide * 100}%)` }}
              >
                {spotlightSlides.map((slide) => (
                  <div key={slide.title} className="w-full shrink-0">
                    <div className="grid items-center gap-8 lg:grid-cols-[1fr_1.1fr]">
                      <div>
                        <h3 className="text-[44px] font-light leading-tight text-[#a1482f]">{slide.title}</h3>
                        <p className="mt-4 text-[34px] font-light leading-tight text-[#1f1f1f]">{slide.description}</p>
                      </div>
                      <div className={`mx-auto h-[360px] w-[360px] overflow-hidden rounded-full ${slide.circleClass}`}>
                        {'image' in slide && slide.image ? (
                          <img src={slide.image} alt={slide.title} className="h-full w-full object-cover" />
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-6 flex items-center justify-center gap-3">
              <button
                type="button"
                aria-label="Previous slide"
                onClick={goPrevSlide}
                className="h-10 w-10 rounded-full bg-[#4f4f4f] text-lg text-white"
              >
                ‹
              </button>
              <div className="flex items-center gap-2">
                {spotlightSlides.map((slide, index) => (
                  <button
                    key={slide.title}
                    type="button"
                    aria-label={`Go to slide ${index + 1}`}
                    onClick={() => setActiveSlide(index)}
                    className={`h-2.5 w-2.5 rounded-full ${activeSlide === index ? 'bg-[#0a66c2]' : 'bg-[#8f8f8f]'}`}
                  />
                ))}
              </div>
              <button
                type="button"
                aria-label="Next slide"
                onClick={goNextSlide}
                className="h-10 w-10 rounded-full bg-[#4f4f4f] text-lg text-white"
              >
                ›
              </button>
            </div>
          </div>
        </section>

        <section className="bg-white py-24">
          <div className="mx-auto grid w-full max-w-[1180px] gap-16 px-6 md:grid-cols-2">
            <div>
              <img src={connectPeopleImage} alt="Connect with people illustration" className="mb-7 h-56 w-56 object-contain" />
              <h3 className="text-[56px] font-light leading-tight text-[#1f1f1f]">Connect with people who can help</h3>
              <Link to="/login" className="mt-7 inline-flex rounded-full border border-[#1f1f1f] px-8 py-3.5 text-xl">Find people you know</Link>
            </div>
            <div>
              <img src={learnSkillsImage} alt="Learn skills illustration" className="mb-7 h-56 w-56 object-contain" />
              <h3 className="text-[56px] font-light leading-tight text-[#1f1f1f]">Learn the skills you need to succeed</h3>
              <div className="mt-7 w-full max-w-[390px]">
                <button
                  type="button"
                  onClick={() => setShowLearningDropdown((value) => !value)}
                  className="flex h-[58px] w-full items-center justify-between rounded border border-[#d0d0d0] bg-white px-5 text-[18px] font-normal text-[#1f1f1f]"
                >
                  <span className="truncate pr-3">Choose a topic to learn about</span>
                  <ChevronDown className="h-5 w-5 text-[#666]" />
                </button>
                {showLearningDropdown ? (
                  <div className="w-full rounded-b border border-t-0 border-[#d0d0d0] bg-white px-5 py-4 shadow-[0_4px_12px_rgba(0,0,0,0.12)]">
                    <div className="space-y-3">
                      {learningTopics.map((topic) => (
                        <div key={topic.title}>
                          <p className="whitespace-nowrap text-[16px] font-semibold leading-tight text-[#1f1f1f]">{topic.title}</p>
                          <p className="mt-1 text-[15px] text-[#666]">{topic.courses}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </section>

        <section className="overflow-hidden bg-[#f3f2ef] py-20">
          <div className="mx-auto grid w-full max-w-[1400px] items-center gap-10 px-0 lg:grid-cols-[560px_1fr]">
            <div className="ml-14 max-w-[540px] bg-[#eeece9] px-10 py-12">
              <h3 className="text-[46px] font-light leading-[1.15] text-[#a1482f]">Who is LinkedIn for?</h3>
              <p className="mt-3 max-w-[410px] text-[20px] leading-[1.4] text-[#1f1f1f]">Anyone looking to navigate their professional life.</p>
              <div className="mt-8 space-y-3">
                <Link
                  to="/login"
                  className="flex h-[56px] w-full items-center justify-between bg-[#e3e1dd] px-5 text-left text-[17px] font-medium text-[#1f1f1f] hover:opacity-90"
                >
                  Find a coworker or classmate <span className="text-[24px] leading-none text-[#555]">{'>'}</span>
                </Link>
                <Link
                  to="/login"
                  className="flex h-[56px] w-full items-center justify-between bg-[#e3e1dd] px-5 text-left text-[17px] font-medium text-[#1f1f1f] hover:opacity-90"
                >
                  Find a new job <span className="text-[24px] leading-none text-[#555]">{'>'}</span>
                </Link>
                <Link
                  to="/login"
                  className="flex h-[56px] w-full items-center justify-between bg-[#e3e1dd] px-5 text-left text-[17px] font-medium text-[#1f1f1f] hover:opacity-90"
                >
                  Find a course or training <span className="text-[24px] leading-none text-[#555]">{'>'}</span>
                </Link>
              </div>
            </div>
            <div className="h-[760px] w-[760px] justify-self-end overflow-hidden rounded-full bg-[radial-gradient(circle_at_35%_35%,#ffffff,#dfd6cd_65%,#c5b6a5)] lg:mr-[-120px]">
              <img src={whoIsLinkedinPhoto} alt="People collaborating" className="h-full w-full object-cover" />
            </div>
          </div>
        </section>

        <section className="bg-white">
          <div className="mx-auto w-full max-w-[1240px] px-6 py-16">
            <h2 className="text-[58px] font-light leading-tight text-[#1f1f1f]">
              Join your colleagues, classmates, and friends on <br />
              LinkedIn
            </h2>
            <Link
              to="/login"
              className="mt-6 inline-flex rounded-full bg-[#0a66c2] px-7 py-3 text-lg font-semibold text-white hover:bg-[#004182]"
            >
              Get started
            </Link>
          </div>
          <img src={joinBannerCity} alt="LinkedIn campus and city scene" className="h-auto w-full object-cover" />
        </section>

        <footer className="bg-[#f3f2ef]">
          <div className="mx-auto grid w-full max-w-[1200px] gap-8 px-4 py-12 sm:grid-cols-2 lg:grid-cols-5">
            <div className="pt-1">
              <Link to="/login" aria-label="Sign in">
                <img src={linkedInLogo} alt="LinkedIn" className="h-7 w-auto object-contain" />
              </Link>
            </div>
            {footerColumns.map((column) => (
              <div key={column.title}>
                <h4 className="text-base font-semibold text-[#1f1f1f]">{column.title}</h4>
                <ul className="mt-3 space-y-1 text-sm text-[#444]">
                  {column.links.map((link) => (
                    <li key={link}>
                      <Link to="/login" className="hover:text-[#0a66c2] hover:underline">
                        {link}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="border-t border-[#e0dfdc] bg-white py-4">
            <RailFooter className="mx-auto mt-0 max-w-[1200px] px-4 text-[#666]" />
          </div>
        </footer>
      </main>
    </div>
  )
}
