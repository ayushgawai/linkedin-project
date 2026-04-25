import { zodResolver } from '@hookform/resolvers/zod'
import { Pencil, Plus, X } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Button, CharCounter, Modal } from '../../components/ui'
import { useClickOutside } from '../../hooks/useClickOutside'
import {
  communityFooterPrimaryClass,
  communityFooterPrimaryDisabledClass,
  communityInputClass,
  communityLabelClass,
  communityTextareaClass,
} from '../../lib/communityFormStyles'
import { handleImageUpload } from '../../lib/imageUpload'
import type { Group } from '../../types/group'
import { createGroupSchema, type CreateGroupValues } from './schemas'

const INDUSTRIES = [
  'Technology', 'Finance', 'Healthcare', 'Education', 'Marketing', 'Design', 'Engineering', 'Consulting',
  'Legal', 'Media', 'Retail', 'Manufacturing', 'Nonprofit', 'Government', 'Other',
]

type Props = {
  open: boolean
  onClose: () => void
  onCreate: (payload: Omit<Group, 'id' | 'createdAt' | 'createdBy' | 'members' | 'memberCount'>) => void
}

export function CreateGroupModal({ open, onClose, onCreate }: Props): JSX.Element {
  const [industries, setIndustries] = useState<string[]>([])
  const [query, setQuery] = useState('')
  const [coverImage, setCoverImage] = useState('')
  const [logoImage, setLogoImage] = useState('')
  const [coverMenuOpen, setCoverMenuOpen] = useState(false)
  const coverInput = useRef<HTMLInputElement>(null)
  const logoInput = useRef<HTMLInputElement>(null)
  const coverMenuRef = useRef<HTMLDivElement>(null)

  useClickOutside(coverMenuRef, () => setCoverMenuOpen(false), coverMenuOpen)

  const form = useForm<CreateGroupValues>({
    resolver: zodResolver(createGroupSchema),
    mode: 'onBlur',
    defaultValues: { name: '', description: '', location: '', rules: '', groupType: 'public' },
  })

  const name = form.watch('name') ?? ''
  const description = form.watch('description') ?? ''
  const rules = form.watch('rules') ?? ''
  const progress = Math.min(
    100,
    Math.round(([name, description, form.watch('location') ?? '', rules, industries.length > 0 ? '1' : ''].filter(Boolean).length / 5) * 100),
  )
  const canCreate = name.trim().length > 0 && description.trim().length > 0
  const filtered = useMemo(() => INDUSTRIES.filter((i) => i.toLowerCase().includes(query.toLowerCase()) && !industries.includes(i)), [industries, query])

  function submit(): void {
    void form.handleSubmit((values) => {
      onCreate({
        name: values.name,
        description: values.description,
        location: values.location,
        rules: values.rules,
        groupType: values.groupType,
        industry: industries,
        coverImage: coverImage || undefined,
        logoImage: logoImage || undefined,
      })
      onClose()
      form.reset()
      setIndustries([])
      setQuery('')
      setCoverImage('')
      setLogoImage('')
    })()
  }

  return (
    <Modal isOpen={open} onClose={onClose} title="Create group" size="lg">
      <Modal.Header><span className="text-xl font-semibold text-text-primary">Create group</span></Modal.Header>
      <Modal.Body className="max-h-[70vh] overflow-y-auto px-6 py-4">
        <input ref={coverInput} type="file" accept="image/*" className="hidden" onChange={(e) => {
          const file = e.target.files?.[0]
          if (!file) return
          const result = handleImageUpload(file)
          if (!result.error) {
            if (coverImage.startsWith('blob:')) {
              URL.revokeObjectURL(coverImage)
            }
            setCoverImage(result.url)
          }
        }} />
        <input ref={logoInput} type="file" accept="image/*" className="hidden" onChange={(e) => {
          const file = e.target.files?.[0]
          if (!file) return
          const result = handleImageUpload(file)
          if (!result.error) setLogoImage(result.url)
        }} />
        <div className="relative mb-10">
          <div className="relative h-[120px] overflow-hidden rounded-lg bg-gradient-to-r from-purple-200 via-purple-100 to-purple-200">
            {coverImage ? <img src={coverImage} alt="Group cover" className="h-full w-full rounded-lg object-cover" /> : null}
            {!coverImage ? <div className="absolute -right-5 -top-8 h-36 w-36 rounded-full bg-purple-400/30" /> : null}
            <div ref={coverMenuRef} className="absolute right-3 top-3 z-20">
              <button
                type="button"
                className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-white shadow-sm"
                onClick={() => setCoverMenuOpen((prev) => !prev)}
              >
                <Pencil className="h-4 w-4" />
              </button>
              {coverMenuOpen ? (
                <div className="absolute right-0 mt-2 w-40 rounded-md border border-border bg-white py-1 shadow-md">
                  <button
                    type="button"
                    className="block w-full px-3 py-2 text-left text-sm text-text-primary hover:bg-black/5"
                    onClick={() => {
                      setCoverMenuOpen(false)
                      coverInput.current?.click()
                    }}
                  >
                    Upload image
                  </button>
                  <button
                    type="button"
                    className="block w-full px-3 py-2 text-left text-sm text-text-primary hover:bg-black/5 disabled:cursor-not-allowed disabled:text-text-tertiary"
                    disabled={!coverImage}
                    onClick={() => {
                      if (coverImage.startsWith('blob:')) {
                        URL.revokeObjectURL(coverImage)
                      }
                      setCoverImage('')
                      setCoverMenuOpen(false)
                    }}
                  >
                    Remove image
                  </button>
                </div>
              ) : null}
            </div>
          </div>
          <div className="absolute -bottom-8 left-4 z-10 flex items-end gap-2">
            <div className="h-16 w-16 overflow-hidden rounded border border-border bg-white">
              {logoImage ? (
                <img src={logoImage} alt="Group logo" className="h-full w-full object-cover" />
              ) : (
                <svg viewBox="0 0 64 64" className="h-full w-full">
                  <circle cx="20" cy="34" r="12" fill="#96A8BA" />
                  <circle cx="32" cy="32" r="12" fill="#6F87A4" />
                  <circle cx="45" cy="34" r="12" fill="#8EA2B5" />
                </svg>
              )}
            </div>
            <button type="button" className="flex h-7 w-7 items-center justify-center rounded-full border border-border bg-white shadow-sm" onClick={() => logoInput.current?.click()}>
              <Pencil className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <p className="mb-4 text-right text-sm text-danger">* Indicates required</p>
        <label className={communityLabelClass}>Group name*</label>
        <input className={communityInputClass} maxLength={100} {...form.register('name')} />
        <CharCounter current={name.length} max={100} />
        {form.formState.errors.name ? <p className="mt-1 text-xs text-danger">{form.formState.errors.name.message}</p> : null}

        <label className={`${communityLabelClass} mt-3`}>Description*</label>
        <textarea className={communityTextareaClass} maxLength={2000} placeholder="What is the purpose of your group?" {...form.register('description')} />
        <CharCounter current={description.length} max={2000} />
        {form.formState.errors.description ? <p className="mt-1 text-xs text-danger">{form.formState.errors.description.message}</p> : null}

        <div className="mt-3">
          <p className={communityLabelClass}>Industry (up to 3)</p>
          {industries.length < 3 ? (
            <div className="relative inline-block">
              <button type="button" className="inline-flex items-center gap-1 rounded-full border border-text-tertiary px-3 py-1 text-sm" onClick={() => setQuery((v) => (v === '' ? ' ' : ''))}>
                Add industry <Plus className="h-3.5 w-3.5" />
              </button>
              {query !== '' ? (
                <div className="absolute z-20 mt-1 w-64 rounded-md border border-border bg-white p-2 shadow-sm">
                  <input className={`${communityInputClass} py-2`} value={query.trimStart()} onChange={(e) => setQuery(e.target.value)} placeholder="Search industry" />
                  <div className="mt-1 max-h-36 overflow-auto">
                    {filtered.map((item) => (
                      <button key={item} type="button" className="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-black/5" onClick={() => { setIndustries((prev) => [...prev, item]); setQuery('') }}>{item}</button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
          <div className="mt-2 flex flex-wrap gap-2">
            {industries.map((item) => (
              <span key={item} className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 text-sm">
                {item}
                <button type="button" onClick={() => setIndustries((prev) => prev.filter((x) => x !== item))}><X className="h-3.5 w-3.5" /></button>
              </span>
            ))}
          </div>
        </div>

        <label className={`${communityLabelClass} mt-3`}>Location</label>
        <input className={communityInputClass} placeholder="Add a location to your group" {...form.register('location')} />
        <label className={`${communityLabelClass} mt-3`}>Rules</label>
        <textarea className={communityTextareaClass} maxLength={4000} placeholder="Set the tone and expectations of your group" {...form.register('rules')} />
        <CharCounter current={rules.length} max={4000} />

        <div className="mt-3">
          <p className={communityLabelClass}>Group type</p>
          {(['public', 'private'] as const).map((type) => {
            const active = form.watch('groupType') === type
            return (
              <button key={type} type="button" className="mt-2 flex w-full items-start" onClick={() => form.setValue('groupType', type)}>
                <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${active ? 'border-success' : 'border-text-tertiary'}`}>
                  {active ? <span className="h-3 w-3 rounded-full bg-success" /> : null}
                </span>
                <span className="ml-2 text-left">
                  <span className="block text-sm text-text-primary">{type === 'public' ? 'Public' : 'Private'}</span>
                  <span className="ml-0 block text-sm text-text-secondary">
                    {type === 'public'
                      ? "Anyone, on or off the platform can see posts in the group. The group appears in search results and is visible to others on members' profiles."
                      : 'Only group members can see posts in the group.'}
                  </span>
                </span>
              </button>
            )
          })}
        </div>
        <div className="mt-4 h-[3px] w-full overflow-hidden rounded bg-surface">
          <div className="h-full bg-gradient-to-r from-brand-primary to-success" style={{ width: `${progress}%` }} />
        </div>
      </Modal.Body>
      <Modal.Footer className="sticky bottom-0 flex justify-end gap-2 border-t border-border px-6 py-3">
        <Button variant="tertiary" onClick={onClose}>Cancel</Button>
        <button type="button" className={canCreate ? communityFooterPrimaryClass : communityFooterPrimaryDisabledClass} disabled={!canCreate} onClick={submit}>Create</button>
      </Modal.Footer>
    </Modal>
  )
}
