import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import { getMemberDashboard, type MemberDashboardWindow } from '../../api/analytics'
import { listMemberApplications } from '../../api/applications'
import { mapStatusToTab } from '../../lib/statusUtils'
import { Avatar, Card, EmptyState, Skeleton } from '../../components/ui'
import { useAuthStore } from '../../store/authStore'

const windowOptions: Array<{ value: MemberDashboardWindow; label: string }> = [
  { value: '7d', label: 'Last 7 days' },
  { value: '14d', label: 'Last 14 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
]

function formatDate(value: string): string {
  const date = new Date(value)
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function KpiCard({ title, value, change }: { title: string; value: number; change: number }): JSX.Element {
  const positive = change >= 0
  return (
    <Card>
      <Card.Body className="p-4">
        <p className="text-sm text-text-secondary">{title}</p>
        <p className="mt-1 text-3xl font-bold text-text-primary">{value.toLocaleString()}</p>
        <p className={`mt-1 inline-flex items-center gap-1 text-sm font-semibold ${positive ? 'text-success' : 'text-danger'}`}>
          {positive ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
          {Math.abs(change).toFixed(1)}%
        </p>
      </Card.Body>
    </Card>
  )
}

function ChartSkeleton(): JSX.Element {
  return <Skeleton variant="rect" className="h-72 w-full" />
}

export default function AnalyticsPage(): JSX.Element {
  const user = useAuthStore((state) => state.user)
  const [window, setWindow] = useState<MemberDashboardWindow>('30d')

  const query = useQuery({
    queryKey: ['member-analytics', user?.member_id, window],
    queryFn: async () => {
      if (!user) throw new Error('No user')
      return getMemberDashboard(user.member_id, window)
    },
    enabled: Boolean(user),
    staleTime: 0,
    refetchInterval: 5_000,
    refetchOnWindowFocus: true,
  })

  const applicationsQuery = useQuery({
    queryKey: ['my-applications', user?.member_id],
    queryFn: () => {
      if (!user) {
        return Promise.resolve([])
      }
      return listMemberApplications(user.member_id)
    },
    enabled: Boolean(user),
    refetchInterval: 5000,
  })

  if (query.isLoading) {
    return (
      <div className="space-y-3 pb-6">
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <ChartSkeleton key={i} />)}</div>
        {Array.from({ length: 4 }).map((_, i) => <ChartSkeleton key={i + 10} />)}
      </div>
    )
  }

  if (!query.data) {
    return <EmptyState title="Unable to load analytics" description="Please refresh and try again." />
  }

  const data = query.data
  const applications = applicationsQuery.data ?? []
  const appliedCount = applications.filter((a) => mapStatusToTab(a.status) === 'applied').length
  const interviewCount = applications.filter((a) => mapStatusToTab(a.status) === 'interview').length
  const offerCount = applications.filter((a) => mapStatusToTab(a.status) === 'offer').length
  const rejectedCount = applications.filter((a) => mapStatusToTab(a.status) === 'rejected').length

  const funnelData = [
    { status: 'Applied', value: appliedCount, color: '#6B7280' },
    { status: 'Interview', value: interviewCount, color: '#0A66C2' },
    { status: 'Offer', value: offerCount, color: '#057642' },
    { status: 'Rejected', value: rejectedCount, color: '#CC1016' },
  ]

  const engagementData = Object.entries(data.engagement_breakdown).map(([key, value]) => ({ name: key, value }))

  return (
    <div className="space-y-3 pb-6">
      <Card>
        <Card.Body className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <h1 className="text-2xl font-semibold text-text-primary">Analytics and tools</h1>
            <p className="text-sm text-text-secondary">Private to you</p>
          </div>
          <div className="flex gap-2">
            {windowOptions.map((item) => (
              <button key={item.value} type="button" onClick={() => setWindow(item.value)} className={window === item.value ? 'rounded-full bg-brand-primary px-3 py-1 text-xs font-semibold text-white' : 'rounded-full bg-black/5 px-3 py-1 text-xs text-text-secondary'}>
                {item.label}
              </button>
            ))}
          </div>
        </Card.Body>
      </Card>

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        <KpiCard title="Profile views" value={data.kpis.profile_views.value} change={data.kpis.profile_views.change_pct} />
        <KpiCard title="Post impressions" value={data.kpis.post_impressions.value} change={data.kpis.post_impressions.change_pct} />
        <KpiCard title="Search appearances" value={data.kpis.search_appearances.value} change={data.kpis.search_appearances.change_pct} />
        <KpiCard title="Application response rate" value={data.kpis.application_response_rate.value} change={data.kpis.application_response_rate.change_pct} />
      </div>

      <Card>
        <Card.Header>
          <h2 className="text-lg font-semibold">Profile views</h2>
          <p className="text-sm text-text-secondary">Discover who's viewed your profile</p>
        </Card.Header>
        <Card.Body className="space-y-3">
          {data.profile_views_per_day.length === 0 ? (
            <EmptyState title="No profile view data" description="Activity will appear here once available." />
          ) : (
            <>
              <div className="h-72 w-full">
                <ResponsiveContainer>
                  <AreaChart data={data.profile_views_per_day.map((d) => ({ ...d, label: formatDate(d.date) }))}>
                    <defs>
                      <linearGradient id="profileGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#0A66C2" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="#0A66C2" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="var(--text-tertiary)" strokeOpacity={0.2} />
                    <XAxis dataKey="label" tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} />
                    <YAxis tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} />
                    <Tooltip />
                    <Area type="monotone" dataKey="value" stroke="#0A66C2" fill="url(#profileGradient)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <Legend />
              <div className="space-y-2">
                {data.top_viewers.slice(0, 3).map((viewer) => (
                  <div key={viewer.member_id} className="flex items-center gap-2">
                    <Avatar size="sm" name={viewer.full_name} />
                    <div>
                      <p className="text-sm font-semibold text-text-primary">{viewer.full_name}</p>
                      <p className="text-xs text-text-secondary">{viewer.headline}</p>
                    </div>
                  </div>
                ))}
                {data.top_viewers.length > 3 ? <p className="text-xs font-semibold text-brand-primary">Premium to see more</p> : null}
              </div>
            </>
          )}
        </Card.Body>
      </Card>

      <Card>
        <Card.Header><h2 className="text-lg font-semibold">Application funnel</h2></Card.Header>
        <Card.Body>
          <div className="h-64 w-full">
            <ResponsiveContainer>
              <BarChart data={funnelData} layout="vertical">
                <CartesianGrid stroke="var(--text-tertiary)" strokeOpacity={0.2} />
                <XAxis type="number" tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} />
                <YAxis dataKey="status" type="category" tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                  {funnelData.map((entry) => <Cell key={entry.status} fill={entry.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card.Body>
      </Card>

      <Card>
        <Card.Header><h2 className="text-lg font-semibold">Post performance</h2></Card.Header>
        <Card.Body className="grid gap-4 lg:grid-cols-2">
          <div className="h-64 w-full">
            <ResponsiveContainer>
              <LineChart data={data.post_impressions_per_day.map((d) => ({ ...d, label: formatDate(d.date) }))}>
                <CartesianGrid stroke="var(--text-tertiary)" strokeOpacity={0.2} />
                <XAxis dataKey="label" tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} />
                <YAxis tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} />
                <Tooltip />
                <Line type="monotone" dataKey="value" stroke="#0A66C2" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={engagementData} dataKey="value" nameKey="name" outerRadius={88} innerRadius={48}>
                  {engagementData.map((entry, index) => (
                    <Cell key={entry.name} fill={['#0A66C2', '#915907', '#057642', '#6B7280'][index % 4]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card.Body>
      </Card>

      <Card>
        <Card.Header><h2 className="text-lg font-semibold">Search appearances</h2></Card.Header>
        <Card.Body className="grid gap-4 lg:grid-cols-2">
          <div className="h-64 w-full">
            <ResponsiveContainer>
              <BarChart data={data.search_appearances_per_week.map((d) => ({ ...d, label: formatDate(d.date) }))}>
                <CartesianGrid stroke="var(--text-tertiary)" strokeOpacity={0.2} />
                <XAxis dataKey="label" tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} />
                <YAxis tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="value" fill="#0A66C2" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-semibold text-text-primary">Top skills people searched for to find you</p>
            {data.top_skills_searched.map((item) => (
              <div key={item.skill}>
                <div className="mb-1 flex justify-between text-xs text-text-secondary">
                  <span>{item.skill}</span>
                  <span>{item.count}</span>
                </div>
                <div className="h-2 rounded-full bg-black/10">
                  <div className="h-full rounded-full bg-brand-primary" style={{ width: `${Math.min(100, item.count * 2)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Card.Body>
      </Card>
    </div>
  )
}
