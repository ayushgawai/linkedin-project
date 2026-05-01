import { MoreHorizontal } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Dropdown } from '../../components/ui'
import type { Group } from '../../types/group'

function initials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('')
}

type GroupCardProps = {
  group: Group
  onEdit: (group: Group) => void
  onDelete: (group: Group) => void
  onShare: (group: Group) => void
}

export function GroupCard({ group, onEdit, onDelete, onShare }: GroupCardProps): JSX.Element {
  return (
    <article className="flex items-start gap-3 border-b border-border py-4 last:border-b-0">
      <Link to={`/groups/${group.id}`} className="mt-0.5 h-14 w-14 shrink-0 overflow-hidden rounded bg-success text-center leading-[56px] font-bold text-white">
        {group.logoImage ? <img src={group.logoImage} alt={group.name} className="h-full w-full object-cover" /> : initials(group.name)}
      </Link>
      <div className="min-w-0 flex-1">
        <h3 className="line-clamp-2 text-base font-semibold leading-tight text-text-primary">
          <Link to={`/groups/${group.id}`} className="hover:underline">
            {group.name}
          </Link>
        </h3>
        <p className="text-sm text-text-secondary">{group.memberCount.toLocaleString()} members</p>
      </div>
      <Dropdown.Root>
        <Dropdown.Trigger showEndChevron={false} className="h-8 w-8 rounded-full p-0">
          <MoreHorizontal className="h-4 w-4" />
        </Dropdown.Trigger>
        <Dropdown.Content>
          <Dropdown.Item onSelect={() => onEdit(group)}>Edit</Dropdown.Item>
          <Dropdown.Item onSelect={() => onDelete(group)}>Delete</Dropdown.Item>
          <Dropdown.Item onSelect={() => onShare(group)}>Share</Dropdown.Item>
        </Dropdown.Content>
      </Dropdown.Root>
    </article>
  )
}
