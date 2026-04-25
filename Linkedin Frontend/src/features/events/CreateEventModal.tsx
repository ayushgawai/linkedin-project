import { zodResolver } from '@hookform/resolvers/zod'
import { Camera, Check, ChevronDown, Clock3, Search, X } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Button, CharCounter, Modal } from '../../components/ui'
import { seedDemoData } from '../../lib/mockData'
import {
  communityFooterPrimaryClass,
  communityFooterPrimaryDisabledClass,
  communityInputClass,
  communityLabelClass,
  communitySelectClass,
  communitySelectWrapClass,
  communityTextareaClass,
} from '../../lib/communityFormStyles'
import { handleImageUpload } from '../../lib/imageUpload'
import type { Speaker } from '../../types/event'
import { createEventSchema, type CreateEventFormValues } from './schemas'

const EVENT_FORMATS = ['Meetup', 'Conference', 'Workshop', 'Webinar', 'Party', 'Other']
const TIMEZONE_OPTIONS = [
  '(UTC-08:00) Pacific Time',
  '(UTC-07:00) Mountain Time',
  '(UTC-06:00) Central Time',
  '(UTC-05:00) Eastern Time',
  '(UTC+00:00) UTC',
  '(UTC+05:30) India Standard Time',
]
const TIMES = Array.from({ length: 48 }).map((_, i) => {
  const h24 = Math.floor(i / 2)
  const minute = i % 2 === 0 ? '00' : '30'
  const suffix = h24 >= 12 ? 'PM' : 'AM'
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12
  return `${String(h12).padStart(2, '0')}:${minute} ${suffix}`
})

function defaultTimezone(): string {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
  if (zone.includes('Pacific')) return TIMEZONE_OPTIONS[0]
  if (zone.includes('Mountain')) return TIMEZONE_OPTIONS[1]
  if (zone.includes('Central')) return TIMEZONE_OPTIONS[2]
  if (zone.includes('Eastern')) return TIMEZONE_OPTIONS[3]
  if (zone.includes('Kolkata')) return TIMEZONE_OPTIONS[5]
  return TIMEZONE_OPTIONS[4]
}

type CreateEventModalProps = {
  open: boolean
  onClose: () => void
  onCreate: (payload: {
    eventType: 'online' | 'in_person'
    eventFormat: string
    eventName: string
    timezone: string
    startDate: string
    startTime: string
    endDate?: string
    endTime?: string
    description?: string
    coverImage?: string
    speakers: Speaker[]
  }) => void
}

