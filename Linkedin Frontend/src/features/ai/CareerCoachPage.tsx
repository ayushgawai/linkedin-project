import { useMemo, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { getCareerCoaching, type CareerCoachResponse } from '../../api/ai'
import { Button, Card, Input, Textarea } from '../../components/ui'
import { useAuthStore } from '../../store/authStore'

function prettyJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

export default function CareerCoachPage(): JSX.Element {
  const user = useAuthStore((s) => s.user)
  const [memberId, setMemberId] = useState(user?.member_id ?? '')
  const [targetJobId, setTargetJobId] = useState('')
  const [raw, setRaw] = useState<CareerCoachResponse | null>(null)

  const canRun = useMemo(() => memberId.trim().length > 0 && targetJobId.trim().length > 0, [memberId, targetJobId])

  const coachMutation = useMutation({
    mutationFn: async () => getCareerCoaching(memberId.trim(), targetJobId.trim()),
    onSuccess: (data) => setRaw(data),
  })

  return (
    <div className="space-y-4">
      <Card>
        <Card.Body className="space-y-3">
          <div>
            <h1 className="text-xl font-semibold text-text-primary">Career Coach</h1>
            <p className="mt-1 text-sm text-text-secondary">
              Generate resume/headline suggestions for a target job using the AI Coach skill.
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <Input
              label="Member ID"
              value={memberId}
              onChange={(e) => setMemberId(e.target.value)}
              placeholder="member_id"
            />
            <Input
              label="Target Job ID"
              value={targetJobId}
              onChange={(e) => setTargetJobId(e.target.value)}
              placeholder="job_id"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="primary"
              disabled={!canRun || coachMutation.isPending}
              onClick={() => coachMutation.mutate()}
            >
              {coachMutation.isPending ? 'Generating…' : 'Generate suggestions'}
            </Button>
            {coachMutation.isError ? (
              <span className="text-sm text-danger">Unable to generate coaching</span>
            ) : null}
          </div>
        </Card.Body>
      </Card>

      <Card>
        <Card.Body className="space-y-3">
          <h2 className="text-base font-semibold text-text-primary">Output</h2>
          <Textarea
            label="Raw response (read-only)"
            value={raw ? prettyJson(raw) : ''}
            onChange={() => {}}
            rows={14}
            readOnly
          />
        </Card.Body>
      </Card>
    </div>
  )
}

