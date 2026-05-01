import { CalendarDays, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Card, ConfirmModal, EmptyState, Modal } from '../../components/ui'
import { useActionToast } from '../../hooks/useActionToast'
import { handleImageUpload } from '../../lib/imageUpload'
import { seedDemoData } from '../../lib/mockData'
import { useAuthStore } from '../../store/authStore'
import { useEventsStore } from '../../store/eventsStore'
import type { Event } from '../../types/event'
import { RailFooter } from '../../components/layout/RailFooter'
import { CreateEventModal } from './CreateEventModal'
import { EventCard } from './EventCard'

export default function EventsPage(): JSX.Element {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState('your')
  const [editEvent, setEditEvent] = useState<Event | null>(null)
  const [deleteEventState, setDeleteEventState] = useState<Event | null>(null)
  const [shareEvent, setShareEvent] = useState<Event | null>(null)
  const [shareMemberId, setShareMemberId] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [editName, setEditName] = useState('')
  const [editFormat, setEditFormat] = useState('')
  const [editDate, setEditDate] = useState('')
  const [editTime, setEditTime] = useState('')
  const [editCoverImage, setEditCoverImage] = useState('')
  const actionToast = useActionToast()
  const user = useAuthStore((s) => s.user)
  const { events, addEvent, updateEvent, deleteEvent } = useEventsStore()
  const shareCandidates = useMemo(() => seedDemoData().members.slice(0, 8), [])
  const filteredEvents = useMemo(
    () => events.filter((event) => event.eventName.toLowerCase().includes(searchTerm.toLowerCase())),
    [events, searchTerm],
  )

  function create(payload: Omit<Event, 'id' | 'createdAt' | 'createdBy' | 'attendees'>): void {
    addEvent({
      ...payload,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      createdBy: user?.member_id ?? 'demo-member',
      attendees: [user?.member_id ?? 'demo-member'],
    })
    actionToast.show({ icon: 'success', message: 'Event created successfully' })
  }

  function openEdit(event: Event): void {
    setEditEvent(event)
    setEditName(event.eventName)
    setEditFormat(event.eventFormat)
    setEditDate(event.startDate)
    setEditTime(event.startTime)
    setEditCoverImage(event.coverImage ?? '')
  }

  function saveEdit(): void {
    if (!editEvent || !editName.trim() || !editFormat.trim()) return
    updateEvent(editEvent.id, {
      eventName: editName.trim(),
      eventFormat: editFormat.trim(),
      startDate: editDate || editEvent.startDate,
      startTime: editTime || editEvent.startTime,
      coverImage: editCoverImage || undefined,
    })
    setEditEvent(null)
    actionToast.show({ icon: 'success', message: 'Event updated successfully' })
  }

  function confirmDelete(): void {
    if (!deleteEventState) return
    deleteEvent(deleteEventState.id)
    setDeleteEventState(null)
    actionToast.show({ icon: 'success', message: 'Event deleted successfully' })
  }

  function sendShare(): void {
    if (!shareEvent || !shareMemberId) return
    const recipient = shareCandidates.find((m) => m.member_id === shareMemberId)
    actionToast.messageSent(recipient?.full_name ?? 'connection')
    actionToast.show({
      icon: 'message',
      message: `Shared "${shareEvent.eventName}"`,
      linkText: 'Open messaging',
      linkTo: '/messaging',
    })
    setShareEvent(null)
    setShareMemberId('')
  }

  return (
    <div className="space-y-4 pb-8">
      <Card>
        <Card.Header className="flex items-center justify-between">
          <h1 className="text-lg font-semibold text-text-primary">Events</h1>
          <button type="button" className="inline-flex items-center gap-1 rounded-full border border-brand-primary px-4 py-1.5 text-sm font-semibold text-brand-primary" onClick={() => setOpen(true)}>
            Create event <Plus className="h-4 w-4" />
          </button>
        </Card.Header>
        <Card.Body className="pt-0">
          <div className="flex border-b border-border">
            <button type="button" className={`relative -mb-px px-4 py-2 text-sm font-medium ${tab === 'your' ? 'border-b-2 border-success font-semibold text-success' : 'text-text-secondary'}`} onClick={() => setTab('your')}>Your events</button>
            <button type="button" className={`relative -mb-px px-4 py-2 text-sm font-medium ${tab === 'discover' ? 'border-b-2 border-success font-semibold text-success' : 'text-text-secondary'}`} onClick={() => setTab('discover')}>Discover</button>
          </div>
          <p className="mt-3 text-sm text-text-secondary">{filteredEvents.length} events</p>
          <div className="mt-2">
            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-md border border-black px-3 py-2.5 text-sm text-text-primary"
              placeholder="Search events"
            />
          </div>
          <div className="mt-2">
            {filteredEvents.length === 0 ? (
              <EmptyState icon={<CalendarDays className="h-6 w-6" />} title="No events yet" description="Create an event to get started" />
            ) : (
              filteredEvents.map((event) => (
                <EventCard
                  key={event.id}
                  event={event}
                  onEdit={openEdit}
                  onDelete={(selected) => setDeleteEventState(selected)}
                  onShare={(selected) => setShareEvent(selected)}
                />
              ))
            )}
          </div>
        </Card.Body>
      </Card>
      <div className="mx-auto max-w-xl">
        <RailFooter />
      </div>

      <CreateEventModal open={open} onClose={() => setOpen(false)} onCreate={create} />

      <Modal isOpen={editEvent != null} onClose={() => setEditEvent(null)} title="Edit event" size="md">
        <Modal.Header><span className="text-lg font-semibold">Edit event</span></Modal.Header>
        <Modal.Body className="space-y-3">
          <div>
            <label className="mb-1 block text-sm text-text-secondary">Cover image</label>
            <div className="mb-2 h-28 w-full overflow-hidden rounded-md border border-border bg-surface">
              {editCoverImage ? <img src={editCoverImage} alt="Event cover preview" className="h-full w-full object-cover" /> : null}
            </div>
            <div className="flex gap-2">
              <label className="cursor-pointer rounded-full border border-border px-4 py-1.5 text-sm font-semibold">
                Upload image
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    const result = handleImageUpload(file)
                    if (result.error) {
                      actionToast.show({ icon: 'warning', message: result.error })
                      return
                    }
                    setEditCoverImage(result.url)
                  }}
                />
              </label>
              <button type="button" className="rounded-full border border-border px-4 py-1.5 text-sm font-semibold" onClick={() => setEditCoverImage('')} disabled={!editCoverImage}>
                Remove image
              </button>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm text-text-secondary">Event name*</label>
            <input className="w-full rounded-md border border-black px-3 py-2.5 text-sm" value={editName} onChange={(e) => setEditName(e.target.value.slice(0, 75))} />
          </div>
          <div>
            <label className="mb-1 block text-sm text-text-secondary">Event format*</label>
            <input className="w-full rounded-md border border-black px-3 py-2.5 text-sm" value={editFormat} onChange={(e) => setEditFormat(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm text-text-secondary">Start date</label>
              <input type="date" className="w-full rounded-md border border-black px-3 py-2.5 text-sm" value={editDate} onChange={(e) => setEditDate(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm text-text-secondary">Start time</label>
              <input className="w-full rounded-md border border-black px-3 py-2.5 text-sm" value={editTime} onChange={(e) => setEditTime(e.target.value)} />
            </div>
          </div>
        </Modal.Body>
        <Modal.Footer>
          <button type="button" className="rounded-full border border-border px-4 py-1.5 text-sm font-semibold" onClick={() => setEditEvent(null)}>Cancel</button>
          <button type="button" className="rounded-full bg-brand-primary px-5 py-1.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400" disabled={!editName.trim() || !editFormat.trim()} onClick={saveEdit}>Save</button>
        </Modal.Footer>
      </Modal>

      <ConfirmModal
        isOpen={deleteEventState != null}
        onClose={() => setDeleteEventState(null)}
        title="Delete event"
        message={`Are you sure you want to delete "${deleteEventState?.eventName ?? 'this event'}"?`}
        confirmLabel="Delete"
        confirmVariant="destructive"
        onConfirm={confirmDelete}
      />

      <Modal isOpen={shareEvent != null} onClose={() => { setShareEvent(null); setShareMemberId('') }} title="Share event" size="md">
        <Modal.Header><span className="text-lg font-semibold">Share event</span></Modal.Header>
        <Modal.Body className="space-y-3">
          <p className="text-sm text-text-secondary">
            Send <span className="font-semibold text-text-primary">{shareEvent?.eventName}</span> to your connections via messaging.
          </p>
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
          <button type="button" className="rounded-full border border-border px-4 py-1.5 text-sm font-semibold" onClick={() => { setShareEvent(null); setShareMemberId('') }}>Cancel</button>
          <button type="button" className="rounded-full bg-brand-primary px-5 py-1.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400" disabled={!shareMemberId} onClick={sendShare}>Send message</button>
        </Modal.Footer>
      </Modal>
    </div>
  )
}
