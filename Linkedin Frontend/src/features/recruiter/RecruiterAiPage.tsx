import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Activity,
  BookOpen,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Circle,
  Copy,
  FileText,
  Inbox,
  Layers,
  Loader2,
  MessageSquareText,
  Play,
  Search,
  SlidersHorizontal,
  Sparkles,
  Users,
  Workflow,
  XCircle,
} from 'lucide-react'
import { listJobsByRecruiter } from '../../api/jobs'
import { approveOutput, getTaskStatus, listTasks, rejectOutput, startShortlistTask, type AiTask, type AiTaskStep } from '../../api/ai'
import { useActionToast } from '../../hooks/useActionToast'
import { useAuthStore } from '../../store/authStore'
import { Badge, Button, Card, Input, Modal, Select, Skeleton, Textarea, useToast } from '../../components/ui'
import { cn } from '../../lib/cn'

const agents = [
  'Hiring Assistant Agent (Supervisor)',
  'Resume Parser Skill',
  'Job-Candidate Matching Skill',
  'Outreach Draft Generator',
]

function taskStatusBadge(status: AiTask['status']): JSX.Element {
  const label = status.replace(/_/g, ' ')
  const isPill = status === 'completed' || status === 'failed' || status === 'running' || status === 'waiting_approval'
  if (!isPill) return <Badge variant="neutral">{label}</Badge>
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ring-1',
        status === 'completed' && 'bg-emerald-50 text-emerald-800 ring-emerald-200',
        status === 'failed' && 'bg-red-50 text-red-800 ring-red-200',
        status === 'running' && 'bg-amber-50 text-amber-900 ring-amber-200',
        status === 'waiting_approval' && 'bg-sky-50 text-sky-900 ring-sky-200',
      )}
    >
      {label}
    </span>
  )
}

function stepStatusPill(status: AiTaskStep['status']): JSX.Element {
  const label = status.replace(/_/g, ' ')
  const className = cn(
    'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ring-1',
    (status === 'completed' || status === 'approved') && 'bg-emerald-50 text-emerald-800 ring-emerald-200',
    status === 'running' && 'bg-amber-50 text-amber-900 ring-amber-200',
    status === 'pending' && 'bg-amber-50/70 text-amber-900 ring-amber-200',
    status === 'waiting_approval' && 'bg-sky-50 text-sky-900 ring-sky-200',
    status === 'rejected' && 'bg-red-50 text-red-800 ring-red-200',
  )
  return <span className={className}>{label}</span>
}

function durationLabel(startIso: string): string {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(startIso).getTime()) / 1000))
  const mm = String(Math.floor(seconds / 60)).padStart(2, '0')
  const ss = String(seconds % 60).padStart(2, '0')
  return `${mm}:${ss}`
}

function copyText(text: string): void {
  void navigator.clipboard.writeText(text)
}

function agentPurpose(agentName: string): string {
  if (agentName.includes('Resume Parser')) return 'Reads resumes and extracts structured candidate details.'
  if (agentName.includes('Matching')) return 'Scores candidate-job fit using skills and profile context.'
  if (agentName.includes('Outreach')) return 'Drafts recruiter outreach for strong matches.'
  if (agentName.includes('Supervisor')) return 'Coordinates the workflow and decides what is ready to review.'
  return 'Contributes to the shortlist workflow.'
}

function summarizeStep(step: AiTaskStep | undefined): string {
  if (!step) return 'No output yet.'
  if (step.draft_content?.trim()) return step.draft_content.trim()
  if (typeof step.output === 'string' && step.output.trim()) return step.output.trim()
  if (step.status === 'waiting_approval') return 'Waiting for recruiter approval.'
  if (step.status === 'running') return `In progress${step.progress_pct ? ` (${step.progress_pct}%)` : ''}.`
  if (step.status === 'completed' || step.status === 'approved') return 'Completed successfully.'
  if (step.status === 'rejected') return 'Output was rejected.'
  return 'Not started yet.'
}

/** Short id for subtitles (avoids full UUID in headings). */
function shortRunId(id: string): string {
  if (!id) return ''
  const tail = id.split('-').pop()
  if (tail && tail.length >= 8) return tail.slice(0, 8)
  return id.length > 12 ? `${id.slice(0, 8)}…` : id
}

/** Readable heading for task cards and the active task — API titles are often raw ids. */
function getTaskDisplayHeading(
  task: AiTask,
  jobTitleById: Map<string, string>,
): { headline: string; hint?: string } {
  const jobTitle = (id: string) => jobTitleById.get(id)

  const jobId = task.job_id?.trim()
  if (jobId) {
    const jt = jobTitle(jobId)
    if (jt) return { headline: `Candidate shortlist · ${jt}` }
    return { headline: 'Candidate shortlist', hint: `Job id · ${shortRunId(jobId)}` }
  }

  const shortlistFor = task.title.match(/^Shortlist candidates for\s+(.+)$/i)
  if (shortlistFor?.[1]) {
    const id = shortlistFor[1].trim()
    const jt = jobTitle(id)
    if (jt) return { headline: `Candidate shortlist · ${jt}` }
    if (id.length > 18 || /^[0-9a-f-]{16,}$/i.test(id)) {
      return { headline: 'Candidate shortlist', hint: `Job id · ${shortRunId(id)}` }
    }
    return { headline: `Candidate shortlist · ${id}` }
  }

  if (/^AI task\s+/i.test(task.title.trim())) {
    return { headline: 'Candidate shortlist', hint: `Run id · ${shortRunId(task.task_id)}` }
  }

  return { headline: task.title }
}

function formatTaskOutcome(task: AiTask): string {
  if (task.status === 'failed') return task.error?.trim() || 'Failed'
  if (task.final_output === 'shortlist_ready') return 'Shortlist ready'
  if (task.final_output === 'matches_ready') return 'Matches ready'
  if (task.final_output) return task.final_output.replace(/_/g, ' ')
  if (task.status === 'completed') return 'Finished'
  if (task.status === 'waiting_approval') return 'Awaiting your approval'
  return 'In progress'
}

