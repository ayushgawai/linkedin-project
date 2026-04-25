import { BriefcaseBusiness } from 'lucide-react'
import { Button } from '../components/ui'

export default function HomePage(): JSX.Element {
  return (
    <main className="flex min-h-screen items-center justify-center bg-surface p-6">
      <section className="w-full max-w-lg rounded-lg border border-border bg-surface-raised p-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-md bg-brand-primary text-white">
          <span className="text-lg font-bold">in</span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-text-primary">LinkedIn Clone — Ready</h1>
        <p className="mt-2 text-sm text-text-secondary">
          Frontend foundation is configured for distributed service integration.
        </p>
        <Button className="mt-6" leftIcon={<BriefcaseBusiness className="h-4 w-4" />}>
          Primary Action
        </Button>
      </section>
    </main>
  )
}
