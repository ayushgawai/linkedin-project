/** Pending connection requests — used by My Network and nav badge counts (single source of truth for mocks). */
export type PendingInvitation = {
  request_id: string
  name: string
  headline: string
  mutual: number
}

export const PENDING_CONNECTION_INVITATIONS: PendingInvitation[] = [
  { request_id: 'inv-1', name: 'Nora White', headline: 'Product Manager', mutual: 3 },
  { request_id: 'inv-2', name: 'Sam Lee', headline: 'Backend Engineer', mutual: 4 },
  { request_id: 'inv-3', name: 'Isha Patel', headline: 'Recruiter', mutual: 5 },
]
