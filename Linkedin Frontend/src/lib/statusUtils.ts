import type { MemberApplicationBackendStatus, MemberApplicationTab } from '../types/tracker'

export function mapStatusToTab(status: MemberApplicationBackendStatus): MemberApplicationTab {
  if (status === 'rejected') {
    return 'rejected'
  }
  if (status === 'offer') {
    return 'offer'
  }
  if (status === 'interview') {
    return 'interview'
  }
  // submitted, under_review, and raw backend "reviewing" (before normalize) belong in Applied.
  if ((status as string) === 'reviewing') {
    return 'applied'
  }
  return 'applied'
}

export function getStatusLabel(status: MemberApplicationBackendStatus): string {
  if ((status as string) === 'reviewing') return 'Reviewing'
  switch (status) {
    case 'submitted':
      return 'Submitted'
    case 'under_review':
      return 'Reviewing'
    case 'interview':
      return 'Interview'
    case 'offer':
      return 'Offer'
    case 'rejected':
      return 'Rejected'
    default:
      return 'Unknown'
  }
}

export function getStatusColor(status: MemberApplicationBackendStatus): string {
  if ((status as string) === 'reviewing') return 'text-text-secondary'
  switch (status) {
    case 'submitted':
    case 'under_review':
      return 'text-text-secondary'
    case 'interview':
    case 'offer':
      return 'text-success'
    case 'rejected':
      return 'text-danger'
    default:
      return 'text-text-secondary'
  }
}
