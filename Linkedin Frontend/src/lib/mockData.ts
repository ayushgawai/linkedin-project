import type { Post } from '../types/feed'
import type { NotificationRecord, NotificationType } from '../types/notifications'
import type { Member } from '../types'

const names = [
  ['Ava Patel', 'Frontend Engineer | React | TypeScript'],
  ['Noah Chen', 'Distributed Systems TA | Kafka | FastAPI'],
  ['Mia Johnson', 'Product Designer | UX Researcher'],
  ['Ethan Nguyen', 'Backend Engineer | Python | Microservices'],
  ['Sophia Lee', 'Data Analyst | SQL | Visualization'],
  ['Liam Garcia', 'SWE Intern | Full-Stack Development'],
  ['Isabella Kim', 'Recruiter | Tech Hiring | Employer Branding'],
  ['Mason Brown', 'Cloud Engineer | AWS | Kubernetes'],
  ['Olivia Davis', 'AI Engineer | LLM Ops | MLOps'],
  ['Lucas Martin', 'Software Architect | Event-Driven Systems'],
]

const timeAgo = ['2m', '9m', '18m', '34m', '1h', '2h', '4h', '8h', '12h', '1d', '2d', '3d']
const paragraphs = [
  'Built a reusable design token system today. The team velocity gain is already visible across our feature squads.',
  'Exploring event-driven architecture patterns for async workflows. Strongly considering outbox + idempotent consumers.',
  'Shipping polished UI is all about small spacing and contrast decisions. Tiny details compound into trust.',
  'Just wrapped an internal demo of our candidate funnel analytics dashboard. Feedback loop is getting tighter.',
  'Thinking about balancing product speed with maintainability. Boundaries and contracts matter more than ever.',
]

function randomItem<T>(arr: T[], index: number): T {
  return arr[index % arr.length]
}

function makeComments(postId: string, index: number) {
  return [
    {
      comment_id: `${postId}-c1`,
      author_name: 'Jordan Blake',
      author_headline: 'Software Engineer',
      author_avatar_url: null,
      text: 'Great perspective. This resonates with what we are seeing as well.',
      time_ago: randomItem(timeAgo, index + 2),
    },
    {
      comment_id: `${postId}-c2`,
      author_name: 'Priya Nair',
      author_headline: 'Engineering Manager',
      author_avatar_url: null,
      text: 'Love this. Curious how you plan to measure impact next sprint?',
      time_ago: randomItem(timeAgo, index + 4),
    },
  ]
}

export const MOCK_POSTS: Post[] = Array.from({ length: 30 }).map((_, index) => {
  const [authorName, authorHeadline] = randomItem(names, index)
  const mediaSelector = index % 4
  const postId = `post-${index + 1}`

  if (mediaSelector === 1) {
    return {
      post_id: postId,
      author_name: authorName,
      author_degree: (['1st', '2nd', '3rd'] as const)[index % 3],
      author_headline: authorHeadline,
      author_avatar_url: null,
      created_time_ago: randomItem(timeAgo, index),
      visibility: 'anyone',
      content: `${randomItem(paragraphs, index)} Sharing a quick visual from today's build review.`,
      media_type: 'image',
      media_url: `https://picsum.photos/seed/linkedin-feed-${index}/1200/675`,
      reactions_count: 20 + index * 3,
      comments_count: 4 + (index % 7),
      reposts_count: 1 + (index % 4),
      liked_by_me: false,
      reaction_icons: ['like', 'celebrate'],
      comments: makeComments(postId, index),
    }
  }

  if (mediaSelector === 2) {
    return {
      post_id: postId,
      author_name: authorName,
      author_degree: (['1st', '2nd', '3rd'] as const)[index % 3],
      author_headline: authorHeadline,
      author_avatar_url: null,
      created_time_ago: randomItem(timeAgo, index),
      visibility: 'connections',
      content: `${randomItem(paragraphs, index)} Worth reading if you are scaling distributed teams.`,
      media_type: 'article',
      media_url: `https://picsum.photos/seed/article-${index}/300/168`,
      article_title: 'Designing for High-Velocity Product Teams',
      article_source: 'engineeringweekly.dev',
      reactions_count: 30 + index * 2,
      comments_count: 2 + (index % 5),
      reposts_count: 2 + (index % 3),
      liked_by_me: false,
      reaction_icons: ['like', 'insightful'],
      comments: makeComments(postId, index),
    }
  }

  if (mediaSelector === 3) {
    return {
      post_id: postId,
      author_name: authorName,
      author_degree: (['1st', '2nd', '3rd'] as const)[index % 3],
      author_headline: authorHeadline,
      author_avatar_url: null,
      created_time_ago: randomItem(timeAgo, index),
      visibility: 'anyone',
      content: 'Quick poll for fellow engineers: where do you spend most review time?',
      media_type: 'poll',
      poll_options: [
        { id: `${postId}-p1`, label: 'Architecture decisions', votes: 54 + index },
        { id: `${postId}-p2`, label: 'Code quality & style', votes: 42 + index },
        { id: `${postId}-p3`, label: 'Testing gaps', votes: 36 + index },
      ],
      reactions_count: 44 + index * 2,
      comments_count: 7 + (index % 5),
      reposts_count: 4 + (index % 4),
      liked_by_me: false,
      reaction_icons: ['like', 'celebrate', 'insightful'],
      comments: makeComments(postId, index),
    }
  }

  return {
    post_id: postId,
    author_name: authorName,
    author_degree: (['1st', '2nd', '3rd'] as const)[index % 3],
    author_headline: authorHeadline,
    author_avatar_url: null,
    created_time_ago: randomItem(timeAgo, index),
    visibility: 'anyone',
    content: `${randomItem(paragraphs, index)} ${randomItem(paragraphs, index + 1)}`,
    media_type: 'text',
    reactions_count: 12 + index * 3,
    comments_count: 1 + (index % 5),
    reposts_count: index % 4,
    liked_by_me: false,
    reaction_icons: ['like'],
    comments: makeComments(postId, index),
  }
})

