import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { getRecruiterDashboard, type MemberDashboardWindow } from '../../api/analytics'
import { Card, Skeleton } from '../../components/ui'
import { useAuthStore } from '../../store/authStore'
import { useSavedJobsStore } from '../../store/savedJobsStore'

function Kpi({ title, value }: { title: string; value: string | number }): JSX.Element {
  return <Card><Card.Body className="p-4"><p className="text-sm text-text-secondary">{title}</p><p className="mt-1 text-3xl font-bold text-text-primary">{value}</p></Card.Body></Card>
}

export default function RecruiterDashboardPage(): JSX.Element {
  const [window, setWindow] = useState<MemberDashboardWindow>('30d')
  const queryClient = useQueryClient()
  const recruiterKey = useAuthStore((s) => s.user?.recruiter_id || s.user?.member_id || '')
  const query = useQuery({
    queryKey: ['recruiter-dashboard', window, recruiterKey],
    queryFn: () => getRecruiterDashboard(window),
    enabled: Boolean(recruiterKey),
    staleTime: 0,
    refetchInterval: 4_000,
    refetchOnWindowFocus: true,
  })

  useEffect(() => {
    let prev = useSavedJobsStore.getState().entries
    return useSavedJobsStore.subscribe((state) => {
      if (state.entries === prev) return
      prev = state.entries
      void queryClient.invalidateQueries({ queryKey: ['recruiter-dashboard'] })
    })
  }, [queryClient])

  if (!recruiterKey) {
    return <p className="text-sm text-text-secondary">Sign in as a recruiter to view this dashboard.</p>
  }

  if (query.isLoading || !query.data) {
    return <div className="space-y-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} variant="rect" className="h-44" />)}</div>
  }

  const data = query.data

  return (
    <div className="space-y-3 pb-6">
      <Card>
        <Card.Body className="flex items-center justify-between p-4">
          <div>
            <h1 className="text-2xl font-semibold">Recruiter dashboard</h1>
            <p className="text-sm text-text-secondary">Hiring pipeline and performance overview</p>
          </div>
          <div className="flex gap-2">{(['7d', '14d', '30d', '90d'] as const).map((w) => <button key={w} type="button" onClick={() => setWindow(w)} className={window === w ? 'rounded-full bg-brand-primary px-3 py-1 text-xs text-white' : 'rounded-full bg-black/5 px-3 py-1 text-xs'}>{w}</button>)}</div>
        </Card.Body>
      </Card>

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        <Kpi title="Active jobs" value={data.kpis.active_jobs} />
        <Kpi title="Total applicants (month)" value={data.kpis.total_applicants} />
        <Kpi title="Avg. time to review" value={`${data.kpis.avg_time_to_review_days}d`} />
        <Kpi title="Messages pending" value={data.kpis.pending_messages} />
      </div>

      <Card><Card.Header><h2 className="text-lg font-semibold">Top 10 job postings by applications</h2></Card.Header><Card.Body className="h-72"><ResponsiveContainer><BarChart data={data.top_jobs_by_applications}><CartesianGrid stroke="var(--text-tertiary)" strokeOpacity={0.2} /><XAxis dataKey="name" tick={{ fontSize: 11 }} /><YAxis /><Tooltip /><Bar dataKey="value" fill="#0A66C2" /></BarChart></ResponsiveContainer></Card.Body></Card>

      <Card>
        <Card.Body className="space-y-0 p-0">
          <div className="px-4 pt-3">
            <h2 className="text-lg font-semibold">City-wise applications</h2>
            <p className="mt-1 text-xs text-text-secondary">From applicant location on Easy Apply (this recruiter&apos;s jobs, selected time window).</p>
          </div>
          <div className="h-72 px-4 pb-3">
            {data.city_applications.length === 0 ? (
              <p className="flex h-full items-center justify-center text-sm text-text-tertiary">No location data yet — applicants enter location when they apply.</p>
            ) : (
              <ResponsiveContainer>
                <BarChart data={data.city_applications} margin={{ top: 12, right: 8, left: 8, bottom: 8 }}>
                  <CartesianGrid stroke="var(--text-tertiary)" strokeOpacity={0.2} />
                  <XAxis dataKey="city" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="value" fill="#0A66C2" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card.Body>
      </Card>

      <Card><Card.Header><h2 className="text-lg font-semibold">Top 5 job postings with fewest applications</h2></Card.Header><Card.Body className="h-72"><ResponsiveContainer><BarChart data={data.low_performing_jobs} layout="vertical"><CartesianGrid stroke="var(--text-tertiary)" strokeOpacity={0.2} /><XAxis type="number" /><YAxis dataKey="name" type="category" width={120} /><Tooltip /><Bar dataKey="value">{data.low_performing_jobs.map((item) => <Cell key={item.name} fill="#915907" />)}</Bar></BarChart></ResponsiveContainer></Card.Body></Card>

      <Card><Card.Header><h2 className="text-lg font-semibold">Clicks per job posting</h2></Card.Header><Card.Body className="h-72"><ResponsiveContainer><BarChart data={data.clicks_per_job}><CartesianGrid stroke="var(--text-tertiary)" strokeOpacity={0.2} /><XAxis dataKey="name" /><YAxis /><Tooltip /><Bar dataKey="value" fill="#0A66C2" /></BarChart></ResponsiveContainer></Card.Body></Card>

      <Card>
        <Card.Body className="space-y-0 p-0">
          <div className="px-4 pt-3">
            <h2 className="text-lg font-semibold">Saved jobs by posting</h2>
            <p className="mt-1 text-xs text-text-secondary">One bar per job — count goes up as members save that role (mock: local demo counts + your Saved list).</p>
          </div>
          <div className="h-72 px-4 pb-3">
            {data.saved_jobs_by_posting.length > 0 ? (
              <ResponsiveContainer>
                <BarChart data={data.saved_jobs_by_posting} margin={{ bottom: 8, left: 8, right: 8, top: 12 }}>
                  <CartesianGrid stroke="var(--text-tertiary)" strokeOpacity={0.2} />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-18} textAnchor="end" height={72} />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="value" fill="#5C3BFE" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (data.saved_jobs_trend?.length ?? 0) > 0 ? (
              <ResponsiveContainer>
                <BarChart
                  data={data.saved_jobs_trend.map((p) => ({
                    name: new Date(p.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
                    value: p.value,
                  }))}
                  margin={{ top: 12, right: 8, left: 8, bottom: 8 }}
                >
                  <CartesianGrid stroke="var(--text-tertiary)" strokeOpacity={0.2} />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="value" fill="#5C3BFE" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="flex h-full items-center justify-center text-sm text-text-tertiary">No saves yet for your postings.</p>
            )}
          </div>
        </Card.Body>
      </Card>
    </div>
  )
}
