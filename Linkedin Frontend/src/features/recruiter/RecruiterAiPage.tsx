import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, Sparkles, Search, Loader2, CheckCircle2, XCircle, Circle, FileText, SlidersHorizontal, Play, MessageSquareText, Users, Bot, Workflow, ChevronRight } from 'lucide-react'
import { listJobsByRecruiter } from '../../api/jobs'
import { approveOutput, getTaskStatus, listTasks, rejectOutput, startShortlistTask, type AiTask, type AiTaskStep } from '../../api/ai'
import { useActionToast } from '../../hooks/useActionToast'
import { useAuthStore } from '../../store/authStore'
import { Badge, Button, Card, Input, Modal, Select, Textarea, useToast } from '../../components/ui'

const agents = [
  'Hiring Assistant Agent (Supervisor)',
  'Resume Parser Skill',
  'Job-Candidate Matching Skill',
  'Outreach Draft Generator',
]

function statusBadge(status: AiTask['status']): JSX.Element {
  const variant = status === 'completed' ? 'success' : status === 'failed' ? 'danger' : status === 'waiting_approval' ? 'neutral' : 'brand'
  return <Badge variant={variant}>{status.replace('_', ' ')}</Badge>
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

function stepStatusLabel(status: AiTaskStep['status']): string {
  return status.replace('_', ' ')
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

  useEffect(() => {
    activeTaskTitleRef.current = activeTask?.title ?? ''
  }, [activeTask?.title])

  useEffect(() => {
    if (!activeTask?.task_id || !token) {
      return
    }

    const currentOriginWsBase =
      typeof window !== 'undefined' && window.location?.host
        ? `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}`
        : ''
    const wsBase = String(import.meta.env.VITE_AI_WS_BASE_URL || import.meta.env.VITE_WS_BASE_URL || currentOriginWsBase).replace(/\/$/, '')
    const wsUrl = `${wsBase}/ai/tasks/${activeTask.task_id}?token=${encodeURIComponent(token)}`

    try {
      const ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.onmessage = (event) => {
        const message = JSON.parse(event.data) as { type: string; payload: any }
        setEvents((prev) => [
          { ts: new Date().toISOString(), topic: 'ai.results', event: message.type },
          ...prev,
        ].slice(0, 80))

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
        weighted_skills: skills.split(',').map((item) => item.trim()).filter(Boolean),
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
    mutationFn: ({ step, edited }: { step: AiTaskStep; edited?: string }) => approveOutput(activeTask?.task_id ?? '', step.step_id, edited),
    onSuccess: async () => {
      await tasksQuery.refetch()
      toast({ variant: 'success', title: 'Step approved' })
    },
  })

  const rejectMutation = useMutation({
    mutationFn: ({ step, reason }: { step: AiTaskStep; reason: string }) => rejectOutput(activeTask?.task_id ?? '', step.step_id, reason),
    onSuccess: async () => {
      setRejectingStepId(null)
      setRejectReason('')
      await tasksQuery.refetch()
      toast({ variant: 'info', title: 'Step rejected' })
    },
  })

  const filteredTasks = useMemo(() => {
    return (tasksQuery.data ?? []).filter((task) => task.title.toLowerCase().includes(search.toLowerCase()) || task.trace_id.includes(search))
  }, [tasksQuery.data, search])

  const approvals = useMemo(() => {
    const steps = activeTask?.steps ?? []
    const asIs = steps.filter((step) => step.status === 'approved' && !(draftEdits[step.step_id] ?? '').trim()).length
    const withEdits = steps.filter((step) => step.status === 'approved' && (draftEdits[step.step_id] ?? '').trim()).length
    const rejected = steps.filter((step) => step.status === 'rejected').length
    return { asIs, withEdits, rejected }
  }, [activeTask?.steps, draftEdits])

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

  return (
    <div className="grid grid-cols-12 gap-3 pb-6">
      <div className="col-span-12 lg:col-span-3">
        <Card>
          <Card.Header className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">Task history</h2>
              <Button size="sm" onClick={() => setStartModalOpen(true)} leftIcon={<Play className="h-4 w-4" />}>
                New task
              </Button>
            </div>
            <Input placeholder="Search tasks" value={search} onChange={(event) => setSearch(event.target.value)} leftIcon={<Search className="h-4 w-4" />} />
          </Card.Header>
          <Card.Body className="max-h-[calc(100vh-220px)] space-y-2 overflow-y-auto">
            {filteredTasks.map((task) => (
              <button
                key={task.task_id}
                type="button"
                onClick={() => {
                  setActiveTaskId(task.task_id)
                  setStreamLog('')
                }}
                className={`w-full rounded-md border border-border p-2 text-left transition ${activeTask?.task_id === task.task_id ? 'bg-brand-primary/10' : 'hover:bg-black/5'}`}
              >
                <p className="text-sm font-semibold text-text-primary">{task.title}</p>
                <p className="truncate font-mono text-[11px] text-text-tertiary">{task.trace_id}</p>
                <div className="mt-1">{statusBadge(task.status)}</div>
              </button>
            ))}
          </Card.Body>
        </Card>
      </div>

      <div className="col-span-12 lg:col-span-6">
        {!activeTask ? (
          <Card>
            <Card.Body className="space-y-4 p-6">
              <div className="rounded-xl bg-gradient-to-r from-brand-primary to-purple-600 p-5 text-white">
                <div className="flex items-center gap-2"><Sparkles className="h-5 w-5" /><h1 className="text-2xl font-semibold">Recruiter Copilot</h1></div>
                <p className="mt-1 text-sm text-white/90">Use AI to shortlist candidates, understand fit, and prepare recruiter outreach.</p>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <button type="button" onClick={() => setStartModalOpen(true)} className="rounded-lg border border-border p-3 text-left hover:bg-black/5">
                  <p className="font-semibold">Shortlist candidates for a job</p>
                  <p className="text-xs text-text-secondary">Runs parsing, matching, outreach drafting, and supervisor review.</p>
                </button>
                <div className="rounded-lg border border-border p-3"><p className="font-semibold">Read match reasoning</p><p className="text-xs text-text-secondary">See what the matching agent concluded and why.</p></div>
                <div className="rounded-lg border border-border p-3"><p className="font-semibold">Review outreach drafts</p><p className="text-xs text-text-secondary">Approve or edit recruiter messages before sending.</p></div>
              </div>

              <Card className="border-dashed">
                <Card.Body className="space-y-2 p-4 text-sm text-text-secondary">
                  <p className="font-semibold text-text-primary">How to read this page</p>
                  <p><strong>Resume Parser:</strong> extracts candidate facts from applications.</p>
                  <p><strong>Matching Skill:</strong> explains why a candidate fits the job.</p>
                  <p><strong>Outreach Draft:</strong> recruiter-ready message you can approve or edit.</p>
                  <p><strong>Supervisor:</strong> coordinates the workflow and tells you what is ready.</p>
                </Card.Body>
              </Card>

              <div>
                <h3 className="mb-2 text-sm font-semibold text-text-primary">Recent tasks</h3>
                <div className="space-y-2">{(filteredTasks.slice(0, 4)).map((task) => <button key={task.task_id} type="button" onClick={() => setActiveTaskId(task.task_id)} className="block w-full rounded-md bg-surface px-3 py-2 text-left text-sm hover:bg-black/5">{task.title}</button>)}</div>
              </div>
            </Card.Body>
          </Card>
        ) : (
          <div className="space-y-3">
            <Card>
              <Card.Body className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h1 className="text-xl font-semibold text-text-primary">{activeTask.title}</h1>
                    <div className="mt-1 flex items-center gap-2 text-xs text-text-secondary">
                      <span className="font-mono">trace_id: {activeTask.trace_id}</span>
                      <button type="button" onClick={() => copyText(activeTask.trace_id)} className="rounded p-1 hover:bg-black/5" aria-label="Copy trace id"><Copy className="h-3.5 w-3.5" /></button>
                    </div>
                    <p className="mt-2 max-w-2xl text-sm text-text-secondary">
                      This task combines four AI skills: parse applicant information, score fit against the job, draft recruiter outreach, and let the supervisor decide what needs approval.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {statusBadge(activeTask.status)}
                    {activeTask.status === 'running' ? <span className="text-xs text-text-secondary">{durationLabel(activeTask.created_at)}</span> : null}
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-4">
                  <div className="rounded-lg border border-border bg-surface p-3">
                    <div className="flex items-center gap-2 text-text-secondary"><Workflow className="h-4 w-4" /><span className="text-xs font-semibold uppercase tracking-wide">Workflow</span></div>
                    <p className="mt-2 text-2xl font-semibold text-text-primary">{parsedTask.completedSteps}/{activeTask.steps.length}</p>
                    <p className="text-xs text-text-secondary">steps completed</p>
                  </div>
                  <div className="rounded-lg border border-border bg-surface p-3">
                    <div className="flex items-center gap-2 text-text-secondary"><Users className="h-4 w-4" /><span className="text-xs font-semibold uppercase tracking-wide">Candidates</span></div>
                    <p className="mt-2 text-2xl font-semibold text-text-primary">{activeTask.final_output ? 1 : 0}</p>
                    <p className="text-xs text-text-secondary">result bundle ready</p>
                  </div>
                  <div className="rounded-lg border border-border bg-surface p-3">
                    <div className="flex items-center gap-2 text-text-secondary"><MessageSquareText className="h-4 w-4" /><span className="text-xs font-semibold uppercase tracking-wide">Approvals</span></div>
                    <p className="mt-2 text-2xl font-semibold text-text-primary">{parsedTask.waitingApprovals}</p>
                    <p className="text-xs text-text-secondary">steps waiting on recruiter</p>
                  </div>
                  <div className="rounded-lg border border-border bg-surface p-3">
                    <div className="flex items-center gap-2 text-text-secondary"><Bot className="h-4 w-4" /><span className="text-xs font-semibold uppercase tracking-wide">Outcome</span></div>
                    <p className="mt-2 text-sm font-semibold text-text-primary">{activeTask.final_output ?? 'Still processing'}</p>
                    <p className="text-xs text-text-secondary">latest task result</p>
                  </div>
                </div>
              </Card.Body>
            </Card>

            <div className="grid gap-3 md:grid-cols-[1.2fr_0.8fr]">
              <Card>
                <Card.Header><h2 className="text-sm font-semibold">AI outputs</h2></Card.Header>
                <Card.Body className="space-y-3 p-3">
                  {[
                    parsedTask.resumeStep,
                    parsedTask.matchStep,
                    parsedTask.outreachStep,
                    parsedTask.supervisorStep,
                  ].filter(Boolean).map((step) => {
                    const item = step as AiTaskStep
                    const showApproval = item.status === 'waiting_approval'
                    const draft = draftEdits[item.step_id] ?? item.draft_content ?? ''
                    const changed = draft.trim() !== (item.draft_content ?? '').trim()
                    return (
                      <div key={item.step_id} className="overflow-hidden rounded-xl border border-border transition-all duration-200">
                        <div className="flex items-start justify-between gap-3 bg-surface px-4 py-3">
                          <div>
                            <p className="text-sm font-semibold text-text-primary">{item.step_name}</p>
                            <p className="text-xs text-text-secondary">{item.agent_name}</p>
                            <p className="mt-1 text-xs text-text-tertiary">{agentPurpose(item.agent_name)}</p>
                          </div>
                          <div className="flex items-center gap-1 text-xs text-text-secondary">
                            {item.status === 'running' ? <Loader2 className="h-3.5 w-3.5 animate-spin text-brand-primary" /> : null}
                            {item.status === 'completed' || item.status === 'approved' ? <CheckCircle2 className="h-3.5 w-3.5 text-success" /> : null}
                            {item.status === 'rejected' ? <XCircle className="h-3.5 w-3.5 text-danger" /> : null}
                            {item.status === 'pending' ? <Circle className="h-3.5 w-3.5 text-text-tertiary" /> : null}
                            <span>{stepStatusLabel(item.status)}</span>
                          </div>
                        </div>
                        <div className="space-y-3 px-4 py-3 text-sm">
                          {item.progress_pct && item.status === 'running' ? (
                            <div>
                              <div className="h-1.5 rounded-full bg-black/10"><div className="h-full rounded-full bg-brand-primary transition-all" style={{ width: `${item.progress_pct}%` }} /></div>
                            </div>
                          ) : null}
                          <div className="rounded-lg border border-border bg-white p-3">
                            <p className="whitespace-pre-wrap text-text-secondary">{summarizeStep(item)}</p>
                          </div>
                          {showApproval ? (
                            <div className="space-y-2">
                              <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">Review draft</p>
                              <Textarea autoResize value={draft} onChange={(event) => setDraftEdits((prev) => ({ ...prev, [item.step_id]: event.target.value }))} />
                              <div className="flex flex-wrap gap-2">
                                <Button size="sm" onClick={() => approveMutation.mutate({ step: item })}>Approve as-is</Button>
                                <Button size="sm" variant="secondary" disabled={!changed} onClick={() => approveMutation.mutate({ step: item, edited: draft })}>Approve with edits</Button>
                                <Button size="sm" variant="destructive" onClick={() => setRejectingStepId(item.step_id)}>Reject</Button>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    )
                  })}
                  {activeTask.steps.length === 0 ? <div className="rounded-lg border border-dashed border-border p-4 text-sm text-text-secondary">No step output is available yet.</div> : null}
                </Card.Body>
              </Card>

              <div className="space-y-3">
                <Card>
                  <Card.Header><h2 className="text-sm font-semibold">How to read this task</h2></Card.Header>
                  <Card.Body className="space-y-3 text-sm text-text-secondary">
                    <div>
                      <p className="font-semibold text-text-primary">Resume Parser Skill</p>
                      <p>Look here for extracted candidate facts and resume-derived details.</p>
                    </div>
                    <div>
                      <p className="font-semibold text-text-primary">Job-Candidate Matching Skill</p>
                      <p>This explains why the AI thinks a candidate is a strong or weak fit.</p>
                    </div>
                    <div>
                      <p className="font-semibold text-text-primary">Outreach Draft Generator</p>
                      <p>This is recruiter-ready copy you can approve, edit, or reject.</p>
                    </div>
                    <div>
                      <p className="font-semibold text-text-primary">Hiring Assistant Agent</p>
                      <p>This is the workflow orchestrator and the final “ready for action” layer.</p>
                    </div>
                  </Card.Body>
                </Card>

                <Card>
                  <Card.Header><h2 className="text-sm font-semibold">System details</h2></Card.Header>
                  <Card.Body className="space-y-3">
                    <div className="space-y-2">
                      {agents.map((agent) => {
                        const working = activeTask?.steps.some((step) => step.agent_name === agent && step.status === 'running')
                        const done = activeTask?.steps.some((step) => step.agent_name === agent && ['completed', 'approved'].includes(step.status))
                        return (
                          <div key={agent} className="flex items-center gap-2 text-sm">
                            <span className={`h-2.5 w-2.5 rounded-full ${working ? 'bg-brand-primary' : done ? 'bg-success' : 'bg-text-tertiary'}`} />
                            <span>{agent}</span>
                          </div>
                        )
                      })}
                    </div>
                    <div className="rounded-md bg-surface p-2 font-mono text-xs">ai.requests → supervisor → skills → ai.results</div>
                    <Button size="sm" variant="secondary" onClick={() => setShowEvents((prev) => !prev)} rightIcon={<ChevronRight className={`h-4 w-4 transition-transform ${showEvents ? 'rotate-90' : ''}`} />}>
                      {showEvents ? 'Hide debug details' : 'Show debug details'}
                    </Button>
                    {showEvents ? (
                      <>
                        <pre className="max-h-56 overflow-y-auto rounded-md bg-[#0B1220] p-2 font-mono text-[11px] text-[#D1E3FF]">{events.map((event) => `${new Date(event.ts).toLocaleTimeString()}  ${event.topic}  ${event.event}`).join('\n') || 'No events yet'}</pre>
                        <pre className="h-[220px] overflow-y-auto rounded-md bg-[#0B1220] p-3 font-mono text-xs text-[#D1E3FF]">{streamLog || 'Waiting for step updates...\n'}</pre>
                      </>
                    ) : null}
                  </Card.Body>
                </Card>

                <Card>
                  <Card.Header><h2 className="text-sm font-semibold">Evaluation</h2></Card.Header>
                  <Card.Body className="space-y-2 text-sm">
                    <p>Matching quality score: <strong>{activeTask ? Math.min(100, 74 + activeTask.steps.filter((s) => s.status === 'completed').length * 6) : 0}</strong></p>
                    <p>Approval rate:</p>
                    <p className="text-xs text-text-secondary">{approvals.asIs} approved as-is / {approvals.withEdits} approved with edits / {approvals.rejected} rejected</p>
                  </Card.Body>
                </Card>
              </div>
            </div>

            {confetti ? (
              <div className="pointer-events-none fixed inset-0 z-[70]">
                {Array.from({ length: 18 }).map((_, index) => (
                  <span key={index} className="absolute animate-bounce text-lg" style={{ left: `${5 + index * 5}%`, top: `${10 + (index % 4) * 8}%` }}>✨</span>
                ))}
              </div>
            ) : null}
          </div>
        )}
      </div>

      <div className="col-span-12 lg:col-span-3">
        {!activeTask ? (
          <Card>
            <Card.Header><h2 className="text-sm font-semibold">What this page is for</h2></Card.Header>
            <Card.Body className="space-y-3 text-sm text-text-secondary">
              <p><strong className="text-text-primary">Hiring Assistant Agent</strong> orchestrates the workflow.</p>
              <p><strong className="text-text-primary">Resume Parser Skill</strong> extracts structured candidate details.</p>
              <p><strong className="text-text-primary">Job-Candidate Matching Skill</strong> checks fit.</p>
              <p><strong className="text-text-primary">Outreach Draft Generator</strong> prepares recruiter messaging.</p>
            </Card.Body>
          </Card>
        ) : null}
      </div>

      <Modal isOpen={startModalOpen} onClose={() => { setStartModalOpen(false); setModalStep(1) }} title="Start shortlist task" size="lg">
        <Modal.Header>Start shortlist task</Modal.Header>
        <Modal.Body className="space-y-4">
          <div className="flex gap-2 text-xs">{[1, 2, 3].map((index) => <span key={index} className={modalStep === index ? 'rounded-full bg-brand-primary px-2 py-1 text-white' : 'rounded-full bg-black/5 px-2 py-1'}>Step {index}</span>)}</div>
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
              <div className="flex items-center gap-2"><SlidersHorizontal className="h-4 w-4" /><p className="text-sm font-semibold">Configure parameters</p></div>
              <label className="block text-sm">Min match score: {minMatch}<input type="range" min={30} max={95} value={minMatch} onChange={(event) => setMinMatch(Number(event.target.value))} className="mt-1 w-full" /></label>
              <label className="block text-sm">Top N candidates: {topN}<input type="range" min={3} max={20} value={topN} onChange={(event) => setTopN(Number(event.target.value))} className="mt-1 w-full" /></label>
              <Input label="Weighted skills (comma-separated)" value={skills} onChange={(event) => setSkills(event.target.value)} leftIcon={<FileText className="h-4 w-4" />} />
              <label className="block text-sm">Location radius: {radius} miles<input type="range" min={5} max={100} value={radius} onChange={(event) => setRadius(Number(event.target.value))} className="mt-1 w-full" /></label>
              <Select variant="native" value={tone} onValueChange={(value) => setTone(value as any)} options={[{ value: 'professional', label: 'professional' }, { value: 'casual', label: 'casual' }, { value: 'enthusiastic', label: 'enthusiastic' }]} />
            </div>
          ) : null}
          {modalStep === 3 ? (
            <div className="space-y-2 text-sm">
              <p><strong>Job:</strong> {jobsQuery.data?.find((job) => job.job_id === jobId)?.title ?? 'Not selected'}</p>
              <p><strong>Min match:</strong> {minMatch}</p>
              <p><strong>Top N:</strong> {topN}</p>
              <p><strong>Skills:</strong> {skills}</p>
              <p><strong>Radius:</strong> {radius} miles</p>
              <p><strong>Tone:</strong> {tone}</p>
            </div>
          ) : null}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="tertiary" disabled={modalStep === 1} onClick={() => setModalStep((prev) => Math.max(1, prev - 1))}>Back</Button>
          {modalStep < 3 ? <Button onClick={() => setModalStep((prev) => prev + 1)} disabled={modalStep === 1 && !jobId}>Next</Button> : <Button loading={startMutation.isPending} onClick={() => startMutation.mutate()} leftIcon={<Play className="h-4 w-4" />}>Start</Button>}
        </Modal.Footer>
      </Modal>

      <Modal isOpen={Boolean(rejectingStepId)} onClose={() => setRejectingStepId(null)} title="Reject step" size="sm">
        <Modal.Header>Reject step</Modal.Header>
        <Modal.Body className="space-y-2">
          <Textarea label="Reason" value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} autoResize />
        </Modal.Body>
        <Modal.Footer>
          <Button variant="tertiary" onClick={() => setRejectingStepId(null)}>Cancel</Button>
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
