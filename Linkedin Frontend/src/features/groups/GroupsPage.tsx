import { Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Card, ConfirmModal, Modal } from '../../components/ui'
import { useActionToast } from '../../hooks/useActionToast'
import { seedDemoData } from '../../lib/mockData'
import { useAuthStore } from '../../store/authStore'
import { useGroupsStore } from '../../store/groupsStore'
import type { Group } from '../../types/group'
import { CreateGroupModal } from './CreateGroupModal'
import { GroupCard } from './GroupCard'

export default function GroupsPage(): JSX.Element {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<'your' | 'requested'>('your')
  const [searchTerm, setSearchTerm] = useState('')
  const [editGroup, setEditGroup] = useState<Group | null>(null)
  const [deleteGroupState, setDeleteGroupState] = useState<Group | null>(null)
  const [shareGroup, setShareGroup] = useState<Group | null>(null)
  const [shareMemberId, setShareMemberId] = useState('')
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const { groups, addGroup, updateGroup, deleteGroup } = useGroupsStore()
  const user = useAuthStore((s) => s.user)
  const toast = useActionToast()
  const shareCandidates = useMemo(() => seedDemoData().members.slice(0, 8), [])

  function create(payload: Omit<Group, 'id' | 'createdAt' | 'createdBy' | 'members' | 'memberCount'>): void {
    addGroup({
      ...payload,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      createdBy: user?.member_id ?? 'demo-member',
      members: [user?.member_id ?? 'demo-member'],
      memberCount: 1,
    })
    toast.show({ icon: 'success', message: 'Group created successfully' })
  }

  const filteredGroups = useMemo(
    () => groups.filter((group) => group.name.toLowerCase().includes(searchTerm.toLowerCase())),
    [groups, searchTerm],
  )

  function openEdit(group: Group): void {
    setEditGroup(group)
    setEditName(group.name)
    setEditDescription(group.description)
  }

  function saveEdit(): void {
    if (!editGroup || !editName.trim() || !editDescription.trim()) return
    updateGroup(editGroup.id, { name: editName.trim(), description: editDescription.trim() })
    setEditGroup(null)
    toast.show({ icon: 'success', message: 'Group updated successfully' })
  }

  function confirmDelete(): void {
    if (!deleteGroupState) return
    deleteGroup(deleteGroupState.id)
    setDeleteGroupState(null)
    toast.show({ icon: 'success', message: 'Group deleted successfully' })
  }

  function sendShare(): void {
    if (!shareGroup || !shareMemberId) return
    const recipient = shareCandidates.find((m) => m.member_id === shareMemberId)
    toast.messageSent(recipient?.full_name ?? 'connection')
    toast.show({ icon: 'message', message: `Shared "${shareGroup.name}"`, linkText: 'Open messaging', linkTo: '/messaging' })
    setShareGroup(null)
    setShareMemberId('')
  }

  return (
    <div className="space-y-4 pb-8">
      <Card>
        <Card.Header className="flex items-end justify-between">
          <div className="flex gap-4 border-b border-border">
            <button type="button" className={`-mb-px pb-2 text-sm ${tab === 'your' ? 'border-b-2 border-success font-semibold text-success' : 'text-text-secondary'}`} onClick={() => setTab('your')}>Your groups</button>
            <button type="button" className={`-mb-px pb-2 text-sm ${tab === 'requested' ? 'border-b-2 border-success font-semibold text-success' : 'text-text-secondary'}`} onClick={() => setTab('requested')}>Requested</button>
          </div>
          <button type="button" className="inline-flex items-center gap-1 rounded-full border border-brand-primary px-4 py-1.5 text-sm font-semibold text-brand-primary" onClick={() => setOpen(true)}>
            Create group <Plus className="h-4 w-4" />
          </button>
        </Card.Header>
        <Card.Body className="pt-1">
          <div className="mb-3">
            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-md border border-black px-3 py-2.5 text-sm text-text-primary"
              placeholder="Search groups"
            />
          </div>
          {filteredGroups.length > 0
            ? filteredGroups.map((group) => (
                <GroupCard
                  key={group.id}
                  group={group}
                  onEdit={openEdit}
                  onDelete={(selected) => setDeleteGroupState(selected)}
                  onShare={(selected) => setShareGroup(selected)}
                />
              ))
            : <p className="py-4 text-center text-sm text-text-secondary">No groups found for "{searchTerm}".</p>}
          <p className="py-4 text-center text-sm text-text-secondary">
            Search other trusted communities that share and support your goals.{' '}
            <a href="#" className="font-semibold text-brand-primary">Search</a>
          </p>
        </Card.Body>
      </Card>
      <CreateGroupModal open={open} onClose={() => setOpen(false)} onCreate={create} />

      <Modal isOpen={editGroup != null} onClose={() => setEditGroup(null)} title="Edit group" size="md">
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
          <button type="button" className="rounded-full border border-border px-4 py-1.5 text-sm font-semibold" onClick={() => setEditGroup(null)}>Cancel</button>
          <button type="button" className="rounded-full bg-brand-primary px-5 py-1.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400" disabled={!editName.trim() || !editDescription.trim()} onClick={saveEdit}>Save</button>
        </Modal.Footer>
      </Modal>

      <ConfirmModal
        isOpen={deleteGroupState != null}
        onClose={() => setDeleteGroupState(null)}
        title="Delete group"
        message={`Are you sure you want to delete "${deleteGroupState?.name ?? 'this group'}"?`}
        confirmLabel="Delete"
        confirmVariant="destructive"
        onConfirm={confirmDelete}
      />

      <Modal isOpen={shareGroup != null} onClose={() => { setShareGroup(null); setShareMemberId('') }} title="Share group" size="md">
        <Modal.Header><span className="text-lg font-semibold">Share group</span></Modal.Header>
        <Modal.Body className="space-y-3">
          <p className="text-sm text-text-secondary">Send <span className="font-semibold text-text-primary">{shareGroup?.name}</span> to a friend.</p>
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
          <button type="button" className="rounded-full border border-border px-4 py-1.5 text-sm font-semibold" onClick={() => { setShareGroup(null); setShareMemberId('') }}>Cancel</button>
          <button type="button" className="rounded-full bg-brand-primary px-5 py-1.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400" disabled={!shareMemberId} onClick={sendShare}>Send message</button>
        </Modal.Footer>
      </Modal>
    </div>
  )
}
