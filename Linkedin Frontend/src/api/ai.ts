// ============================================
// INTEGRATION CONTRACT — AI Service
// ============================================
// Current mode: MOCK-FIRST (in-memory task state when VITE_USE_MOCKS=true)
// To integrate: preserve signatures and swap axios internals with production endpoints.
//
// Endpoints:
//   POST /ai/tasks/start      → startShortlistTask(job_id, params)
//   POST /ai/tasks/status     → getTaskStatus(task_id)
//   POST /ai/tasks/list       → listTasks()
//   POST /ai/tasks/approve    → approveOutput(task_id, step_id, edited_content?)
//   POST /ai/tasks/reject     → rejectOutput(task_id, step_id, reason)
//
// Auth: Bearer token via src/api/client.ts interceptor
// ============================================

import { USE_MOCKS, apiClient, mockDelay } from './client'

export type AiTaskStatus = 'running' | 'waiting_approval' | 'completed' | 'failed'

export type AiTaskStep = {
  step_id: string
  step_name: string
  step_index: number
  agent_name: string
  status: 'pending' | 'running' | 'waiting_approval' | 'approved' | 'rejected' | 'completed'
  progress_pct?: number
  output?: string
  draft_content?: string
}

export type AiTask = {
  task_id: string
  trace_id: string
  title: string
  status: AiTaskStatus
  job_id: string
  created_at: string
  updated_at: string
  steps: AiTaskStep[]
  final_output?: string
  error?: string
}

type StartShortlistPayload = {
  job_id: string
  params: {
    min_match_score: number
    top_n: number
    weighted_skills: string[]
    location_radius_miles: number
    outreach_tone: 'professional' | 'casual' | 'enthusiastic'
  }
}

let inMemoryTasks: AiTask[] = []

function mockStep(stepIndex: number, stepName: string, agentName: string): AiTaskStep {
  return {
    step_id: `step-${stepIndex + 1}`,
    step_name: stepName,
    step_index: stepIndex,
    agent_name: agentName,
    status: stepIndex === 0 ? 'running' : 'pending',
    progress_pct: stepIndex === 0 ? 8 : 0,
  }
}

function createMockTask(payload: StartShortlistPayload): AiTask {
  const now = new Date().toISOString()
  return {
    task_id: `task-${Date.now()}`,
    trace_id: crypto.randomUUID(),
    title: `Shortlist candidates for ${payload.job_id}`,
    status: 'running',
    job_id: payload.job_id,
    created_at: now,
    updated_at: now,
    steps: [
      mockStep(0, 'Parse Resumes', 'Resume Parser Skill'),
      mockStep(1, 'Compute Match Scores', 'Job-Candidate Matching Skill'),
      mockStep(2, 'Draft Outreach', 'Outreach Draft Generator'),
      mockStep(3, 'Supervisor Review', 'Hiring Assistant Agent (Supervisor)'),
    ],
  }
}

export async function startShortlistTask(job_id: string, params: StartShortlistPayload['params']): Promise<{ task_id: string; trace_id: string }> {
  if (USE_MOCKS) {
    await mockDelay(300)
    const task = createMockTask({ job_id, params })
    inMemoryTasks = [task, ...inMemoryTasks]
    return { task_id: task.task_id, trace_id: task.trace_id }
  }
  const response = await apiClient.post<{ task_id: string; trace_id: string }>('/ai/tasks/start', { job_id, params })
  return response.data
}

export async function getTaskStatus(task_id: string): Promise<AiTask> {
  if (USE_MOCKS) {
    await mockDelay(180)
    const found = inMemoryTasks.find((task) => task.task_id === task_id)
    if (!found) {
      throw new Error('Task not found')
    }
    return found
  }
  const response = await apiClient.post<AiTask>('/ai/tasks/status', { task_id })
  return response.data
}

export async function listTasks(): Promise<AiTask[]> {
  if (USE_MOCKS) {
    await mockDelay(180)
    return inMemoryTasks
  }
  const response = await apiClient.post<AiTask[]>('/ai/tasks/list', {})
  return response.data
}

export async function approveOutput(task_id: string, step_id: string, edited_content?: string): Promise<{ success: boolean }> {
  if (USE_MOCKS) {
    await mockDelay(180)
    inMemoryTasks = inMemoryTasks.map((task) =>
      task.task_id === task_id
        ? {
            ...task,
            status: 'running',
            steps: task.steps.map((step) =>
              step.step_id === step_id
                ? { ...step, status: 'approved', output: edited_content ?? step.draft_content ?? step.output }
                : step,
            ),
          }
        : task,
    )
    return { success: true }
  }
  const response = await apiClient.post<{ success: boolean }>('/ai/tasks/approve', { task_id, step_id, edited_content })
  return response.data
}

export async function rejectOutput(task_id: string, step_id: string, reason: string): Promise<{ success: boolean }> {
  if (USE_MOCKS) {
    await mockDelay(180)
    inMemoryTasks = inMemoryTasks.map((task) =>
      task.task_id === task_id
        ? {
            ...task,
            status: 'running',
            steps: task.steps.map((step) =>
              step.step_id === step_id
                ? { ...step, status: 'rejected', output: `Rejected: ${reason}` }
                : step,
            ),
          }
        : task,
    )
    return { success: true }
  }
  const response = await apiClient.post<{ success: boolean }>('/ai/tasks/reject', { task_id, step_id, reason })
  return response.data
}

export type CareerCoachResponse = {
  task_id?: string
  trace_id?: string
  member_id?: string
  target_job_id?: string
  suggestions?: {
    headline?: string
    summary?: string
    skills_to_add?: string[]
    resume_bullets?: string[]
  }
  rationale?: string[]
}

export async function getCareerCoaching(member_id: string, target_job_id: string): Promise<CareerCoachResponse> {
  const response = await apiClient.post<CareerCoachResponse>('/ai/coach', { member_id, target_job_id })
  return response.data
}