const notificationTypes: NotificationType[] = [
  'connection_request',
  'post_reaction',
  'post_comment',
  'job_recommendation',
  'application_status',
  'ai_completed',
  'message',
  'milestone',
]

function notificationContent(type: NotificationType): { title: string; preview: string; target_url: string } {
  switch (type) {
    case 'connection_request':
      return { title: 'Jane Doe wants to connect', preview: '2 mutual connections', target_url: '/mynetwork/invitations' }
    case 'post_reaction':
      return { title: 'John Smith and 12 others reacted to your post', preview: '“Great work on the release”', target_url: '/feed' }
    case 'post_comment':
      return { title: 'Sarah commented on your post', preview: '“Love this perspective on system design.”', target_url: '/feed' }
    case 'job_recommendation':
      return { title: 'New Senior Engineer role at Acme matches your profile', preview: 'Posted 2h ago • Easy Apply', target_url: '/jobs/search' }
    case 'application_status':
      return { title: 'Your application for Backend Engineer moved to Interview', preview: 'Tap to view status details', target_url: '/jobs' }
    case 'ai_completed':
      return { title: 'Your AI shortlist for Senior PM role is ready', preview: 'Generated suggestions and match rationale', target_url: '/recruiter/ai' }
    case 'message':
      return { title: 'You have a new message from Alex Morgan', preview: '“Can we review this today?”', target_url: '/messaging' }
    case 'milestone':
      return { title: 'You appeared in 8 searches this week', preview: 'Keep profile activity high to improve reach', target_url: '/analytics' }
    default:
      return { title: 'New notification', preview: 'Open for details', target_url: '/feed' }
  }
}

export const MOCK_NOTIFICATIONS: NotificationRecord[] = Array.from({ length: 40 }).map((_, index) => {
  const type = notificationTypes[index % notificationTypes.length] ?? 'message'
  const content = notificationContent(type)

  return {
    notification_id: `notif-${index + 1}`,
    type,
    actor_name: ['Jane Doe', 'John Smith', 'Sarah Kim', 'Alex Morgan', 'Ravi Patel'][index % 5] ?? 'Jane Doe',
    actor_avatar_url: null,
    title: content.title,
    preview: content.preview,
    timestamp: ['2m', '12m', '1h', '4h', '1d', '2d'][index % 6] ?? '1h',
    unread: index % 3 === 0,
    target_url: content.target_url,
  }
})

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

/** Generic list entry for share/invite pickers only — not the signed-in user’s profile. */
const seedListMember: Member = {
  member_id: 'seed-list-1',
  email: 'list1@example.com',
  full_name: 'Member',
  headline: null,
  bio: null,
  location: null,
  skills: [],
  profile_photo_url: null,
  cover_photo_url: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
}

const otherMembers: Member[] = Array.from({ length: 10 }).map((_, index) => ({
  member_id: `demo-member-${index + 2}`,
  email: `person${index + 2}@example.com`,
  full_name: ['Ava Patel', 'Noah Chen', 'Mia Johnson', 'Ethan Nguyen', 'Sophia Lee', 'Liam Garcia', 'Isabella Kim', 'Mason Brown', 'Olivia Davis', 'Lucas Martin'][index] ?? `Member ${index + 2}`,
  headline: ['Frontend Engineer', 'Distributed Systems TA', 'Product Designer', 'Backend Engineer', 'Data Analyst', 'SWE Intern', 'Recruiter', 'Cloud Engineer', 'AI Engineer', 'Software Architect'][index] ?? 'Engineer',
  bio: 'Tech professional focused on practical execution and collaborative delivery.',
  location: ['San Jose, CA', 'Austin, TX', 'Seattle, WA', 'Remote'][index % 4],
  skills: ['React', 'TypeScript', 'Python'].slice(0, 2 + (index % 2)),
  profile_photo_url: null,
  cover_photo_url: null,
  created_at: new Date(Date.now() - index * 86400000).toISOString(),
  updated_at: new Date(Date.now() - index * 43200000).toISOString(),
}))

