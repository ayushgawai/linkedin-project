import { Bell, CircleHelp, MoreHorizontal, Repeat2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Avatar, Button, Card, ConfirmModal, Dropdown, Modal } from '../../components/ui'
import { useActionToast } from '../../hooks/useActionToast'
import { seedDemoData } from '../../lib/mockData'
import { useGroupsStore } from '../../store/groupsStore'
import { SUGGESTED_TECH_GROUPS } from './suggestedGroups'

function initials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('')
}

function buildGroupPosts(groupName: string): Array<{ id: string; author: string; role: string; content: string; when: string }> {
  const keyword = groupName.split(' ')[0] ?? 'Tech'
  return [
    {
      id: 'p1',
      author: 'Dheeraj Jain',
      role: 'Group owner',
      content: `Welcome to ${groupName}! Share your top ${keyword} learning resource this week and why it helped your team.`,
      when: '1h',
    },
    {
      id: 'p2',
      author: 'Sandeep Jain',
      role: 'Manager',
      content: `Open thread: What real-world architecture pattern have you recently applied in ${groupName}?`,
      when: '4h',
    },
    {
      id: 'p3',
      author: 'Community bot',
      role: 'Moderator',
      content: `Weekly prompt for ${groupName}: post one practical tip, one tool, and one challenge you are solving.`,
      when: '1d',
    },
  ]
}

