import { Eye, Lock, Plus, Shield, Bell, Database, BadgeInfo, ChevronRight } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Button, Card, Input, Modal, Textarea } from '../components/ui'
import { cn } from '../lib/cn'
import { useTheme } from '../lib/theme'
import { useProfileStore } from '../store/profileStore'

function Placeholder({ title }: { title: string }): JSX.Element {
  return (
    <Card>
      <Card.Body>
        <h1 className="text-xl font-semibold text-text-primary">{title}</h1>
      </Card.Body>
    </Card>
  )
}

/** LinkedIn-style secondary pill: white fill, ~1px dark border, dark label + trailing + (e.g. “Add industry +”). */
const linkedInOutlinePillClass = cn(
  'inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-[#303030] bg-white px-3 py-1.5 text-xs font-semibold text-[#191919] shadow-none transition',
  'hover:bg-black/[0.04] active:bg-black/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/25 focus-visible:ring-offset-2',
)

const linkedInPrimaryDisabledClass =
  'rounded-full bg-black/10 px-5 py-1.5 text-sm font-semibold text-black/40 cursor-not-allowed border border-black/5'

type ModalSlotArgs = { onClose: () => void }

function PlaceholderWithCreateHeader({
  title,
  createLabel,
  modalTitle,
  children,
  footer,
}: {
  title: string
  createLabel: string
  modalTitle: string
  children: (args: ModalSlotArgs) => ReactNode
  footer: (args: ModalSlotArgs) => ReactNode
}): JSX.Element {
  const [open, setOpen] = useState(false)
  const onClose = (): void => setOpen(false)
  return (
    <div className="space-y-4">
      <div
        className="flex items-center justify-between gap-3 rounded-lg border border-border bg-white px-4 py-3"
        style={{ boxShadow: '0 0 0 1px rgba(0,0,0,0.02)' }}
      >
        <h1 className="text-lg font-semibold text-[#191919]">{title}</h1>
        <button
          type="button"
          className={linkedInOutlinePillClass}
          aria-label={createLabel}
          onClick={() => setOpen(true)}
        >
          {createLabel}
          <Plus className="h-3.5 w-3.5 shrink-0 stroke-[2.5]" aria-hidden />
        </button>
      </div>
      <Card>
        <Card.Body className="text-sm text-text-secondary">
          <p>Use the button above to open the create flow (demo UI).</p>
        </Card.Body>
      </Card>

      <Modal isOpen={open} onClose={onClose} title={modalTitle} size="lg">
        <Modal.Header>{modalTitle}</Modal.Header>
        <Modal.Body className="space-y-4">{children({ onClose })}</Modal.Body>
        <Modal.Footer>{footer({ onClose })}</Modal.Footer>
      </Modal>
    </div>
  )
}

function GroupsCreateForm(): JSX.Element {
  const [name, setName] = useState('')
  return (
    <>
      <div className="rounded-lg border border-border bg-[#f3f0fa] px-4 py-10 text-center">
        <p className="text-sm font-semibold text-text-primary">Banner & logo</p>
        <p className="mt-1 text-xs text-text-secondary">Upload a cover image for your group</p>
      </div>
      <Input label="Group name*" value={name} onChange={(e) => setName(e.target.value.slice(0, 100))} placeholder="Inspiring Entrepreneurs in DC" />
      <p className="-mt-2 text-right text-xs text-text-tertiary">{name.length}/100</p>
      <Textarea label="Description*" placeholder="What is the purpose of your group?" rows={4} />
      <p className="-mt-2 text-right text-xs text-text-tertiary">0/2,000</p>
      <div>
        <p className="mb-2 text-xs font-semibold text-text-secondary">Industry (up to 3)</p>
        <button type="button" className={linkedInOutlinePillClass}>
          Add industry
          <Plus className="h-3.5 w-3.5 shrink-0 stroke-[2.5]" aria-hidden />
        </button>
      </div>
    </>
  )
}

