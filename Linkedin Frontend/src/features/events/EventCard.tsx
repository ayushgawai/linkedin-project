import { MoreHorizontal } from 'lucide-react'
import { Dropdown } from '../../components/ui'
import type { Event } from '../../types/event'

type EventCardProps = {
  event: Event
  onEdit: (event: Event) => void
  onDelete: (event: Event) => void
  onShare: (event: Event) => void
}

export function EventCard({ event, onEdit, onDelete, onShare }: EventCardProps): JSX.Element {
  return (
    <article className="flex items-start gap-3 border-b border-border py-4 last:border-b-0">
      <div className="h-20 w-20 shrink-0 overflow-hidden rounded bg-surface">
        {event.coverImage ? (
          <img src={event.coverImage} alt={event.eventName} className="h-full w-full object-cover" />
        ) : (
          <div className="h-full w-full bg-surface" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="cursor-pointer truncate text-base font-semibold text-text-primary hover:underline">{event.eventName}</h3>
        <p className="text-sm text-text-secondary">
          {event.eventFormat} · {event.eventType === 'online' ? 'Online' : 'In person'}
        </p>
        <p className="text-sm text-text-secondary">
          {new Date(event.startDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} · {event.startTime}
        </p>
        <p className="text-sm text-text-tertiary">{event.attendees.length} attendees</p>
      </div>
      <Dropdown.Root>
        <Dropdown.Trigger showEndChevron={false} className="h-8 w-8 rounded-full p-0">
          <MoreHorizontal className="h-4 w-4" />
        </Dropdown.Trigger>
        <Dropdown.Content>
          <Dropdown.Item onSelect={() => onEdit(event)}>Edit</Dropdown.Item>
          <Dropdown.Item onSelect={() => onDelete(event)}>Delete</Dropdown.Item>
          <Dropdown.Item onSelect={() => onShare(event)}>Share</Dropdown.Item>
        </Dropdown.Content>
      </Dropdown.Root>
    </article>
  )
}
