/**
 * In-memory save counts for recruiter dashboard (mock / local demo).
 * Adjusted when users save or remove jobs so the dashboard bar chart updates.
 */
const savedByJobId = new Map<string, number>()

export function adjustMockSavedJobCount(jobId: string, delta: number): void {
  const next = Math.max(0, (savedByJobId.get(jobId) ?? 0) + delta)
  if (next === 0) savedByJobId.delete(jobId)
  else savedByJobId.set(jobId, next)
}

export function getMockSavedJobCounts(): Map<string, number> {
  return new Map(savedByJobId)
}
