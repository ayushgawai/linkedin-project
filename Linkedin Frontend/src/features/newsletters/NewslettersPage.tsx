import { Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Card, ConfirmModal, Modal } from '../../components/ui'
import { useActionToast } from '../../hooks/useActionToast'
import { seedDemoData } from '../../lib/mockData'
import { useAuthStore } from '../../store/authStore'
import { useNewslettersStore } from '../../store/newslettersStore'
import type { Newsletter } from '../../types/newsletter'
import { CreateNewsletterModal } from './CreateNewsletterModal'
import { NewsletterCard } from './NewsletterCard'

export default function NewslettersPage(): JSX.Element {
  const [open, setOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [editNewsletter, setEditNewsletter] = useState<Newsletter | null>(null)
  const [deleteNewsletterState, setDeleteNewsletterState] = useState<Newsletter | null>(null)
  const [shareNewsletter, setShareNewsletter] = useState<Newsletter | null>(null)
  const [shareMemberId, setShareMemberId] = useState('')
  const [editTitle, setEditTitle] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const { newsletters, addNewsletter, updateNewsletter, deleteNewsletter } = useNewslettersStore()
  const user = useAuthStore((s) => s.user)
  const toast = useActionToast()
  const shareCandidates = useMemo(() => seedDemoData().members.slice(0, 8), [])

  const list = useMemo(
    () => newsletters.filter((item) => item.id !== 'nl-1'),
    [newsletters],
  )
  const filteredList = useMemo(
    () => list.filter((item) => item.title.toLowerCase().includes(searchTerm.toLowerCase())),
    [list, searchTerm],
  )

  function create(payload: Omit<Newsletter, 'id' | 'createdAt' | 'subscriberCount'>): void {
    addNewsletter({
      ...payload,
      createdBy: user?.member_id ?? payload.createdBy,
      createdByName: user?.full_name ?? payload.createdByName,
      createdByHeadline: user?.headline ?? payload.createdByHeadline,
      createdByAvatar: user?.profile_photo_url ?? undefined,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      subscriberCount: 0,
    })
    toast.show({ icon: 'success', message: 'Newsletter created successfully' })
  }

  function openEdit(newsletter: Newsletter): void {
    setEditNewsletter(newsletter)
    setEditTitle(newsletter.title)
    setEditDescription(newsletter.description)
  }

  function saveEdit(): void {
    if (!editNewsletter || !editTitle.trim() || !editDescription.trim()) return
    updateNewsletter(editNewsletter.id, { title: editTitle.trim(), description: editDescription.trim() })
    setEditNewsletter(null)
    toast.show({ icon: 'success', message: 'Newsletter updated successfully' })
  }

  function confirmDelete(): void {
    if (!deleteNewsletterState) return
    deleteNewsletter(deleteNewsletterState.id)
    setDeleteNewsletterState(null)
    toast.show({ icon: 'success', message: 'Newsletter deleted successfully' })
  }

  function sendShare(): void {
    if (!shareNewsletter || !shareMemberId) return
    const recipient = shareCandidates.find((m) => m.member_id === shareMemberId)
    toast.messageSent(recipient?.full_name ?? 'connection')
    toast.show({ icon: 'message', message: `Shared "${shareNewsletter.title}"`, linkText: 'Open messaging', linkTo: '/messaging' })
    setShareNewsletter(null)
    setShareMemberId('')
  }

  return (
    <div className="space-y-4 pb-8">
      <Card>
        <Card.Header className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-text-primary">Newsletters</h1>
            <p className="mt-1 text-sm text-text-secondary">{list.length} newsletters</p>
          </div>
          <button type="button" className="inline-flex items-center gap-1 rounded-full border border-brand-primary px-4 py-1.5 text-sm font-semibold text-brand-primary" onClick={() => setOpen(true)}>
            Create newsletter <Plus className="h-4 w-4" />
          </button>
        </Card.Header>
        <Card.Body className="pt-1">
          <div className="mb-3">
            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-md border border-black px-3 py-2.5 text-sm text-text-primary"
              placeholder="Search newsletters"
            />
          </div>
          {filteredList.length > 0 ? filteredList.map((newsletter) => (
            <NewsletterCard
              key={newsletter.id}
              newsletter={newsletter}
              onEdit={openEdit}
              onDelete={(selected) => setDeleteNewsletterState(selected)}
              onShare={(selected) => setShareNewsletter(selected)}
            />
          )) : <p className="py-4 text-center text-sm text-text-secondary">No newsletters found for "{searchTerm}".</p>}
        </Card.Body>
      </Card>
      <CreateNewsletterModal open={open} onClose={() => setOpen(false)} onCreate={create} />

      <Modal isOpen={editNewsletter != null} onClose={() => setEditNewsletter(null)} title="Edit newsletter" size="md">
        <Modal.Header><span className="text-lg font-semibold">Edit newsletter</span></Modal.Header>
        <Modal.Body className="space-y-3">
          <div>
            <label className="mb-1 block text-sm text-text-secondary">Title*</label>
            <input className="w-full rounded-md border border-black px-3 py-2.5 text-sm" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-sm text-text-secondary">Description*</label>
            <textarea className="min-h-[120px] w-full resize-y rounded-md border border-black px-3 py-2.5 text-sm" value={editDescription} onChange={(e) => setEditDescription(e.target.value)} />
          </div>
        </Modal.Body>
        <Modal.Footer>
          <button type="button" className="rounded-full border border-border px-4 py-1.5 text-sm font-semibold" onClick={() => setEditNewsletter(null)}>Cancel</button>
          <button type="button" className="rounded-full bg-brand-primary px-5 py-1.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400" disabled={!editTitle.trim() || !editDescription.trim()} onClick={saveEdit}>Save</button>
        </Modal.Footer>
      </Modal>

      <ConfirmModal
        isOpen={deleteNewsletterState != null}
        onClose={() => setDeleteNewsletterState(null)}
        title="Delete newsletter"
        message={`Are you sure you want to delete "${deleteNewsletterState?.title ?? 'this newsletter'}"?`}
        confirmLabel="Delete"
        confirmVariant="destructive"
        onConfirm={confirmDelete}
      />

      <Modal isOpen={shareNewsletter != null} onClose={() => { setShareNewsletter(null); setShareMemberId('') }} title="Share newsletter" size="md">
        <Modal.Header><span className="text-lg font-semibold">Share newsletter</span></Modal.Header>
        <Modal.Body className="space-y-3">
          <p className="text-sm text-text-secondary">Send <span className="font-semibold text-text-primary">{shareNewsletter?.title}</span> to a friend.</p>
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
          <button type="button" className="rounded-full border border-border px-4 py-1.5 text-sm font-semibold" onClick={() => { setShareNewsletter(null); setShareMemberId('') }}>Cancel</button>
          <button type="button" className="rounded-full bg-brand-primary px-5 py-1.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400" disabled={!shareMemberId} onClick={sendShare}>Send message</button>
        </Modal.Footer>
      </Modal>
    </div>
  )
}
