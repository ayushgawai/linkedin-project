import type { Member } from '../types'

const now = new Date().toISOString()

/** Read-only directory entries for viewing `/in/:memberId` when it is not the signed-in user. */
export const DIRECTORY_MEMBERS: Member[] = [
  {
    member_id: 'dir-sam-rivera',
    email: 'sam.rivera@example.com',
    full_name: 'Sam Rivera',
    headline: 'Platform Engineer',
    bio: 'Building reliable systems for growing teams.',
    location: 'Austin, TX',
    skills: ['Go', 'Kubernetes', 'AWS'],
    profile_photo_url: null,
    cover_photo_url: null,
    connections_count: 420,
    followers_count: 1200,
    created_at: now,
    updated_at: now,
  },
  {
    member_id: 'dir-jordan-lee',
    email: 'jordan.lee@example.com',
    full_name: 'Jordan Lee',
    headline: 'Product Designer',
    bio: null,
    location: 'Seattle, WA',
    skills: ['Figma', 'UX Research'],
    profile_photo_url: null,
    cover_photo_url: null,
    connections_count: 310,
    followers_count: 890,
    experiences: [
      {
        id: 'dir-j-exp-1',
        title: 'Senior Designer',
        company: 'Northwind Labs',
        employment_type: 'Full-time',
        start_date: '2022-03',
        end_date: null,
        location: 'Seattle, WA',
        workplace: 'Hybrid',
        description: 'Led design systems and cross-team discovery.',
        skills: ['Figma', 'Prototyping'],
      },
    ],
    educations: [
      {
        id: 'dir-j-edu-1',
        school: 'Design Institute',
        degree: 'BFA',
        field: 'Interaction Design',
        grade: null,
        start_date: '2014-09',
        end_date: '2018-05',
        skills: ['Typography'],
      },
    ],
    created_at: now,
    updated_at: now,
  },
]

export function getDirectoryMember(member_id: string): Member | undefined {
  return DIRECTORY_MEMBERS.find((m) => m.member_id === member_id)
}
