import { useCallback, useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { List } from 'react-window'
import { Filter, LocateFixed } from 'lucide-react'
import { listJobs } from '../../api/jobs'
import { JobDetail, JobListItem, SavedJobsHighlight } from '../../components/jobs'
import { Button, Card, Input, Modal, Select, Skeleton } from '../../components/ui'
import { useSavedJobsStore } from '../../store/savedJobsStore'

function FiltersPanel({ keyword, location, onKeyword, onLocation }: { keyword: string; location: string; onKeyword: (v: string) => void; onLocation: (v: string) => void }): JSX.Element {
  return (
    <Card>
      <Card.Body className="space-y-3">
        <Input label="Keyword" value={keyword} onChange={(e) => onKeyword(e.target.value)} />
        <div className="relative">
          <Input label="Location" value={location} onChange={(e) => onLocation(e.target.value)} />
          <LocateFixed className="absolute right-3 top-3 h-4 w-4 text-text-secondary" />
        </div>
        <div className="flex flex-wrap gap-2">
          {['Date posted', 'Experience level', 'Company', 'Remote'].map((chip) => (
            <button type="button" key={chip} className="rounded-full bg-black/5 px-3 py-1 text-xs text-text-secondary">{chip}</button>
          ))}
          <label className="inline-flex items-center gap-2 rounded-full bg-black/5 px-3 py-1 text-xs text-text-secondary">
            <input type="checkbox" /> Easy Apply
          </label>
        </div>
      </Card.Body>
    </Card>
  )
}

export default function JobsSearchPage(): JSX.Element {
  const [keyword, setKeyword] = useState('')
  const [location, setLocation] = useState('')
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null)
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(() => new Set())
  const savedEntries = useSavedJobsStore((s) => s.entries)
  const saveJob = useSavedJobsStore((s) => s.save)
  const removeSavedJob = useSavedJobsStore((s) => s.remove)

  const query = useQuery({
    queryKey: ['jobs-search', keyword, location],
    queryFn: () => listJobs({ keyword, location, page: 1, pageSize: 80 }),
    staleTime: 30_000,
  })

  const jobs = query.data?.jobs ?? []
  const visibleJobs = useMemo(() => jobs.filter((job) => !dismissedIds.has(job.job_id)), [jobs, dismissedIds])

  useEffect(() => {
    setDismissedIds(new Set())
  }, [keyword, location])

  const dismissJob = useCallback((jobId: string) => {
    setDismissedIds((prev) => new Set(prev).add(jobId))
  }, [])

  useEffect(() => {
    if (visibleJobs.length === 0) {
      setSelectedJobId(null)
      return
    }
    setSelectedJobId((cur) => {
      if (cur && visibleJobs.some((j) => j.job_id === cur)) return cur
      return visibleJobs[0].job_id
    })
  }, [visibleJobs])

  const savedIds = savedEntries.map((entry) => entry.job.job_id)
  const selectedJob = useMemo(() => {
    if (visibleJobs.length === 0) return undefined
    const picked = visibleJobs.find((job) => job.job_id === selectedJobId)
    return picked ?? visibleJobs[0]
  }, [visibleJobs, selectedJobId])

  const rowProps = useMemo(
    () => ({
      jobs: visibleJobs,
      selectedJobId,
      onSelect: setSelectedJobId,
      savedIds,
      onDismiss: dismissJob,
      saveJob,
      removeSavedJob,
    }),
    [visibleJobs, selectedJobId, savedIds, dismissJob],
  )

  function Row({ index, style, jobs: rowJobs, selectedJobId: rowSelected, onSelect, savedIds: rowSavedIds, onDismiss, saveJob: rowSave, removeSavedJob: rowRemove }: any): JSX.Element | null {
    const job = rowJobs[index]
    if (!job) return null
    return (
      <div style={style} className="p-2">
        <JobListItem
          job={job}
          selected={rowSelected === job.job_id}
          onClick={() => onSelect(job.job_id)}
          saved={rowSavedIds.includes(job.job_id)}
          onSaveToggle={() => {
            if (rowSavedIds.includes(job.job_id)) rowRemove(job.job_id)
            else rowSave(job)
          }}
          onDismiss={() => onDismiss(job.job_id)}
        />
      </div>
    )
  }

  return (
    <div className="space-y-3 pb-6">
      <div className="lg:hidden">
        <Button variant="secondary" leftIcon={<Filter className="h-4 w-4" />} onClick={() => setMobileFiltersOpen(true)}>Filters</Button>
      </div>
      <SavedJobsHighlight className="lg:hidden" maxItems={4} />

      <div className="grid grid-cols-12 gap-3">
        <div className="hidden space-y-3 lg:col-span-3 lg:block">
          <SavedJobsHighlight maxItems={4} />
          <FiltersPanel keyword={keyword} location={location} onKeyword={setKeyword} onLocation={setLocation} />
        </div>

        <div className="col-span-12 lg:col-span-5">
          <Card>
            <Card.Header className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold">Search results</h2>
                {!query.isLoading ? (
                  <p className="text-sm text-text-secondary">{visibleJobs.length} results</p>
                ) : null}
              </div>
              <div className="w-40">
                <Select variant="native" options={[{ value: 'relevant', label: 'Most relevant' }, { value: 'recent', label: 'Most recent' }]} />
              </div>
            </Card.Header>
            <Card.Body className="p-0">
              {query.isLoading ? (
                <div className="space-y-2 p-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-20" />)}</div>
              ) : visibleJobs.length === 0 ? (
                <div className="p-6 text-center text-sm text-text-secondary">
                  {jobs.length === 0 ? 'No jobs match your filters.' : 'No jobs left in this list — adjust filters or run a new search.'}
                </div>
              ) : jobs.length > 50 ? (
                <List
                  rowCount={visibleJobs.length}
                  rowHeight={136}
                  rowComponent={Row}
                  rowProps={rowProps}
                  style={{ height: 620 }}
                />
              ) : (
                <div className="space-y-2 p-3">
                  {visibleJobs.map((job) => (
                    <JobListItem
                      key={job.job_id}
                      job={job}
                      selected={selectedJob?.job_id === job.job_id}
                      onClick={() => setSelectedJobId(job.job_id)}
                      saved={savedIds.includes(job.job_id)}
                      onSaveToggle={() => {
                        if (savedIds.includes(job.job_id)) removeSavedJob(job.job_id)
                        else saveJob(job)
                      }}
                      onDismiss={() => dismissJob(job.job_id)}
                    />
                  ))}
                </div>
              )}
            </Card.Body>
          </Card>
        </div>

        <div className="hidden lg:col-span-4 lg:block">
          <div className="sticky top-[68px] max-h-[calc(100vh-84px)] overflow-y-auto">
            {selectedJob ? <JobDetail job={selectedJob} emitViewed /> : <Card><Card.Body>No job selected</Card.Body></Card>}
          </div>
        </div>
      </div>

      <Modal isOpen={mobileFiltersOpen} onClose={() => setMobileFiltersOpen(false)} title="Filters" size="md">
        <Modal.Header>Filters</Modal.Header>
        <Modal.Body>
          <FiltersPanel keyword={keyword} location={location} onKeyword={setKeyword} onLocation={setLocation} />
        </Modal.Body>
      </Modal>
    </div>
  )
}
