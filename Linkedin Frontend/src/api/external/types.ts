/** Raw Hacker News (Algolia) hit */
export type HNHit = {
  objectID: string
  title: string
  url: string | null
  author: string
  points: number
  num_comments: number
  created_at: string
  _tags: string[]
}

export type HNSearchResponse = {
  hits: HNHit[]
  page: number
  nbPages: number
  nbHits: number
  hitsPerPage: number
}

export type HNSearchByDateResponse = HNSearchResponse

/** Dev.to */
export type DevToArticle = {
  id: number
  title: string
  description: string
  url: string
  cover_image: string | null
  social_image: string | null
  published_at: string
  reading_time_minutes: number
  user: { name: string; profile_image: string; username: string }
  tag_list: string
}

export type RemotiveJob = {
  id: string
  url: string
  title: string
  company_name: string
  company_logo: string
  category: string
  job_type: string
  publication_date: string
  candidate_required_location: string
  salary: string
  description: string
  tags: string | string[] | null
}

export type RemotiveRemoteJobsResponse = {
  job_count: number
  jobs: RemotiveJob[]
}

export type ArbeitnowJob = {
  slug: string
  company_name: string
  title: string
  description: string
  remote: boolean
  url: string
  tags: string[] | null
  job_types: string[] | null
  location: string
  created_at: string
}

export type ArbeitnowResponse = { data: ArbeitnowJob[] }