const mockRecruiterMember: Member = {
  member_id: 'demo-recruiter-1',
  email: 'recruiter@example.com',
  full_name: 'Recruiter',
  headline: null,
  bio: null,
  location: null,
  skills: [],
  profile_photo_url: null,
  cover_photo_url: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
}

export const mockMembers: Member[] = [seedListMember, ...otherMembers, mockRecruiterMember]

export function seedDemoData() {
  const first = ['Ava', 'Noah', 'Mia', 'Liam', 'Sophia', 'Ethan', 'Isla', 'Lucas', 'Nora', 'Arjun']
  const last = ['Patel', 'Nguyen', 'Shah', 'Kim', 'Diaz', 'Wong', 'Taylor', 'Khan', 'Singh', 'Carter']
  const companies = ['Acme Systems', 'Nimbus Labs', 'Northwind Works', 'Contoso Cloud', 'Vertex Forge', 'Futura Stack']
  const titles = ['Software Engineer', 'Frontend Engineer', 'Backend Engineer', 'Data Engineer', 'Product Designer', 'Recruiter']
  const skills = ['React', 'TypeScript', 'Node.js', 'Python', 'Kafka', 'FastAPI', 'SQL', 'System Design']

  const members = [...mockMembers, ...Array.from({ length: 49 }).map((_, i) => ({
    member_id: `seed-member-${i + 1}`,
    email: `member${i + 1}@example.com`,
    full_name: `${first[i % first.length]} ${last[i % last.length]}`,
    headline: `${titles[i % titles.length]} at ${companies[i % companies.length]}`,
    bio: 'Experienced professional focused on shipping robust products and collaborating across teams.',
    location: ['San Jose, CA', 'Austin, TX', 'Seattle, WA', 'Remote'][i % 4],
    skills: [skills[i % skills.length], skills[(i + 1) % skills.length], skills[(i + 2) % skills.length]],
    profile_photo_url: null,
    cover_photo_url: null,
    created_at: new Date(Date.now() - i * 86400000).toISOString(),
    updated_at: new Date(Date.now() - i * 43200000).toISOString(),
  }))]

  const jobs = Array.from({ length: 60 }).map((_, i) => ({
    job_id: `seed-job-${i + 1}`,
    recruiter_id: `seed-member-${(i % 12) + 1}`,
    title: `${titles[i % titles.length]} (${i + 1})`,
    description: 'Join a collaborative team building distributed systems products with strong reliability goals.',
    location: ['San Jose, CA', 'San Francisco, CA', 'New York, NY', 'Remote'][i % 4],
    employment_type: (['full_time', 'part_time', 'contract', 'internship', 'temporary'] as const)[i % 5],
    work_mode: (['remote', 'hybrid', 'onsite'] as const)[i % 3],
    salary_min: 90000 + i * 500,
    salary_max: 130000 + i * 650,
    currency: 'USD',
    is_active: i % 7 !== 0,
    posted_at: new Date(Date.now() - i * 86400000).toISOString(),
    updated_at: new Date(Date.now() - i * 43200000).toISOString(),
  }))

  const applications = Array.from({ length: 220 }).map((_, i) => ({
    application_id: `seed-app-${i + 1}`,
    job_id: jobs[i % jobs.length]?.job_id ?? 'seed-job-1',
    member_id: members[i % members.length]?.member_id ?? 'seed-member-1',
    resume_url: 'https://example.com/resume.pdf',
    cover_letter: 'I am excited to apply and bring strong engineering execution and collaboration skills.',
    status: (['submitted', 'under_review', 'shortlisted', 'rejected', 'accepted'] as const)[i % 5],
    applied_at: new Date(Date.now() - i * 3600000).toISOString(),
    updated_at: new Date(Date.now() - i * 1800000).toISOString(),
  }))

  const threads = Array.from({ length: 32 }).map((_, i) => ({
    thread_id: `seed-thread-${i + 1}`,
    participant_member_ids: [members[i % members.length]?.member_id ?? 'seed-member-1', members[(i + 1) % members.length]?.member_id ?? 'seed-member-2'],
    last_message_id: `seed-msg-${i * 3 + 1}`,
    created_at: new Date(Date.now() - i * 86400000).toISOString(),
    updated_at: new Date(Date.now() - i * 1200000).toISOString(),
  }))

  const messages = Array.from({ length: 120 }).map((_, i) => ({
    message_id: `seed-msg-${i + 1}`,
    thread_id: threads[i % threads.length]?.thread_id ?? 'seed-thread-1',
    sender_member_id: members[i % members.length]?.member_id ?? 'seed-member-1',
    body: 'Quick update from the team. Let us sync on the next step.',
    sent_at: new Date(Date.now() - i * 900000).toISOString(),
    read_at: i % 3 === 0 ? new Date(Date.now() - i * 800000).toISOString() : null,
  }))

  return {
    members,
    jobs,
    applications,
    threads,
    messages,
    notifications: MOCK_NOTIFICATIONS,
  }
}
