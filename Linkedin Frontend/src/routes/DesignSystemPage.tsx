import { Bell, BriefcaseBusiness, Home, Search } from 'lucide-react'
import { useState } from 'react'
import {
  Avatar,
  Badge,
  Button,
  Card,
  Divider,
  Dropdown,
  EmptyState,
  IconButton,
  Input,
  Modal,
  Select,
  Skeleton,
  Spinner,
  Tabs,
  Textarea,
  Tooltip,
  useToast,
} from '../components/ui'

const selectOptions = [
  { value: 'all', label: 'All jobs' },
  { value: 'frontend', label: 'Frontend' },
  { value: 'backend', label: 'Backend' },
]

const sections = [
  'Buttons',
  'Inputs',
  'Selects',
  'Cards',
  'Avatars & Badges',
  'Modal',
  'Dropdown',
  'Tabs',
  'Skeleton',
  'Toast',
  'Tooltip',
  'Empty State',
  'Divider',
  'Spinner',
]

export default function DesignSystemPage(): JSX.Element {
  const [modalOpen, setModalOpen] = useState(false)
  const { toast } = useToast()

  return (
    <div className="mx-auto flex max-w-7xl gap-6 px-6 py-8">
      <aside className="sticky top-4 hidden h-fit w-64 rounded-lg border border-border bg-surface-raised p-4 lg:block">
        <h2 className="mb-3 text-sm font-semibold text-text-primary">Components</h2>
        <nav className="space-y-1 text-sm">
          {sections.map((section) => (
            <a key={section} href={`#${section.toLowerCase().replace(/\s+/g, '-')}`} className="block rounded px-2 py-1 text-text-secondary hover:bg-black/5 hover:text-text-primary">
              {section}
            </a>
          ))}
        </nav>
      </aside>

      <main className="min-w-0 flex-1 space-y-6">
        <header>
          <h1 className="text-2xl font-semibold text-text-primary">Design System</h1>
          <p className="text-sm text-text-secondary">Reference showcase for LinkedIn Clone UI primitives.</p>
        </header>

        <Card>
          <Card.Body className="grid gap-4" id="buttons">
            <h2 className="text-lg font-semibold">Buttons</h2>
            <div className="flex flex-wrap gap-2">
              <Button>Primary</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="tertiary">Tertiary</Button>
              <Button variant="destructive">Destructive</Button>
              <Button loading>Loading</Button>
              <Button leftIcon={<Search className="h-4 w-4" />} rightIcon={<BriefcaseBusiness className="h-4 w-4" />}>With Icons</Button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <IconButton label="Home" icon={<Home className="h-5 w-5" />} />
              <IconButton label="Search" icon={<Search className="h-5 w-5" />} size="md" />
              <IconButton label="Notifications" icon={<Bell className="h-5 w-5" />} size="lg" />
            </div>
          </Card.Body>
        </Card>

        <Card>
          <Card.Body className="space-y-3" id="inputs">
            <h2 className="text-lg font-semibold">Inputs</h2>
            <Input label="Email" helperText="Use your academic email" leftIcon={<Search className="h-4 w-4" />} />
            <Input label="Required field" error="This field is required" />
            <Textarea label="Summary" helperText="Write a concise profile summary" autoResize />
          </Card.Body>
        </Card>

        <Card>
          <Card.Body className="space-y-3" id="selects">
            <h2 className="text-lg font-semibold">Selects</h2>
            <Select options={selectOptions} variant="native" />
            <Select options={selectOptions} variant="custom" />
          </Card.Body>
        </Card>

        <Card variant="raised" id="cards">
          <Card.Header>
            <h2 className="text-lg font-semibold">Cards</h2>
          </Card.Header>
          <Card.Divider />
          <Card.Body>
            Cards support default, raised, and flat variants with structured subcomponents.
          </Card.Body>
          <Card.Footer className="text-sm text-text-secondary">Footer content</Card.Footer>
        </Card>

        <Card>
          <Card.Body className="space-y-3" id="avatars-&-badges">
            <h2 className="text-lg font-semibold">Avatars & Badges</h2>
            <div className="flex flex-wrap items-end gap-3">
              <Avatar size="xs" name="Manav Patel" online />
              <Avatar size="sm" name="Manav Patel" />
              <Avatar size="md" name="Manav Patel" online />
              <Avatar size="lg" name="Manav Patel" />
              <Avatar size="xl" name="Manav Patel" />
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge>Default</Badge>
              <Badge variant="brand">Brand</Badge>
              <Badge variant="success">Success</Badge>
              <Badge variant="danger">Danger</Badge>
              <Badge variant="neutral">Neutral</Badge>
            </div>
          </Card.Body>
        </Card>

        <Card>
          <Card.Body className="space-y-3" id="modal">
            <h2 className="text-lg font-semibold">Modal</h2>
            <Button onClick={() => setModalOpen(true)}>Open modal</Button>
            <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="Confirm action" size="md">
              <Modal.Header>Confirm action</Modal.Header>
              <Modal.Body>Review and confirm your update before continuing.</Modal.Body>
              <Modal.Footer>
                <Button variant="tertiary" onClick={() => setModalOpen(false)}>Cancel</Button>
                <Button onClick={() => setModalOpen(false)}>Confirm</Button>
              </Modal.Footer>
            </Modal>
          </Card.Body>
        </Card>

        <Card>
          <Card.Body className="space-y-3" id="dropdown">
            <h2 className="text-lg font-semibold">Dropdown</h2>
            <Dropdown.Root>
              <Dropdown.Trigger>Actions</Dropdown.Trigger>
              <Dropdown.Content>
                <Dropdown.Item onSelect={() => toast({ title: 'Saved', variant: 'success' })}>Save draft</Dropdown.Item>
                <Dropdown.Item onSelect={() => toast({ title: 'Shared', variant: 'info' })}>Share profile</Dropdown.Item>
              </Dropdown.Content>
            </Dropdown.Root>
          </Card.Body>
        </Card>

        <Card>
          <Card.Body id="tabs">
            <h2 className="mb-2 text-lg font-semibold">Tabs</h2>
            <Tabs.Root defaultValue="overview">
              <Tabs.List>
                <Tabs.Trigger value="overview">Overview</Tabs.Trigger>
                <Tabs.Trigger value="activity">Activity</Tabs.Trigger>
              </Tabs.List>
              <Tabs.Content value="overview">Overview tab content.</Tabs.Content>
              <Tabs.Content value="activity">Activity tab content.</Tabs.Content>
            </Tabs.Root>
          </Card.Body>
        </Card>

        <Card>
          <Card.Body className="space-y-3" id="skeleton">
            <h2 className="text-lg font-semibold">Skeleton</h2>
            <Skeleton variant="text" className="max-w-xs" />
            <Skeleton variant="circle" />
            <Skeleton variant="rect" />
          </Card.Body>
        </Card>

        <Card>
          <Card.Body className="space-y-3" id="toast">
            <h2 className="text-lg font-semibold">Toast</h2>
            <div className="flex gap-2">
              <Button onClick={() => toast({ title: 'Saved successfully', variant: 'success' })}>Success</Button>
              <Button variant="secondary" onClick={() => toast({ title: 'Network issue', variant: 'error' })}>Error</Button>
              <Button variant="tertiary" onClick={() => toast({ title: 'Heads up', variant: 'info' })}>Info</Button>
            </div>
          </Card.Body>
        </Card>

        <Card>
          <Card.Body className="space-y-3" id="tooltip">
            <h2 className="text-lg font-semibold">Tooltip</h2>
            <Tooltip content="Search opportunities">
              <Button variant="secondary">Hover me</Button>
            </Tooltip>
          </Card.Body>
        </Card>

        <Card>
          <Card.Body className="space-y-3" id="empty-state">
            <h2 className="text-lg font-semibold">Empty State</h2>
            <EmptyState title="No notifications yet" description="When new activity happens, you'll see it here." actionLabel="Refresh" onAction={() => toast({ title: 'Refreshing...', variant: 'info' })} />
          </Card.Body>
        </Card>

        <Card>
          <Card.Body className="space-y-3" id="divider">
            <h2 className="text-lg font-semibold">Divider</h2>
            <Divider />
            <Divider label="or" />
          </Card.Body>
        </Card>

        <Card>
          <Card.Body className="space-y-3" id="spinner">
            <h2 className="text-lg font-semibold">Spinner</h2>
            <div className="flex items-center gap-4 text-brand-primary">
              <Spinner size="sm" />
              <Spinner size="md" />
              <Spinner size="lg" />
            </div>
          </Card.Body>
        </Card>
      </main>
    </div>
  )
}