export default function GroupProfilePage(): JSX.Element {
  const { groupId } = useParams<{ groupId: string }>()
  const toast = useActionToast()
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [shareMemberId, setShareMemberId] = useState('')
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const updateGroup = useGroupsStore((s) => s.updateGroup)
  const deleteGroup = useGroupsStore((s) => s.deleteGroup)
  const groupFromStore = useGroupsStore((s) => s.groups.find((g) => g.id === groupId))
  const shareCandidates = useMemo(() => seedDemoData().members.slice(0, 8), [])
  const fallbackSuggested = SUGGESTED_TECH_GROUPS.find((g) => g.id === groupId)
  const group = groupFromStore ?? (fallbackSuggested
    ? {
        id: fallbackSuggested.id,
        name: fallbackSuggested.name,
        description: fallbackSuggested.description,
        logoImage: fallbackSuggested.logoImage,
        memberCount: fallbackSuggested.members,
      }
    : null)

  if (!group) {
    return (
      <Card>
        <Card.Body>
          <p className="text-sm text-text-secondary">Group not found. Go back to <Link className="text-brand-primary" to="/groups">groups</Link>.</p>
        </Card.Body>
      </Card>
    )
  }

  const groupSnapshot = group
  const posts = buildGroupPosts(groupSnapshot.name)

  function openEdit(): void {
    setEditName(groupSnapshot.name)
    setEditDescription(groupSnapshot.description)
    setEditOpen(true)
  }

  function saveEdit(): void {
    if (!groupId || !editName.trim() || !editDescription.trim()) return
    if (!groupFromStore) {
      toast.show({ icon: 'info', message: 'Suggested group details are read-only' })
      setEditOpen(false)
      return
    }
    updateGroup(groupId, { name: editName.trim(), description: editDescription.trim() })
    setEditOpen(false)
    toast.show({ icon: 'success', message: 'Group updated successfully' })
  }

  function confirmDelete(): void {
    if (!groupId) return
    if (!groupFromStore) {
      toast.show({ icon: 'info', message: 'Suggested group cannot be deleted here' })
      setDeleteOpen(false)
      return
    }
    deleteGroup(groupId)
    setDeleteOpen(false)
    toast.show({ icon: 'success', message: 'Group deleted successfully' })
    window.location.assign('/groups')
  }

  function sendShare(): void {
    if (!shareMemberId) return
    const recipient = shareCandidates.find((m) => m.member_id === shareMemberId)
    toast.messageSent(recipient?.full_name ?? 'connection')
    toast.show({ icon: 'message', message: `Shared "${groupSnapshot.name}"`, linkText: 'Open messaging', linkTo: '/messaging' })
    setShareMemberId('')
    setShareOpen(false)
  }

  return (
    <div className="space-y-4 pb-8">
      <Card>
        <div className="h-28 rounded-t-lg bg-gradient-to-r from-slate-900 via-slate-700 to-slate-800" />
        <Card.Body className="relative pt-0">
          <div className="-mt-8 flex items-end justify-between">
            <div className="flex items-end gap-3">
              <div className="h-20 w-20 overflow-hidden rounded border-2 border-white bg-success text-center leading-[80px] font-bold text-white">
                {group.logoImage ? <img src={group.logoImage} alt={group.name} className="h-full w-full object-cover" /> : initials(group.name)}
              </div>
              <div className="pb-1">
                <h1 className="text-4 font-semibold text-text-primary">{group.name}</h1>
                <p className="text-sm text-text-secondary">{group.memberCount.toLocaleString()} members</p>
              </div>
            </div>
            <div className="flex items-center gap-2 pb-1">
              <button type="button" className="rounded-full p-2 hover:bg-black/5"><CircleHelp className="h-4 w-4" /></button>
              <button type="button" className="rounded-full p-2 hover:bg-black/5"><Repeat2 className="h-4 w-4" /></button>
              <button type="button" className="rounded-full p-2 hover:bg-black/5"><Bell className="h-4 w-4" /></button>
              <Dropdown.Root>
                <Dropdown.Trigger showEndChevron={false} className="h-8 w-8 rounded-full p-0 hover:bg-black/5">
                  <MoreHorizontal className="h-4 w-4" />
                </Dropdown.Trigger>
                <Dropdown.Content>
                  <Dropdown.Item onSelect={openEdit}>Edit</Dropdown.Item>
                  <Dropdown.Item onSelect={() => setDeleteOpen(true)}>Delete</Dropdown.Item>
                  <Dropdown.Item onSelect={() => setShareOpen(true)}>Share</Dropdown.Item>
                </Dropdown.Content>
              </Dropdown.Root>
            </div>
          </div>
          <p className="mt-3 text-sm text-text-secondary">{group.description}</p>
        </Card.Body>
      </Card>

      <Card>
        <Card.Body>
          <div className="flex items-center gap-3">
            <Avatar name={group.name} src={group.logoImage} />
            <button type="button" className="flex-1 rounded-full border border-border px-4 py-2 text-left text-sm text-text-secondary">
              Start a post in this group
            </button>
          </div>
          <div className="mt-3 flex items-center gap-2 text-sm">
            <Button variant="tertiary" size="sm">Video</Button>
            <Button variant="tertiary" size="sm">Photo</Button>
            <Button variant="tertiary" size="sm">Poll</Button>
          </div>
        </Card.Body>
      </Card>

      <Card>
        <Card.Header><h2 className="text-lg font-semibold text-text-primary">Recent posts</h2></Card.Header>
        <Card.Body className="space-y-3">
          {posts.map((post) => (
            <article key={post.id} className="rounded-md border border-border p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-text-primary">{post.author}</p>
                  <p className="text-xs text-text-secondary">{post.role} · {post.when}</p>
                </div>
              </div>
              <p className="mt-2 text-sm text-text-primary">{post.content}</p>
            </article>
          ))}
        </Card.Body>
      </Card>

      <Modal isOpen={editOpen} onClose={() => setEditOpen(false)} title="Edit group" size="md">
        <Modal.Header><span className="text-lg font-semibold">Edit group</span></Modal.Header>
        <Modal.Body className="space-y-3">
          <div>
            <label className="mb-1 block text-sm text-text-secondary">Group name*</label>
            <input className="w-full rounded-md border border-black px-3 py-2.5 text-sm" value={editName} onChange={(e) => setEditName(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-sm text-text-secondary">Description*</label>
            <textarea className="min-h-[120px] w-full resize-y rounded-md border border-black px-3 py-2.5 text-sm" value={editDescription} onChange={(e) => setEditDescription(e.target.value)} />
          </div>
        </Modal.Body>
        <Modal.Footer>
          <button type="button" className="rounded-full border border-border px-4 py-1.5 text-sm font-semibold" onClick={() => setEditOpen(false)}>Cancel</button>
          <button type="button" className="rounded-full bg-brand-primary px-5 py-1.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400" disabled={!editName.trim() || !editDescription.trim()} onClick={saveEdit}>Save</button>
        </Modal.Footer>
      </Modal>

      <ConfirmModal
        isOpen={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete group"
        message={`Are you sure you want to delete "${group.name}"?`}
        confirmLabel="Delete"
        confirmVariant="destructive"
        onConfirm={confirmDelete}
      />

      <Modal isOpen={shareOpen} onClose={() => { setShareOpen(false); setShareMemberId('') }} title="Share group" size="md">
        <Modal.Header><span className="text-lg font-semibold">Share group</span></Modal.Header>
        <Modal.Body className="space-y-3">
          <p className="text-sm text-text-secondary">Send <span className="font-semibold text-text-primary">{group.name}</span> to a friend.</p>
          <div>
            <label className="mb-1 block text-sm text-text-secondary">Select friend*</label>
            <select className="w-full rounded-md border border-black px-3 py-2.5 text-sm" value={shareMemberId} onChange={(e) => setShareMemberId(e.target.value)}>
              <option value="">Select</option>
              {shareCandidates.map((member) => (
                <option key={member.member_id} value={member.member_id}>
                  {member.full_name} — {member.headline}
                </option>
              ))}
            </select>
          </div>
        </Modal.Body>
        <Modal.Footer>
          <button type="button" className="rounded-full border border-border px-4 py-1.5 text-sm font-semibold" onClick={() => { setShareOpen(false); setShareMemberId('') }}>Cancel</button>
          <button type="button" className="rounded-full bg-brand-primary px-5 py-1.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400" disabled={!shareMemberId} onClick={sendShare}>Send message</button>
        </Modal.Footer>
      </Modal>
    </div>
  )
}
