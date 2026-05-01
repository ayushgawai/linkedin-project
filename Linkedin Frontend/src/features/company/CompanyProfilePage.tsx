import { useEffect, useMemo } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { BriefcaseBusiness, Users } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { Button, Card } from '../../components/ui'
import { useProfileStore } from '../../store/profileStore'
import { incrementCompanyProfileViews } from '../../api/jobs'

const COMPANY_DIRECTORY = [
  { id: 'co-f1', name: 'Nimbus Labs', tagline: 'Cloud analytics', industry: 'Software Development', size: '201-500 employees' },
  { id: 'co-f2', name: 'Vertex Forge', tagline: 'Developer tools', industry: 'Developer Platform', size: '51-200 employees' },
  { id: 'co-f3', name: 'Futura Stack', tagline: 'AI infrastructure', industry: 'Artificial Intelligence', size: '501-1,000 employees' },
] as const

export default function CompanyProfilePage(): JSX.Element {
  const queryClient = useQueryClient()
  const { companyId = '' } = useParams<{ companyId: string }>()
  const company = useMemo(() => COMPANY_DIRECTORY.find((c) => c.id === companyId), [companyId])
  const followed = useProfileStore((s) => s.followedCompanyIds)
  const toggleFollowCompany = useProfileStore((s) => s.toggleFollowCompany)

  useEffect(() => {
    if (!company) return
    void incrementCompanyProfileViews(company.name)
    void queryClient.invalidateQueries({ queryKey: ['jobs-discovery'] })
    void queryClient.invalidateQueries({ queryKey: ['jobs-search'] })
  }, [company, queryClient])

  if (!company) {
    return <Navigate to="/404" replace />
  }

  const isFollowing = followed.includes(company.id)

  return (
    <div className="space-y-4 pb-8">
      <Card>
        <Card.Body className="p-0">
          <div className="h-36 rounded-t-lg bg-gradient-to-r from-[#0a66c2] to-[#4f8ac9]" />
          <div className="p-5">
            <div className="-mt-12 inline-flex h-20 w-20 items-center justify-center rounded-xl border-4 border-white bg-white text-xl font-bold text-text-primary shadow-sm">
              {company.name
                .split(' ')
                .slice(0, 2)
                .map((part) => part.charAt(0))
                .join('')
                .toUpperCase()}
            </div>
            <h1 className="mt-3 text-2xl font-semibold text-text-primary">{company.name}</h1>
            <p className="text-text-secondary">{company.tagline}</p>
            <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-text-secondary">
              <span className="inline-flex items-center gap-1"><BriefcaseBusiness className="h-4 w-4" /> {company.industry}</span>
              <span className="inline-flex items-center gap-1"><Users className="h-4 w-4" /> {company.size}</span>
            </div>
            <div className="mt-4 flex gap-2">
              <Button variant={isFollowing ? 'tertiary' : 'secondary'} onClick={() => toggleFollowCompany(company.id)}>
                {isFollowing ? 'Following' : 'Follow'}
              </Button>
              <Button asChild variant="tertiary">
                <Link to="/jobs">View jobs</Link>
              </Button>
            </div>
          </div>
        </Card.Body>
      </Card>
    </div>
  )
}