function NewslettersCreateForm(): JSX.Element {
  return (
    <>
      <p className="text-sm text-text-secondary">
        Share long-form updates with your network.{' '}
        <button type="button" className="font-semibold text-brand-primary hover:underline">
          Learn more
        </button>
      </p>
      <p className="text-sm font-semibold text-text-primary">Newsletter details</p>
      <Input label="Newsletter title*" placeholder="Add a title to your newsletter" />
      <Textarea label="Newsletter description*" placeholder="Describe your newsletter" rows={3} />
      <div>
        <label className="mb-1 block text-xs font-semibold text-text-secondary">How often do you want to publish?*</label>
        <select className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm text-text-primary">
          <option>Select</option>
          <option>Weekly</option>
          <option>Biweekly</option>
          <option>Monthly</option>
        </select>
      </div>
      <div className="flex items-start gap-3 rounded-md border border-dashed border-border p-4">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-black/5 text-text-tertiary">◯</div>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-text-secondary">Add an image or logo for your newsletter</p>
          <button type="button" className={cn(linkedInOutlinePillClass, 'mt-2')}>
            Upload image
          </button>
        </div>
      </div>
    </>
  )
}

function EventsCreateForm(): JSX.Element {
  return (
    <>
      <div className="rounded-lg border border-border bg-[#f5f1eb] px-4 py-12 text-center">
        <p className="text-sm font-semibold text-text-primary">Upload cover image</p>
        <p className="mt-1 text-xs text-text-tertiary">Minimum width 480 pixels, 16:9 recommended</p>
      </div>
      <div>
        <p className="mb-2 text-xs font-semibold text-text-secondary">Event type</p>
        <div className="flex gap-6 text-sm">
          <label className="inline-flex cursor-pointer items-center gap-2">
            <span className="flex h-4 w-4 items-center justify-center rounded-full border-2 border-success bg-white">
              <span className="h-2 w-2 rounded-full bg-success" />
            </span>
            Online
          </label>
          <label className="inline-flex cursor-pointer items-center gap-2 text-text-secondary">
            <span className="h-4 w-4 rounded-full border-2 border-border bg-white" />
            In person
          </label>
        </div>
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold text-text-secondary">Event format*</label>
        <select className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm text-text-tertiary">
          <option>Select</option>
        </select>
      </div>
    </>
  )
}