const guideSections: Array<{
  id: string
  title: string
  short: string
  body: string
  icon: typeof FileText
}> = [
  {
    id: 'resume',
    title: 'Resume Parser',
    short: 'Structured facts from applications',
    body: 'Look here for extracted candidate facts, skills, and resume-derived details the model used downstream.',
    icon: FileText,
  },
  {
    id: 'match',
    title: 'Job–candidate matching',
    short: 'Fit scores and rationale',
    body: 'This block explains why the AI considers someone a strong or weak match for the role you selected.',
    icon: Layers,
  },
  {
    id: 'outreach',
    title: 'Outreach draft generator',
    short: 'Recruiter-ready messaging',
    body: 'Use this copy as a starting point—approve as-is, edit, or reject and request a revision.',
    icon: MessageSquareText,
  },
  {
    id: 'supervisor',
    title: 'Hiring assistant (supervisor)',
    short: 'Orchestration and handoff',
    body: 'The supervisor coordinates steps and surfaces what is ready for your review or still running.',
    icon: Bot,
  },
]

export default function RecruiterAiPage(): JSX.Element {
  const actionToast = useActionToast()
  const user = useAuthStore((state) => state.user)
  const token = useAuthStore((state) => state.token)
  const { toast } = useToast()
  const queryClient = useQueryClient()

  const [activeTaskId, setActiveTaskId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [showEvents, setShowEvents] = useState(false)
  const [events, setEvents] = useState<Array<{ ts: string; topic: string; event: string }>>([])
  const [streamLog, setStreamLog] = useState('')
  const [draftEdits, setDraftEdits] = useState<Record<string, string>>({})
  const [rejectReason, setRejectReason] = useState('')
  const [rejectingStepId, setRejectingStepId] = useState<string | null>(null)
  const [confetti, setConfetti] = useState(false)
  const [openGuideId, setOpenGuideId] = useState<string | null>(null)
  const [taskHistoryExpanded, setTaskHistoryExpanded] = useState(true)
  const wsRef = useRef<WebSocket | null>(null)
  const activeTaskTitleRef = useRef<string>('')

  const [startModalOpen, setStartModalOpen] = useState(false)
  const [jobId, setJobId] = useState('')
  const [minMatch, setMinMatch] = useState(70)
  const [topN, setTopN] = useState(10)
  const [skills, setSkills] = useState('React,TypeScript')
  const [radius, setRadius] = useState(25)
  const [tone, setTone] = useState<'professional' | 'casual' | 'enthusiastic'>('professional')
  const [modalStep, setModalStep] = useState(1)

  const recruiterId = user?.recruiter_id || user?.member_id
  const jobsQuery = useQuery({
    queryKey: ['recruiter-jobs-ai', recruiterId],
    queryFn: () => listJobsByRecruiter(recruiterId ?? ''),
    enabled: Boolean(recruiterId),
  })

  const jobTitleById = useMemo(() => {
    const m = new Map<string, string>()
    for (const job of jobsQuery.data ?? []) {
      m.set(job.job_id, job.title)
    }
    return m
  }, [jobsQuery.data])

  const tasksQuery = useQuery({
    queryKey: ['ai-tasks'],
    queryFn: listTasks,
    refetchInterval: 8000,
  })

  const activeTask = useMemo(() => {
    const list = tasksQuery.data ?? []
    if (!activeTaskId) return list[0] ?? null
    return list.find((task) => task.task_id === activeTaskId) ?? null
  }, [tasksQuery.data, activeTaskId])

  const parsedTask = useMemo(() => {
    const steps = activeTask?.steps ?? []
    const resumeStep = steps.find((step) => step.agent_name.includes('Resume Parser'))
    const matchStep = steps.find((step) => step.agent_name.includes('Matching'))
    const outreachStep = steps.find((step) => step.agent_name.includes('Outreach'))
    const supervisorStep = steps.find((step) => step.agent_name.includes('Supervisor'))
    const waitingApprovals = steps.filter((step) => step.status === 'waiting_approval').length
    const completedSteps = steps.filter((step) => ['completed', 'approved'].includes(step.status)).length
    return { resumeStep, matchStep, outreachStep, supervisorStep, waitingApprovals, completedSteps }
  }, [activeTask])

  const displaySteps = useMemo((): AiTaskStep[] => {
    if (!activeTask) return []
    const four = [parsedTask.resumeStep, parsedTask.matchStep, parsedTask.outreachStep, parsedTask.supervisorStep].filter(Boolean) as AiTaskStep[]
    if (four.length > 0) return four
    return activeTask.steps
  }, [activeTask, parsedTask])

  useEffect(() => {
    if (!activeTask) {
      activeTaskTitleRef.current = ''
      return
    }
    activeTaskTitleRef.current = getTaskDisplayHeading(activeTask, jobTitleById).headline
  }, [activeTask, jobTitleById])

  useEffect(() => {
    if (!activeTask?.task_id || !token) {
      return
    }

    const wsBase = (import.meta.env.VITE_AI_WS_BASE_URL || import.meta.env.VITE_WS_BASE_URL).replace(/\/$/, '')
    const wsUrl = `${wsBase}/ai/tasks/${activeTask.task_id}?token=${encodeURIComponent(token)}`

    try {
      const ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.onmessage = (event) => {
        const message = JSON.parse(event.data) as { type: string; payload: any }
        setEvents((prev) =>
          [{ ts: new Date().toISOString(), topic: 'ai.results', event: message.type }, ...prev].slice(0, 80),
        )

        if (message.type === 'step.progress') {
          const fragment = message.payload.message ?? ''
          setStreamLog((prev) => `${prev}${fragment}${fragment.endsWith('\n') ? '' : '\n'}`)
          queryClient.setQueryData<AiTask[]>(['ai-tasks'], (prev) =>
            (prev ?? []).map((task) =>
              task.task_id === activeTask.task_id
                ? {
                    ...task,
                    steps: task.steps.map((step) =>
                      step.step_index === message.payload.step_index
                        ? { ...step, status: 'running', progress_pct: message.payload.progress_pct }
                        : step,
                    ),
                  }
                : task,
            ),
          )
        }

        if (message.type === 'step.started') {
          queryClient.setQueryData<AiTask[]>(['ai-tasks'], (prev) =>
            (prev ?? []).map((task) =>
              task.task_id === activeTask.task_id
                ? {
                    ...task,
                    status: 'running',
                    steps: task.steps.map((step) =>
                      step.step_index === message.payload.step_index ? { ...step, status: 'running' } : step,
                    ),
                  }
                : task,
            ),
          )
        }

        if (message.type === 'step.completed') {
          queryClient.setQueryData<AiTask[]>(['ai-tasks'], (prev) =>
            (prev ?? []).map((task) =>
              task.task_id === activeTask.task_id
                ? {
                    ...task,
                    steps: task.steps.map((step) =>
                      step.step_index === message.payload.step_index
                        ? { ...step, status: 'completed', output: message.payload.output, progress_pct: 100 }
                        : step,
                    ),
                  }
                : task,
            ),
          )
        }

        if (message.type === 'approval.required') {
          queryClient.setQueryData<AiTask[]>(['ai-tasks'], (prev) =>
            (prev ?? []).map((task) =>
              task.task_id === activeTask.task_id
                ? {
                    ...task,
                    status: 'waiting_approval',
                    steps: task.steps.map((step) =>
                      step.step_index === message.payload.step_index
                        ? { ...step, status: 'waiting_approval', draft_content: message.payload.draft_content }
                        : step,
                    ),
                  }
                : task,
            ),
          )
        }

        if (message.type === 'task.completed') {
          queryClient.setQueryData<AiTask[]>(['ai-tasks'], (prev) =>
            (prev ?? []).map((task) =>
              task.task_id === activeTask.task_id
                ? { ...task, status: 'completed', final_output: message.payload.final_output }
                : task,
            ),
          )
          actionToast.aiTaskComplete(activeTaskTitleRef.current || 'Task')
          setConfetti(true)
          window.setTimeout(() => setConfetti(false), 2600)
        }

        if (message.type === 'task.failed') {
          queryClient.setQueryData<AiTask[]>(['ai-tasks'], (prev) =>
            (prev ?? []).map((task) =>
              task.task_id === activeTask.task_id
                ? { ...task, status: 'failed', error: message.payload.error }
                : task,
            ),
          )
        }
      }

      ws.onerror = () => {
        console.warn('AI task websocket unavailable. Falling back to status polling every 5s.')
      }

      return () => {
        ws.close()
      }
    } catch {
      console.warn('AI task websocket unavailable. Falling back to status polling every 5s.')
      return
    }
  }, [activeTask?.task_id, token, queryClient, actionToast])

  useEffect(() => {
    if (!activeTask?.task_id) return
    const id = window.setInterval(async () => {
      try {
        const status = await getTaskStatus(activeTask.task_id)
        queryClient.setQueryData<AiTask[]>(['ai-tasks'], (prev) => {
          const list = prev ?? []
          if (list.some((task) => task.task_id === status.task_id)) {
            return list.map((task) => (task.task_id === status.task_id ? status : task))
          }
          return [status, ...list]
        })
      } catch {
        // no-op
      }
    }, 5000)
    return () => window.clearInterval(id)
  }, [activeTask?.task_id, queryClient])

  const startMutation = useMutation({
    mutationFn: () =>
      startShortlistTask(jobId, {
        min_match_score: minMatch,
        top_n: topN,
        weighted_skills: skills
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean),
        location_radius_miles: radius,
        outreach_tone: tone,
      }),
    onSuccess: async (result) => {
      setStartModalOpen(false)
      setModalStep(1)
      setActiveTaskId(result.task_id)
      setStreamLog('')
      setEvents((prev) => [{ ts: new Date().toISOString(), topic: 'ai.requests', event: 'task.started' }, ...prev])
      await tasksQuery.refetch()
      toast({ variant: 'success', title: 'Copilot task started' })
    },
    onError: (error: { message?: string }) => {
      toast({ variant: 'error', title: error.message ?? 'Unable to start task' })
    },
  })

  const approveMutation = useMutation({
    mutationFn: ({ step, edited }: { step: AiTaskStep; edited?: string }) =>
      approveOutput(activeTask?.task_id ?? '', step.step_id, edited),
    onSuccess: async () => {
      await tasksQuery.refetch()
      toast({ variant: 'success', title: 'Step approved' })
    },
  })

  const rejectMutation = useMutation({
    mutationFn: ({ step, reason }: { step: AiTaskStep; reason: string }) =>
      rejectOutput(activeTask?.task_id ?? '', step.step_id, reason),
    onSuccess: async () => {
      setRejectingStepId(null)
      setRejectReason('')
      await tasksQuery.refetch()
      toast({ variant: 'info', title: 'Step rejected' })
    },
  })

  const filteredTasks = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return tasksQuery.data ?? []
    return (tasksQuery.data ?? []).filter((task) => {
      const { headline, hint } = getTaskDisplayHeading(task, jobTitleById)
      return (
        task.title.toLowerCase().includes(q) ||
        task.trace_id.toLowerCase().includes(q) ||
        task.task_id.toLowerCase().includes(q) ||
        headline.toLowerCase().includes(q) ||
        (hint?.toLowerCase().includes(q) ?? false)
      )
    })
  }, [tasksQuery.data, search, jobTitleById])

  const activeHeading = useMemo(
    () => (activeTask ? getTaskDisplayHeading(activeTask, jobTitleById) : null),
    [activeTask, jobTitleById],
  )

  const approvals = useMemo(() => {
    const steps = activeTask?.steps ?? []
    const asIs = steps.filter((step) => step.status === 'approved' && !(draftEdits[step.step_id] ?? '').trim()).length
    const withEdits = steps.filter((step) => step.status === 'approved' && (draftEdits[step.step_id] ?? '').trim()).length
    const rejected = steps.filter((step) => step.status === 'rejected').length
    return { asIs, withEdits, rejected }
  }, [activeTask?.steps, draftEdits])

  const tasksLoading = tasksQuery.isLoading
  const tasksEmpty = !tasksLoading && filteredTasks.length === 0

  const taskHistoryStrip = (
    <Card variant="raised" className="shadow-sm">
      <Card.Header className="border-b border-border bg-surface-raised/80 px-4 py-4 sm:px-5 sm:py-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-1 flex-col gap-1 sm:max-w-md">
            <h2 className="text-base font-semibold text-text-primary">AI Copilot</h2>
            <p className="text-xs text-text-secondary">Select a run or start a new shortlist</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <Button size="sm" onClick={() => setStartModalOpen(true)} leftIcon={<Play className="h-4 w-4" aria-hidden />}>
              New task
            </Button>
            <Button
              size="sm"
              variant="secondary"
              type="button"
              onClick={() => setTaskHistoryExpanded((v) => !v)}
              rightIcon={taskHistoryExpanded ? <ChevronUp className="h-4 w-4" aria-hidden /> : <ChevronDown className="h-4 w-4" aria-hidden />}
              aria-expanded={taskHistoryExpanded}
            >
              {taskHistoryExpanded ? 'Hide list' : 'Show list'}
            </Button>
          </div>
        </div>
        <div className="mt-3 w-full min-w-0">
          <Input
            placeholder="Search by title or trace ID"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            leftIcon={<Search className="h-4 w-4" aria-hidden />}
          />
        </div>
        {tasksQuery.isFetching && !tasksLoading ? (
          <p className="mt-2 flex items-center gap-1.5 text-[11px] text-text-tertiary">
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
            Refreshing…
          </p>
        ) : null}
      </Card.Header>
      {taskHistoryExpanded ? (
        <Card.Body className="bg-[#F3F2EF]/40 px-3 py-4 sm:px-5 sm:py-4">
          {tasksLoading ? (
            <div
              className="grid grid-cols-1 gap-3 pb-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
              aria-busy="true"
            >
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} variant="rect" className="h-24 min-h-[96px] w-full rounded-xl" />
              ))}
            </div>
          ) : tasksEmpty ? (
            <div className="flex flex-col items-center rounded-xl border border-dashed border-border bg-surface-raised px-4 py-8 text-center sm:py-10">
              <Inbox className="mb-3 h-10 w-10 text-text-tertiary" aria-hidden />
              <p className="text-sm font-semibold text-text-primary">No tasks yet</p>
              <p className="mt-1 max-w-md text-xs text-text-secondary">Start a shortlist to see AI steps and approvals here.</p>
              <Button className="mt-4" size="sm" onClick={() => setStartModalOpen(true)} leftIcon={<Play className="h-4 w-4" />}>
                Start first task
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-3 pb-1 pt-0.5 md:gap-4">
              {filteredTasks.map((task) => {
                const selected = activeTask?.task_id === task.task_id
                const { headline, hint } = getTaskDisplayHeading(task, jobTitleById)
                return (
                  <button
                    key={task.task_id}
                    type="button"
                    title={task.title}
                    onClick={() => {
                      setActiveTaskId(task.task_id)
                      setStreamLog('')
                    }}
                    className={cn(
                      'min-w-0 flex-[1_1_16rem] rounded-xl border p-3 text-left shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 sm:min-w-[220px] sm:max-w-[min(100%,22rem)] md:flex-[1_1_14rem] lg:flex-[1_1_12rem]',
                      selected
                        ? 'border-brand-primary/40 bg-white ring-2 ring-brand-primary/25'
                        : 'border-border bg-surface-raised hover:border-black/10 hover:bg-white',
                    )}
                  >
                    <p className="line-clamp-2 text-sm font-semibold leading-snug text-text-primary">{headline}</p>
                    {hint ? (
                      <p className="mt-0.5 line-clamp-1 text-xs text-text-tertiary">{hint}</p>
                    ) : null}
                    <p className="mt-1 truncate font-mono text-[10px] text-text-tertiary">trace {task.trace_id}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">{taskStatusBadge(task.status)}</div>
                  </button>
                )
              })}
            </div>
          )}
        </Card.Body>
      ) : null}
    </Card>
  )

  return (
    <div className="flex w-full min-w-0 flex-col gap-4 pb-8 lg:flex-row lg:items-start lg:gap-6 xl:gap-8">
      {/* Main column — grows to fill space left of the narrow tips rail */}
      <div className="min-w-0 flex-1 space-y-4">
        {taskHistoryStrip}
        {!activeTask ? (
          <div className="space-y-4">
            <Card variant="raised" className="overflow-hidden shadow-sm">
              <Card.Body className="space-y-6 p-0">
                <div className="bg-gradient-to-br from-[#0A66C2] via-[#0A66C2] to-[#004182] px-6 py-7 text-white">
                  <div className="flex items-center gap-2">
                    <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/15">
                      <Sparkles className="h-5 w-5" aria-hidden />
                    </span>
                    <div>
                      <h1 className="text-2xl font-semibold tracking-tight">Recruiter Copilot</h1>
                      <p className="text-sm text-white/90">AI-assisted shortlists, fit reasoning, and outreach drafts</p>
                    </div>
                  </div>
                </div>

                <div className="grid gap-3 px-6 sm:grid-cols-3">
                  <button
                    type="button"
                    onClick={() => setStartModalOpen(true)}
                    className="rounded-xl border border-border bg-surface-raised p-4 text-left shadow-sm transition hover:border-brand-primary/30 hover:shadow-md"
                  >
                    <p className="font-semibold text-text-primary">Shortlist for a job</p>
                    <p className="mt-1 text-xs leading-relaxed text-text-secondary">Parsing, matching, outreach, and supervisor review in one flow.</p>
                  </button>
                  <div className="rounded-xl border border-border bg-surface-raised p-4 shadow-sm">
                    <p className="font-semibold text-text-primary">Match reasoning</p>
                    <p className="mt-1 text-xs leading-relaxed text-text-secondary">See why candidates rank where they do before you message anyone.</p>
                  </div>
                  <div className="rounded-xl border border-border bg-surface-raised p-4 shadow-sm">
                    <p className="font-semibold text-text-primary">Outreach review</p>
                    <p className="mt-1 text-xs leading-relaxed text-text-secondary">Approve, edit, or reject drafts before they leave your desk.</p>
                  </div>
                </div>

                <div className="px-6 pb-6">
                  <Card className="border-dashed border-border/80 bg-[#F3F2EF]/50">
                    <Card.Body className="space-y-3 p-4">
                      <div className="flex items-center gap-2">
                        <BookOpen className="h-4 w-4 text-brand-primary" aria-hidden />
                        <p className="text-sm font-semibold text-text-primary">How this page works</p>
                      </div>
                      <ul className="list-inside list-disc space-y-1.5 text-sm text-text-secondary marker:text-brand-primary">
                        <li>
                          <strong className="text-text-primary">Resume Parser</strong> — extracts facts from applications.
                        </li>
                        <li>
                          <strong className="text-text-primary">Matching</strong> — explains fit for your requisition.
                        </li>
                        <li>
                          <strong className="text-text-primary">Outreach</strong> — drafts messages you control.
                        </li>
                        <li>
                          <strong className="text-text-primary">Supervisor</strong> — coordinates what needs your approval.
                        </li>
                      </ul>
                    </Card.Body>
                  </Card>
                </div>
              </Card.Body>
            </Card>
          </div>
        ) : (
          <div className="space-y-4">
            <Card variant="raised" className="shadow-sm">
              <Card.Body className="space-y-6 p-6 sm:p-8">
                <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1 pr-0 sm:pr-6">
                    <p className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">Active task</p>
                    <h1
                      className="mt-2 text-2xl font-semibold leading-snug tracking-tight text-text-primary sm:text-[1.65rem]"
                      title={activeTask.title}
                    >
                      {activeHeading?.headline ?? activeTask.title}
                    </h1>
                    {activeHeading?.hint ? (
                      <p className="mt-1.5 text-sm font-medium text-text-secondary">{activeHeading.hint}</p>
                    ) : null}
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-text-secondary">
                      <span className="break-all font-mono text-[11px] sm:break-normal">trace {activeTask.trace_id}</span>
                      <button
                        type="button"
                        onClick={() => copyText(activeTask.trace_id)}
                        className="inline-flex items-center rounded-md border border-border bg-white px-2 py-0.5 text-[11px] font-medium text-text-primary hover:bg-black/[0.04]"
                        aria-label="Copy trace id"
                      >
                        <Copy className="mr-1 h-3 w-3" aria-hidden />
                        Copy
                      </button>
                    </div>
                    <p className="mt-4 max-w-none text-sm leading-relaxed text-text-secondary sm:text-[15px]">
                      This task runs four skills in sequence: parse applicant data, score fit, draft outreach, and supervisor review—so you can approve only what ships.
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
                    {taskStatusBadge(activeTask.status)}
                    {activeTask.status === 'running' ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-900 ring-1 ring-amber-200">
                        <Activity className="h-3.5 w-3.5" aria-hidden />
                        Elapsed {durationLabel(activeTask.created_at)}
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-4 lg:gap-5">
                  <div className="rounded-xl border border-border bg-gradient-to-b from-white to-[#F3F2EF]/80 p-5 shadow-sm sm:p-6">
                    <div className="flex items-start gap-3 sm:gap-4">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-primary/10 text-brand-primary">
                        <Workflow className="h-5 w-5" aria-hidden />
                      </span>
                      <div className="min-w-0">
                        <p className="text-[11px] font-bold uppercase leading-snug tracking-wide text-text-tertiary whitespace-normal">
                          Workflow
                        </p>
                        <p className="mt-2 text-2xl font-bold tabular-nums text-text-primary">
                          {activeTask.steps.length > 0
                            ? `${parsedTask.completedSteps}/${activeTask.steps.length}`
                            : '—'}
                        </p>
                        <p className="mt-1 text-xs leading-snug text-text-secondary">
                          {activeTask.steps.length > 0 ? 'Steps completed' : 'Step list not available'}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="rounded-xl border border-border bg-gradient-to-b from-white to-[#F3F2EF]/80 p-5 shadow-sm sm:p-6">
                    <div className="flex items-start gap-3 sm:gap-4">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-700">
                        <Users className="h-5 w-5" aria-hidden />
                      </span>
                      <div className="min-w-0">
                        <p className="text-[11px] font-bold uppercase leading-snug tracking-wide text-text-tertiary whitespace-normal">
                          Candidates
                        </p>
                        <p className="mt-2 text-2xl font-bold tabular-nums text-text-primary">
                          {activeTask.final_output ? 1 : activeTask.status === 'completed' ? '—' : 0}
                        </p>
                        <p className="mt-1 text-xs leading-snug text-text-secondary">
                          {activeTask.final_output
                            ? 'Result bundle ready'
                            : activeTask.status === 'completed'
                              ? 'Not summarized on this run'
                              : 'Result bundle ready'}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="rounded-xl border border-border bg-gradient-to-b from-white to-[#F3F2EF]/80 p-5 shadow-sm sm:p-6">
                    <div className="flex items-start gap-3 sm:gap-4">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-sky-500/10 text-sky-800">
                        <MessageSquareText className="h-5 w-5" aria-hidden />
                      </span>
                      <div className="min-w-0">
                        <p className="text-[11px] font-bold uppercase leading-snug tracking-wide text-text-tertiary whitespace-normal">
                          Approvals
                        </p>
                        <p className="mt-2 text-2xl font-bold tabular-nums text-text-primary">{parsedTask.waitingApprovals}</p>
                        <p className="mt-1 text-xs leading-snug text-text-secondary">Awaiting recruiter</p>
                      </div>
                    </div>
                  </div>
                  <div className="rounded-xl border border-border bg-gradient-to-b from-white to-[#F3F2EF]/80 p-5 shadow-sm sm:p-6">
                    <div className="flex items-start gap-3 sm:gap-4">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-800">
                        <Bot className="h-5 w-5" aria-hidden />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-bold uppercase leading-snug tracking-wide text-text-tertiary whitespace-normal">
                          Outcome
                        </p>
                        <p className="mt-2 text-sm font-semibold leading-relaxed text-text-primary">{formatTaskOutcome(activeTask)}</p>
                        <p className="mt-1 text-xs leading-snug text-text-secondary">Latest task result</p>
                      </div>
                    </div>
                  </div>
                </div>
              </Card.Body>
            </Card>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:gap-8">
              <Card variant="raised" className="min-w-0 shadow-sm">
                <Card.Header className="border-b border-border bg-surface-raised/50">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-brand-primary" aria-hidden />
                    <h2 className="text-base font-semibold text-text-primary">AI outputs</h2>
                  </div>
                  <p className="mt-1 text-xs text-text-secondary">Step-by-step results and review actions</p>
                </Card.Header>
                <Card.Body className="space-y-4 p-5 sm:p-6">
                  {tasksLoading ? (
                    <div className="space-y-3" aria-busy="true">
                      <Skeleton variant="rect" className="h-32 rounded-xl" />
                      <Skeleton variant="rect" className="h-32 rounded-xl" />
                    </div>
                  ) : displaySteps.length === 0 ? (
                    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-gradient-to-b from-[#F3F2EF]/60 to-white px-6 py-14 text-center sm:px-10 sm:py-16">
                      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-primary/10 text-brand-primary">
                        <Layers className="h-7 w-7" aria-hidden />
                      </div>
                      <p className="text-base font-semibold text-text-primary">No step output yet</p>
                      <p className="mt-3 max-w-lg text-sm leading-relaxed text-text-secondary text-pretty">
                        When the supervisor and skills start running, each step appears here with status, progress, and anything waiting for your approval.
                      </p>
                      <p className="mt-5 max-w-md text-xs leading-relaxed text-text-tertiary text-pretty">
                        Tip: keep this tab open—live updates stream in when the task is active.
                      </p>
                    </div>
                  ) : (
                    displaySteps.map((item) => {
                      const showApproval = item.status === 'waiting_approval'
                      const draft = draftEdits[item.step_id] ?? item.draft_content ?? ''
                      const changed = draft.trim() !== (item.draft_content ?? '').trim()
                      return (
                        <div
                          key={item.step_id}
                          className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm ring-1 ring-black/[0.04]"
                        >
                          <div className="flex flex-col gap-3 border-b border-border bg-[#FAFAF9] px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-text-primary">{item.step_name}</p>
                              <p className="mt-0.5 text-xs text-text-secondary">{item.agent_name}</p>
                              <p className="mt-2 text-xs leading-relaxed text-text-tertiary">{agentPurpose(item.agent_name)}</p>
                            </div>
                            <div className="flex shrink-0 flex-wrap items-center gap-2">
                              {item.status === 'running' ? <Loader2 className="h-4 w-4 animate-spin text-brand-primary" aria-hidden /> : null}
                              {item.status === 'completed' || item.status === 'approved' ? (
                                <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden />
                              ) : null}
                              {item.status === 'rejected' ? <XCircle className="h-4 w-4 text-red-600" aria-hidden /> : null}
                              {item.status === 'pending' ? <Circle className="h-4 w-4 text-text-tertiary" aria-hidden /> : null}
                              {stepStatusPill(item.status)}
                            </div>
                          </div>
                          <div className="space-y-4 px-4 py-4 sm:px-5 sm:py-5">
                            {item.progress_pct && item.status === 'running' ? (
                              <div>
                                <div className="mb-1 flex justify-between text-[11px] font-medium text-text-secondary">
                                  <span>Progress</span>
                                  <span>{item.progress_pct}%</span>
                                </div>
                                <div className="h-2 overflow-hidden rounded-full bg-black/10">
                                  <div
                                    className="h-full rounded-full bg-brand-primary transition-all"
                                    style={{ width: `${item.progress_pct}%` }}
                                  />
                                </div>
                              </div>
                            ) : null}
                            <div className="rounded-xl border border-border bg-[#F9F8F6] p-4">
                              <p className="whitespace-pre-wrap text-sm leading-relaxed text-text-secondary">{summarizeStep(item)}</p>
                            </div>
                            {showApproval ? (
                              <div className="space-y-3 rounded-xl border border-sky-200/80 bg-sky-50/50 p-4">
                                <p className="text-[11px] font-bold uppercase tracking-wide text-sky-900">Review draft</p>
                                <Textarea autoResize value={draft} onChange={(event) => setDraftEdits((prev) => ({ ...prev, [item.step_id]: event.target.value }))} />
                                <div className="flex flex-wrap gap-2">
                                  <Button size="sm" onClick={() => approveMutation.mutate({ step: item })}>
                                    Approve as-is
                                  </Button>
                                  <Button size="sm" variant="secondary" disabled={!changed} onClick={() => approveMutation.mutate({ step: item, edited: draft })}>
                                    Approve with edits
                                  </Button>
                                  <Button size="sm" variant="destructive" onClick={() => setRejectingStepId(item.step_id)}>
                                    Reject
                                  </Button>
                                </div>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      )
                    })
                  )}
                </Card.Body>
              </Card>

              <div className="flex min-w-0 flex-col gap-4">
                <Card variant="raised" className="shadow-sm">
                  <Card.Header className="border-b border-border bg-surface-raised/50">
                    <div className="flex items-center gap-2">
                      <BookOpen className="h-4 w-4 text-brand-primary" aria-hidden />
                      <h2 className="text-base font-semibold text-text-primary">How to read this task</h2>
                    </div>
                    <p className="mt-1 text-xs text-text-secondary">Expand a section for a quick guide</p>
                  </Card.Header>
                  <Card.Body className="divide-y divide-border p-0">
                    {guideSections.map((section) => {
                      const open = openGuideId === section.id
                      const Icon = section.icon
                      return (
                        <div key={section.id} className="bg-white">
                          <button
                            type="button"
                            onClick={() => setOpenGuideId(open ? null : section.id)}
                            className="flex w-full items-start gap-3 px-4 py-3.5 text-left transition hover:bg-black/[0.02] sm:px-5"
                            aria-expanded={open}
                          >
                            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-primary/10 text-brand-primary">
                              <Icon className="h-4 w-4" aria-hidden />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="flex items-center justify-between gap-2">
                                <span className="text-sm font-semibold text-text-primary">{section.title}</span>
                                <ChevronDown
                                  className={cn('h-4 w-4 shrink-0 text-text-tertiary transition-transform', open && 'rotate-180')}
                                  aria-hidden
                                />
                              </span>
                              <span className="mt-0.5 block text-xs text-text-secondary">{section.short}</span>
                            </span>
                          </button>
                          {open ? (
                            <div className="border-t border-border bg-[#F3F2EF]/40 px-4 pb-5 pl-[3.25rem] pr-5 text-sm leading-relaxed text-text-secondary sm:px-6 sm:pb-6 sm:pl-[4.25rem] sm:pr-6 sm:text-[15px] sm:leading-relaxed">
                              <div className="max-w-none text-pretty">{section.body}</div>
                            </div>
                          ) : null}
                        </div>
                      )
                    })}
                  </Card.Body>
                </Card>

                <Card variant="raised" className="shadow-sm">
                  <Card.Header className="border-b border-border bg-surface-raised/50">
                    <div className="flex items-center gap-2">
                      <Activity className="h-4 w-4 text-text-secondary" aria-hidden />
                      <h2 className="text-base font-semibold text-text-primary">System details</h2>
                    </div>
                    <p className="mt-1 text-xs text-text-secondary">Agent activity and debug stream</p>
                  </Card.Header>
                  <Card.Body className="space-y-4 p-4 sm:p-5">
                    <div className="grid gap-2 sm:grid-cols-2">
                      {agents.map((agent) => {
                        const working = activeTask?.steps.some((step) => step.agent_name === agent && step.status === 'running')
                        const done = activeTask?.steps.some((step) => step.agent_name === agent && ['completed', 'approved'].includes(step.status))
                        return (
                          <div
                            key={agent}
                            className="flex items-center gap-2.5 rounded-lg border border-border bg-[#F9F8F6] px-3 py-2.5 text-sm text-text-primary"
                          >
                            <span
                              className={cn(
                                'h-2.5 w-2.5 shrink-0 rounded-full',
                                working && 'bg-amber-500 shadow-sm shadow-amber-500/40',
                                !working && done && 'bg-emerald-500',
                                !working && !done && 'bg-text-tertiary/50',
                              )}
                            />
                            <span className="line-clamp-2 leading-snug">{agent}</span>
                          </div>
                        )
                      })}
                    </div>
                    <div className="rounded-lg border border-border bg-[#0B1220] px-3 py-2.5 font-mono text-[11px] text-[#B8D4FF]">
                      <span className="text-[#6B9BD1]">pipeline</span>{' '}
                      <span className="text-white/90">ai.requests → supervisor → skills → ai.results</span>
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setShowEvents((prev) => !prev)}
                      rightIcon={<ChevronRight className={cn('h-4 w-4 transition-transform', showEvents && 'rotate-90')} />}
                    >
                      {showEvents ? 'Hide debug details' : 'Show debug details'}
                    </Button>
                    {showEvents ? (
                      <>
                        <pre className="max-h-56 overflow-y-auto rounded-lg border border-border bg-[#0B1220] p-3 font-mono text-[10px] leading-relaxed text-[#D1E3FF]">
                          {events.map((event) => `${new Date(event.ts).toLocaleTimeString()}  ${event.topic}  ${event.event}`).join('\n') || 'No events yet'}
                        </pre>
                        <pre className="h-[220px] overflow-y-auto rounded-lg border border-border bg-[#0B1220] p-3 font-mono text-xs text-[#D1E3FF]">
                          {streamLog || 'Waiting for step updates...\n'}
                        </pre>
                      </>
                    ) : null}
                  </Card.Body>
                </Card>

                <Card variant="raised" className="shadow-sm">
                  <Card.Header className="border-b border-border bg-surface-raised/50">
                    <h2 className="text-base font-semibold text-text-primary">Evaluation</h2>
                  </Card.Header>
                  <Card.Body className="space-y-3 p-4 text-sm sm:p-5">
                    <p className="text-text-secondary">
                      Matching quality score:{' '}
                      <strong className="text-lg font-bold text-text-primary tabular-nums">
                        {activeTask ? Math.min(100, 74 + activeTask.steps.filter((s) => s.status === 'completed').length * 6) : 0}
                      </strong>
                    </p>
                    <div className="rounded-xl border border-border bg-[#F9F8F6] p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">Approval rate</p>
                      <p className="mt-2 text-sm text-text-secondary">
                        <span className="font-medium text-emerald-800">{approvals.asIs}</span> approved as-is ·{' '}
                        <span className="font-medium text-sky-800">{approvals.withEdits}</span> with edits ·{' '}
                        <span className="font-medium text-red-800">{approvals.rejected}</span> rejected
                      </p>
                    </div>
                  </Card.Body>
                </Card>
              </div>
            </div>

            {confetti ? (
              <div className="pointer-events-none fixed inset-0 z-[70]">
                {Array.from({ length: 18 }).map((_, index) => (
                  <span key={index} className="absolute animate-bounce text-lg" style={{ left: `${5 + index * 5}%`, top: `${10 + (index % 4) * 8}%` }}>
                    ✨
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        )}
      </div>

      {/* Right rail — fixed narrow width; text wraps in a slim column */}
      <div className="w-full shrink-0 lg:w-[17rem] xl:w-72">
        {!activeTask ? (
          <Card variant="raised" className="shadow-sm lg:sticky lg:top-4 lg:w-full lg:self-start">
            <Card.Header className="border-b border-border px-4 py-3.5 sm:px-5">
              <h2 className="text-base font-semibold text-text-primary">At a glance</h2>
            </Card.Header>
            <Card.Body className="space-y-4 p-4 text-sm text-text-secondary sm:p-5 sm:text-[15px]">
              <div className="flex gap-3">
                <Bot className="mt-0.5 h-5 w-5 shrink-0 text-brand-primary" aria-hidden />
                <div>
                  <p className="font-semibold text-text-primary">Hiring assistant</p>
                  <p className="mt-1 leading-relaxed">Orchestrates skills and tells you what needs approval.</p>
                </div>
              </div>
              <div className="flex gap-3">
                <FileText className="mt-0.5 h-5 w-5 shrink-0 text-brand-primary" aria-hidden />
                <div>
                  <p className="font-semibold text-text-primary">Resume parser</p>
                  <p className="mt-1 leading-relaxed">Structured details from candidate materials.</p>
                </div>
              </div>
              <div className="flex gap-3">
                <Layers className="mt-0.5 h-5 w-5 shrink-0 text-brand-primary" aria-hidden />
                <div>
                  <p className="font-semibold text-text-primary">Matching</p>
                  <p className="mt-1 leading-relaxed">Fit narrative tied to your job criteria.</p>
                </div>
              </div>
              <div className="flex gap-3">
                <MessageSquareText className="mt-0.5 h-5 w-5 shrink-0 text-brand-primary" aria-hidden />
                <div>
                  <p className="font-semibold text-text-primary">Outreach</p>
                  <p className="mt-1 leading-relaxed">Drafts you can edit before anything goes out.</p>
                </div>
              </div>
            </Card.Body>
          </Card>
        ) : (
          <Card variant="raised" className="shadow-sm lg:sticky lg:top-4 lg:w-full lg:self-start">
            <Card.Header className="border-b border-border bg-surface-raised/50 px-4 py-3.5 sm:px-5">
              <h2 className="text-base font-semibold text-text-primary">Quick tips</h2>
            </Card.Header>
            <Card.Body className="space-y-4 p-4 text-sm leading-relaxed text-text-secondary text-pretty sm:p-5 sm:text-[15px]">
              <p>
                Use <strong className="font-semibold text-text-primary">New task</strong> to run another shortlist without leaving this page.
              </p>
              <p>
                When a step shows <strong className="font-semibold text-text-primary">Waiting approval</strong>, review the draft before candidates hear from you.
              </p>
              <p>
                Expand <strong className="font-semibold text-text-primary">System details</strong> only if you need the event log for debugging.
              </p>
            </Card.Body>
          </Card>
        )}
      </div>

      <Modal isOpen={startModalOpen} onClose={() => { setStartModalOpen(false); setModalStep(1) }} title="Start shortlist task" size="lg">
        <Modal.Header>Start shortlist task</Modal.Header>
        <Modal.Body className="space-y-4">
          <div className="flex gap-2 text-xs">
            {[1, 2, 3].map((index) => (
              <span
                key={index}
                className={modalStep === index ? 'rounded-full bg-brand-primary px-2 py-1 text-white' : 'rounded-full bg-black/5 px-2 py-1'}
              >
                Step {index}
              </span>
            ))}
          </div>
          {modalStep === 1 ? (
            <div className="space-y-2">
              <p className="text-sm font-semibold">Select a job</p>
              <Select
                variant="native"
                value={jobId}
                onValueChange={setJobId}
                options={(jobsQuery.data ?? []).map((job) => ({ value: job.job_id, label: `${job.title} • ${job.company_name}` }))}
              />
            </div>
          ) : null}
          {modalStep === 2 ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="h-4 w-4" aria-hidden />
                <p className="text-sm font-semibold">Configure parameters</p>
              </div>
              <label className="block text-sm">
                Min match score: {minMatch}
                <input type="range" min={30} max={95} value={minMatch} onChange={(event) => setMinMatch(Number(event.target.value))} className="mt-1 w-full" />
              </label>
              <label className="block text-sm">
                Top N candidates: {topN}
                <input type="range" min={3} max={20} value={topN} onChange={(event) => setTopN(Number(event.target.value))} className="mt-1 w-full" />
              </label>
              <Input label="Weighted skills (comma-separated)" value={skills} onChange={(event) => setSkills(event.target.value)} leftIcon={<FileText className="h-4 w-4" />} />
              <label className="block text-sm">
                Location radius: {radius} miles
                <input type="range" min={5} max={100} value={radius} onChange={(event) => setRadius(Number(event.target.value))} className="mt-1 w-full" />
              </label>
              <Select
                variant="native"
                value={tone}
                onValueChange={(value) => setTone(value as 'professional' | 'casual' | 'enthusiastic')}
                options={[
                  { value: 'professional', label: 'professional' },
                  { value: 'casual', label: 'casual' },
                  { value: 'enthusiastic', label: 'enthusiastic' },
                ]}
              />
            </div>
          ) : null}
          {modalStep === 3 ? (
            <div className="space-y-2 text-sm">
              <p>
                <strong>Job:</strong> {jobsQuery.data?.find((job) => job.job_id === jobId)?.title ?? 'Not selected'}
              </p>
              <p>
                <strong>Min match:</strong> {minMatch}
              </p>
              <p>
                <strong>Top N:</strong> {topN}
              </p>
              <p>
                <strong>Skills:</strong> {skills}
              </p>
              <p>
                <strong>Radius:</strong> {radius} miles
              </p>
              <p>
                <strong>Tone:</strong> {tone}
              </p>
            </div>
          ) : null}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="tertiary" disabled={modalStep === 1} onClick={() => setModalStep((prev) => Math.max(1, prev - 1))}>
            Back
          </Button>
          {modalStep < 3 ? (
            <Button onClick={() => setModalStep((prev) => prev + 1)} disabled={modalStep === 1 && !jobId}>
              Next
            </Button>
          ) : (
            <Button loading={startMutation.isPending} onClick={() => startMutation.mutate()} leftIcon={<Play className="h-4 w-4" />}>
              Start
            </Button>
          )}
        </Modal.Footer>
      </Modal>

      <Modal isOpen={Boolean(rejectingStepId)} onClose={() => setRejectingStepId(null)} title="Reject step" size="sm">
        <Modal.Header>Reject step</Modal.Header>
        <Modal.Body className="space-y-2">
          <Textarea label="Reason" value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} autoResize />
        </Modal.Body>
        <Modal.Footer>
          <Button variant="tertiary" onClick={() => setRejectingStepId(null)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              const step = activeTask?.steps.find((item) => item.step_id === rejectingStepId)
              if (!step) return
              rejectMutation.mutate({ step, reason: rejectReason })
            }}
            disabled={!rejectReason.trim()}
          >
            Reject
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  )
}
