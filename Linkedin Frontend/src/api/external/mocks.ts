import type { DevToArticle, HNSearchResponse, RemotiveRemoteJobsResponse } from './types'
import type { TechNewsListItem } from './adapters'

export const MOCK_HN_FOR_RAIL: HNSearchResponse = {
  hits: [
    {
      objectID: 'mock-1',
      title: 'Tech hiring picks up in Bay Area',
      url: 'https://news.ycombinator.com',
      author: 'mock',
      points: 128,
      num_comments: 45,
      created_at: new Date().toISOString(),
      _tags: ['story'],
    },
    {
      objectID: 'mock-2',
      title: 'Distributed systems roles trending on job boards',
      url: 'https://news.ycombinator.com',
      author: 'mock',
      num_comments: 32,
      points: 89,
      created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      _tags: ['story'],
    },
    {
      objectID: 'mock-3',
      title: 'Open-source databases see enterprise adoption',
      url: 'https://news.ycombinator.com',
      author: 'mock',
      num_comments: 12,
      points: 201,
      created_at: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
      _tags: ['story'],
    },
    {
      objectID: 'mock-4',
      title: 'AI tooling adoption accelerates across teams',
      url: 'https://news.ycombinator.com',
      author: 'mock',
      num_comments: 201,
      points: 340,
      created_at: new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString(),
      _tags: ['story'],
    },
  ],
  page: 0,
  nbPages: 1,
  nbHits: 4,
  hitsPerPage: 10,
}

const devUser = (name: string) => ({ name, profile_image: '', username: name.toLowerCase().replace(/\s/g, '') })

export const MOCK_DEVTO: DevToArticle[] = [
  {
    id: 9001,
    title: '10 patterns for healthy React codebases',
    description: 'A quick tour of practices that help teams move fast without breaking things.',
    url: 'https://dev.to',
    cover_image: null,
    social_image: null,
    published_at: new Date().toISOString(),
    reading_time_minutes: 5,
    user: devUser('Riley P'),
    tag_list: 'react typescript',
  },
  {
    id: 9002,
    title: 'Shipping smaller bundles with Vite 5',
    description: 'Why tree-shaking and chunk strategy matter for your users.',
    url: 'https://dev.to',
    cover_image: null,
    social_image: null,
    published_at: new Date().toISOString(),
    reading_time_minutes: 4,
    user: devUser('Alex M'),
    tag_list: 'vite javascript',
  },
]

export const MOCK_TECH_NEWS_LIST: TechNewsListItem[] = [
  {
    id: 'mock-hn-1',
    source: 'hn',
    title: 'Tech hiring picks up in Bay Area',
    url: 'https://news.ycombinator.com',
    author: 'hn_user',
    createdAt: new Date().toISOString(),
    points: 128,
    commentsCount: 45,
  },
  {
    id: 'dev-mock-1',
    source: 'devto',
    title: '10 patterns for healthy React codebases',
    url: 'https://dev.to',
    author: 'dev_author',
    createdAt: new Date().toISOString(),
    readTime: 5,
    coverImage: null,
    commentsCount: 0,
  },
]

const mockRemJob = (i: number): import('./types').RemotiveJob => ({
  id: `mock-r-${i}`,
  url: 'https://remotive.com/remote-jobs',
  title: 'Senior Frontend Engineer (React)',
  company_name: 'Demo Corp',
  company_logo: '',
  category: 'software-dev',
  job_type: 'Full-time',
  publication_date: new Date().toISOString().slice(0, 10),
  candidate_required_location: 'Worldwide',
  salary: '—',
  description: 'Mock external job when VITE_ENABLE_EXTERNAL_DATA=false.',
  tags: ['react', 'typescript', 'remote'],
})

export const MOCK_REMOTIVE_RESPONSE: RemotiveRemoteJobsResponse = {
  job_count: 5,
  jobs: [0, 1, 2, 3, 4].map((i) => mockRemJob(i)),
}