export const SettingsPage = (): JSX.Element => {
  const { theme, setTheme } = useTheme()
  const profile = useProfileStore((s) => s.profile)
  const updateBasicInfo = useProfileStore((s) => s.updateBasicInfo)
  const [saved, setSaved] = useState(false)
  const [form, setForm] = useState({
    first_name: profile.first_name,
    last_name: profile.last_name,
    headline: profile.headline,
    location: profile.location,
    email: profile.email,
    phone: profile.phone,
    pronouns: profile.pronouns,
  })

  function updateField<K extends keyof typeof form>(key: K, value: (typeof form)[K]): void {
    setSaved(false)
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function saveProfileInfo(): void {
    updateBasicInfo(form)
    setSaved(true)
  }

  function resetProfileInfo(): void {
    setForm({
      first_name: profile.first_name,
      last_name: profile.last_name,
      headline: profile.headline,
      location: profile.location,
      email: profile.email,
      phone: profile.phone,
      pronouns: profile.pronouns,
    })
    setSaved(false)
  }

  const menuItems = [
    { label: 'Account preferences', icon: <BadgeInfo className="h-4 w-4" /> },
    { label: 'Sign in & security', icon: <Lock className="h-4 w-4" /> },
    { label: 'Visibility', icon: <Eye className="h-4 w-4" /> },
    { label: 'Data privacy', icon: <Shield className="h-4 w-4" /> },
    { label: 'Advertising data', icon: <Database className="h-4 w-4" /> },
    { label: 'Notifications', icon: <Bell className="h-4 w-4" /> },
  ]

  return (
    <div className="grid gap-4 lg:grid-cols-12">
      <aside className="lg:col-span-3">
        <Card className="sticky top-[74px]">
          <Card.Body className="space-y-2 p-4">
            <h1 className="text-[30px] font-semibold leading-tight text-text-primary">Settings</h1>
            <div className="space-y-1 pt-2">
              {menuItems.map((item, index) => (
                <button
                  key={item.label}
                  type="button"
                  className={cn(
                    'flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm font-semibold transition',
                    index === 0 ? 'bg-success/10 text-success' : 'text-text-primary hover:bg-black/5',
                  )}
                >
                  <span className={cn(index === 0 ? 'text-success' : 'text-text-tertiary')}>{item.icon}</span>
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          </Card.Body>
        </Card>
      </aside>

      <main className="space-y-3 lg:col-span-9">
        <Card>
          <Card.Header>
            <h2 className="text-xl font-semibold text-text-primary">Profile information</h2>
            <p className="mt-1 text-sm text-text-secondary">Name, contact details, and headline</p>
          </Card.Header>
          <Card.Body className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <Input label="First name" value={form.first_name} onChange={(e) => updateField('first_name', e.target.value)} />
              <Input label="Last name" value={form.last_name} onChange={(e) => updateField('last_name', e.target.value)} />
            </div>
            <Input label="Headline" value={form.headline} onChange={(e) => updateField('headline', e.target.value)} />
            <div className="grid gap-3 md:grid-cols-2">
              <Input label="Location" value={form.location} onChange={(e) => updateField('location', e.target.value)} />
              <Input label="Pronouns" value={form.pronouns} onChange={(e) => updateField('pronouns', e.target.value)} />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <Input label="Email" type="email" value={form.email} onChange={(e) => updateField('email', e.target.value)} />
              <Input label="Phone" value={form.phone} onChange={(e) => updateField('phone', e.target.value)} />
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-3">
              {saved ? <span className="mr-auto text-xs font-semibold text-success">Profile information saved.</span> : null}
              <Button variant="tertiary" onClick={resetProfileInfo}>
                Reset
              </Button>
              <Button onClick={saveProfileInfo}>Save changes</Button>
            </div>
          </Card.Body>
        </Card>

        <Card>
          <Card.Header>
            <h2 className="text-xl font-semibold text-text-primary">Display</h2>
          </Card.Header>
          <Card.Body className="space-y-3">
            <p className="text-sm text-text-secondary">Dark mode</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setTheme('light')}
                className={cn(
                  'inline-flex items-center rounded-full border px-4 py-2 text-sm font-semibold transition',
                  theme === 'light'
                    ? 'border-brand-primary bg-brand-primary text-white'
                    : 'border-border bg-surface-raised text-text-primary hover:bg-black/5',
                )}
              >
                Light
              </button>
              <button
                type="button"
                onClick={() => setTheme('dark')}
                className={cn(
                  'inline-flex items-center rounded-full border px-4 py-2 text-sm font-semibold transition',
                  theme === 'dark'
                    ? 'border-brand-primary bg-brand-primary text-white'
                    : 'border-border bg-surface-raised text-text-primary hover:bg-black/5',
                )}
              >
                Dark
              </button>
            </div>
          </Card.Body>
        </Card>

        <Card>
          <Card.Header>
            <h2 className="text-xl font-semibold text-text-primary">General preferences</h2>
          </Card.Header>
          <Card.Body className="p-0">
            {[
              ['Language', 'English'],
              ['Content language', 'English'],
              ['Autoplay videos', 'On'],
              ['Sound effects', 'On'],
            ].map(([label, value]) => (
              <button
                key={label}
                type="button"
                className="flex w-full items-center justify-between border-t border-border px-4 py-3 text-left first:border-t-0 hover:bg-black/[0.03]"
              >
                <span className="text-sm font-medium text-text-primary">{label}</span>
                <span className="inline-flex items-center gap-2 text-sm text-text-secondary">
                  {value}
                  <ChevronRight className="h-4 w-4" />
                </span>
              </button>
            ))}
          </Card.Body>
        </Card>
      </main>
    </div>
  )
}
export const GroupsPage = (): JSX.Element => (
  <PlaceholderWithCreateHeader title="Groups" createLabel="Create a group" modalTitle="Create group" footer={({ onClose }) => (
    <>
      <Button variant="tertiary" onClick={onClose}>
        Cancel
      </Button>
      <button type="button" className={linkedInPrimaryDisabledClass} disabled>
        Create
      </button>
    </>
  )}
  >
    {() => <GroupsCreateForm />}
  </PlaceholderWithCreateHeader>
)
export const NewslettersPage = (): JSX.Element => (
  <PlaceholderWithCreateHeader
    title="Newsletters"
    createLabel="Create a newsletter"
    modalTitle="Create a newsletter"
    footer={({ onClose }) => (
      <>
        <Button variant="tertiary" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={onClose}>Done</Button>
      </>
    )}
  >
    {() => <NewslettersCreateForm />}
  </PlaceholderWithCreateHeader>
)
export const EventsPage = (): JSX.Element => (
  <PlaceholderWithCreateHeader title="Events" createLabel="Create an event" modalTitle="Create an event" footer={({ onClose }) => (
    <>
      <Button variant="tertiary" onClick={onClose}>
        Cancel
      </Button>
      <button type="button" className={linkedInPrimaryDisabledClass} disabled>
        Next
      </button>
    </>
  )}
  >
    {() => <EventsCreateForm />}
  </PlaceholderWithCreateHeader>
)
export const PremiumPage = (): JSX.Element => <Placeholder title="Premium" />
