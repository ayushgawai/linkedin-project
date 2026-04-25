import { MoreHorizontal } from 'lucide-react'
import { Avatar, Dropdown } from '../../components/ui'
import type { Newsletter } from '../../types/newsletter'

type NewsletterCardProps = {
  newsletter: Newsletter
  onEdit: (newsletter: Newsletter) => void
  onDelete: (newsletter: Newsletter) => void
  onShare: (newsletter: Newsletter) => void
}

export function NewsletterCard({ newsletter, onEdit, onDelete, onShare }: NewsletterCardProps): JSX.Element {
  return (
    <article className="flex items-start gap-3 border-b border-border py-4 last:border-b-0">
      <div className="h-14 w-14 shrink-0 overflow-hidden rounded bg-surface">
        {newsletter.logoImage ? <img src={newsletter.logoImage} alt={newsletter.title} className="h-full w-full object-cover" /> : null}
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="cursor-pointer text-base font-semibold text-text-primary hover:underline">{newsletter.title}</h3>
        <p className="line-clamp-2 text-sm text-text-secondary">{newsletter.description}</p>
        {newsletter.createdBy !== 'editorial' ? (
          <div className="mt-1 flex items-center gap-2">
            <Avatar size="sm" name={newsletter.createdByName} src={newsletter.createdByAvatar} />
            <p className="text-sm font-semibold">{newsletter.createdByName}</p>
            <p className="line-clamp-1 text-xs text-text-tertiary">{newsletter.createdByHeadline}</p>
          </div>
        ) : null}
      </div>
      <Dropdown.Root>
        <Dropdown.Trigger showEndChevron={false} className="h-8 w-8 rounded-full p-0">
          <MoreHorizontal className="h-4 w-4" />
        </Dropdown.Trigger>
        <Dropdown.Content>
          <Dropdown.Item onSelect={() => onEdit(newsletter)}>Edit</Dropdown.Item>
          <Dropdown.Item onSelect={() => onDelete(newsletter)}>Delete</Dropdown.Item>
          <Dropdown.Item onSelect={() => onShare(newsletter)}>Share</Dropdown.Item>
        </Dropdown.Content>
      </Dropdown.Root>
    </article>
  )
}