export function CreateEventModal({ open, onClose, onCreate }: CreateEventModalProps): JSX.Element {
  const section2Ref = useRef<HTMLDivElement>(null)
  const section3Ref = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [coverImage, setCoverImage] = useState('')
  const [speakers, setSpeakers] = useState<Speaker[]>([])
  const [speakerQuery, setSpeakerQuery] = useState('')
  const [timeMenu, setTimeMenu] = useState<'start' | 'end' | null>(null)
  const [step, setStep] = useState(1)

  const form = useForm<CreateEventFormValues>({
    resolver: zodResolver(createEventSchema),
    mode: 'onBlur',
    defaultValues: {
      eventType: 'online',
      eventFormat: '',
      eventName: '',
      timezone: defaultTimezone(),
      startDate: new Date().toISOString().slice(0, 10),
      startTime: '07:00 PM',
      addEndDateTime: true,
      endDate: new Date().toISOString().slice(0, 10),
      endTime: '08:00 PM',
      description: '',
    },
  })

  const members = useMemo(() => seedDemoData().members.slice(0, 20), [])
  const matching = members.filter(
    (m) =>
      speakerQuery.trim().length > 0 &&
      m.full_name.toLowerCase().includes(speakerQuery.toLowerCase()) &&
      !speakers.some((s) => s.member_id === m.member_id),
  )

  const eventName = form.watch('eventName') ?? ''
  const description = form.watch('description') ?? ''
  const addEndDate = form.watch('addEndDateTime')
  const requiredReady =
    form.watch('eventFormat') && form.watch('eventName') && form.watch('timezone') && form.watch('startDate') && form.watch('startTime')

  function addSpeaker(member: (typeof members)[number]): void {
    setSpeakers((prev) => [
      ...prev,
      { member_id: member.member_id, name: member.full_name, headline: member.headline ?? '', avatar: member.profile_photo_url ?? undefined },
    ])
    setSpeakerQuery('')
  }

  function nextAction(): void {
    if (step === 1) {
      if (!form.getValues('eventFormat')) return
      section2Ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      setStep(2)
      return
    }
    if (step === 2) {
      if (!requiredReady) return
      section3Ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      setStep(3)
      return
    }
    void form.handleSubmit((values) => {
      onCreate({
        eventType: values.eventType,
        eventFormat: values.eventFormat,
        eventName: values.eventName,
        timezone: values.timezone,
        startDate: values.startDate,
        startTime: values.startTime,
        endDate: values.addEndDateTime ? values.endDate : undefined,
        endTime: values.addEndDateTime ? values.endTime : undefined,
        description: values.description,
        coverImage: coverImage || undefined,
        speakers,
      })
      setStep(1)
      setSpeakers([])
      setCoverImage('')
      form.reset()
      onClose()
    })()
  }

  return (
    <Modal isOpen={open} onClose={onClose} title="Create an event" size="lg">
      <Modal.Header><span className="text-xl font-semibold text-text-primary">Create an event</span></Modal.Header>
      <Modal.Body className="max-h-[70vh] space-y-5 overflow-y-auto px-6 py-4">
        <section className="space-y-4">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (!file) return
              const result = handleImageUpload(file)
              if (!result.error) setCoverImage(result.url)
            }}
          />
          <button
            type="button"
            className="group relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-lg border-2 border-dashed border-brand-primary bg-[#F4F2EE]"
            onClick={() => fileRef.current?.click()}
          >
            {coverImage ? <img src={coverImage} alt="Event cover preview" className="h-full w-full object-cover" /> : null}
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center bg-black/0 text-center transition group-hover:bg-black/25">
              <Camera className="h-10 w-10 text-text-tertiary" />
              <p className="mt-2 text-base font-semibold text-text-primary">Upload cover image</p>
              <p className="text-sm text-text-tertiary">Minimum width 480 pixels, 16:9 recommended</p>
            </div>
          </button>
          <div>
            <p className={communityLabelClass}>Event type</p>
            <div className="flex gap-6">
              {(['online', 'in_person'] as const).map((type) => {
                const active = form.watch('eventType') === type
                return (
                  <button key={type} type="button" className="inline-flex items-center" onClick={() => form.setValue('eventType', type)}>
                    <span className={`flex h-6 w-6 items-center justify-center rounded-full border-2 ${active ? 'border-success' : 'border-text-tertiary'}`}>
                      {active ? <span className="h-3 w-3 rounded-full bg-success" /> : null}
                    </span>
                    <span className="ml-2 text-sm text-text-primary">{type === 'online' ? 'Online' : 'In person'}</span>
                  </button>
                )
              })}
            </div>
          </div>
          <div>
            <label className={communityLabelClass}>Event format*</label>
            <div className={communitySelectWrapClass}>
              <select className={communitySelectClass} {...form.register('eventFormat')}>
                <option value="">Select</option>
                {EVENT_FORMATS.map((f) => <option key={f}>{f}</option>)}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2" />
            </div>
            {form.formState.errors.eventFormat ? <p className="mt-1 text-xs text-danger">{form.formState.errors.eventFormat.message}</p> : null}
          </div>
        </section>
        <div ref={section2Ref} className="-mx-6 border-t border-border" />
        <section ref={section2Ref} className="space-y-4">
          <div>
            <label className={communityLabelClass}>Event name*</label>
            <input className={communityInputClass} maxLength={75} {...form.register('eventName')} />
            <CharCounter current={eventName.length} max={75} />
            {form.formState.errors.eventName ? <p className="mt-1 text-xs text-danger">{form.formState.errors.eventName.message}</p> : null}
          </div>
          <div>
            <label className={communityLabelClass}>Timezone*</label>
            <div className={communitySelectWrapClass}>
              <select className={communitySelectClass} {...form.register('timezone')}>
                {TIMEZONE_OPTIONS.map((option) => <option key={option}>{option}</option>)}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2" />
            </div>
            {form.formState.errors.timezone ? <p className="mt-1 text-xs text-danger">{form.formState.errors.timezone.message}</p> : null}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={communityLabelClass}>Start date*</label>
              <input type="date" className={communityInputClass} {...form.register('startDate')} />
            </div>
            <div className="relative">
              <label className={communityLabelClass}>Start time*</label>
              <input
                className={communityInputClass}
                value={form.watch('startTime')}
                readOnly
                onFocus={() => setTimeMenu('start')}
                onClick={() => setTimeMenu('start')}
              />
              <Clock3 className="pointer-events-none absolute right-3 top-[38px] h-4 w-4" />
              {timeMenu === 'start' ? (
                <div className="absolute z-20 mt-1 max-h-48 w-full overflow-auto rounded-md border border-border bg-white">
                  {TIMES.map((t) => (
                    <button key={t} type="button" className="block w-full px-3 py-1.5 text-left text-sm hover:bg-black/5" onClick={() => { form.setValue('startTime', t); setTimeMenu(null) }}>{t}</button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
          <button type="button" className="inline-flex items-center" onClick={() => form.setValue('addEndDateTime', !addEndDate)}>
            <span className={`flex h-6 w-6 items-center justify-center rounded-sm border-2 ${addEndDate ? 'border-success bg-success text-white' : 'border-text-tertiary'}`}>
              {addEndDate ? <Check className="h-4 w-4" /> : null}
            </span>
            <span className="ml-2 text-sm text-text-primary">Add end date and time</span>
          </button>
          {addEndDate ? (
            <div className="grid grid-cols-2 gap-4 transition-all">
              <div>
                <label className={communityLabelClass}>End date</label>
                <input type="date" className={communityInputClass} {...form.register('endDate')} />
              </div>
              <div className="relative">
                <label className={communityLabelClass}>End time</label>
                <input
                  className={communityInputClass}
                  value={form.watch('endTime') ?? ''}
                  readOnly
                  onFocus={() => setTimeMenu('end')}
                  onClick={() => setTimeMenu('end')}
                />
                <Clock3 className="pointer-events-none absolute right-3 top-[38px] h-4 w-4" />
                {timeMenu === 'end' ? (
                  <div className="absolute z-20 mt-1 max-h-48 w-full overflow-auto rounded-md border border-border bg-white">
                    {TIMES.map((t) => (
                      <button key={t} type="button" className="block w-full px-3 py-1.5 text-left text-sm hover:bg-black/5" onClick={() => { form.setValue('endTime', t); setTimeMenu(null) }}>{t}</button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </section>
        <section ref={section3Ref} className="space-y-4">
          <div>
            <label className={communityLabelClass}>Description</label>
            <textarea className={communityTextareaClass} placeholder="Ex: topics, schedule, etc." maxLength={5000} {...form.register('description')} />
            <CharCounter current={description.length} max={5000} />
          </div>
          <div className="relative">
            <label className={communityLabelClass}>Speakers</label>
            <Search className="pointer-events-none absolute left-3 top-[38px] h-4 w-4 text-text-tertiary" />
            <input className={`${communityInputClass} pl-9`} value={speakerQuery} onChange={(e) => setSpeakerQuery(e.target.value)} />
            {speakerQuery && matching.length > 0 ? (
              <div className="absolute z-20 mt-1 max-h-44 w-full overflow-auto rounded-md border border-border bg-white">
                {matching.map((m) => (
                  <button key={m.member_id} type="button" className="block w-full px-3 py-2 text-left hover:bg-black/5" onClick={() => addSpeaker(m)}>
                    <p className="text-sm font-semibold">{m.full_name}</p>
                    <p className="text-xs text-text-secondary">{m.headline}</p>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          {speakers.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {speakers.map((s) => (
                <span key={s.member_id} className="inline-flex items-center gap-2 rounded-full border border-border px-2 py-1 text-sm">
                  {s.name}
                  <button type="button" onClick={() => setSpeakers((prev) => prev.filter((sp) => sp.member_id !== s.member_id))}>
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          ) : null}
          <p className="text-sm text-text-tertiary">
            Add connections to speak at the event. Speakers can join the event early and will be shown in the event's Details section and presenter area. They cannot allow attendees to speak or end the event.
          </p>
          <p className="text-sm text-text-tertiary">
            By continuing, you agree with our <a href="#" className="text-brand-primary">event policy</a>.
          </p>
          <p className="text-sm text-text-tertiary">
            Make the most of Events. <a href="#" className="text-brand-primary">Learn more</a>
          </p>
        </section>
      </Modal.Body>
      <Modal.Footer className="sticky bottom-0 flex justify-end gap-2 border-t border-border px-6 py-3">
        <Button variant="tertiary" onClick={onClose}>Cancel</Button>
        <button type="button" className={step === 3 ? (requiredReady ? communityFooterPrimaryClass : communityFooterPrimaryDisabledClass) : (requiredReady || step === 1 ? communityFooterPrimaryClass : communityFooterPrimaryDisabledClass)} onClick={nextAction} disabled={step !== 1 && !requiredReady}>
          {step === 3 ? 'Create event' : 'Next'}
        </button>
      </Modal.Footer>
    </Modal>
  )
}
