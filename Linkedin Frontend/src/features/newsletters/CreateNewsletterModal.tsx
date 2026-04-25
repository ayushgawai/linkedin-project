import { zodResolver } from '@hookform/resolvers/zod'
import { ChevronDown } from 'lucide-react'
import { useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Button, Modal } from '../../components/ui'
import {
  communityFooterPrimaryClass,
  communityFooterPrimaryDisabledClass,
  communityInputClass,
  communityLabelClass,
  communitySelectClass,
  communitySelectWrapClass,
} from '../../lib/communityFormStyles'
import { handleImageUpload } from '../../lib/imageUpload'
import type { Newsletter } from '../../types/newsletter'
import { createNewsletterSchema, type CreateNewsletterValues } from './schemas'

type Props = {
  open: boolean
  onClose: () => void
  onCreate: (payload: Omit<Newsletter, 'id' | 'createdAt' | 'subscriberCount'>) => void
}

export function CreateNewsletterModal({ open, onClose, onCreate }: Props): JSX.Element {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [logo, setLogo] = useState('')
  const form = useForm<CreateNewsletterValues>({
    resolver: zodResolver(createNewsletterSchema),
    mode: 'onBlur',
    defaultValues: { title: '', description: '', frequency: undefined },
  })

  const canDone = !!form.watch('title') && !!form.watch('description') && !!form.watch('frequency')

  function submit(): void {
    void form.handleSubmit((values) => {
      onCreate({
        title: values.title,
        description: values.description,
        frequency: values.frequency,
        logoImage: logo || undefined,
        createdBy: 'demo-member',
        createdByName: 'SJSU Student',
        createdByHeadline: 'Frontend Lead | Distributed Systems',
      })
      form.reset()
      setLogo('')
      onClose()
    })()
  }

  return (
    <Modal isOpen={open} onClose={onClose} title="Create a newsletter" size="lg">
      <Modal.Header><span className="text-xl font-semibold text-text-primary">Create a newsletter</span></Modal.Header>
      <Modal.Body className="max-h-[70vh] overflow-y-auto px-6 py-4">
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => {
          const file = e.target.files?.[0]
          if (!file) return
          const result = handleImageUpload(file)
          if (!result.error) setLogo(result.url)
        }} />
        <div className="mb-4 rounded-lg bg-surface p-4 text-sm text-text-secondary">
          Newsletters allow you to share your perspective regularly by publishing articles at the cadence you choose. Your subscribers will receive a push notification and email after each new edition of your newsletter. Limit 5 newsletters per member.{' '}
          <a href="#" className="text-brand-primary">Learn More</a>
        </div>
        <p className="mb-4 text-base font-semibold">Newsletter details</p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={communityLabelClass}>Newsletter title*</label>
            <input className={communityInputClass} placeholder="Add a title to your newsletter" {...form.register('title')} />
            {form.formState.errors.title ? <p className="mt-1 text-xs text-danger">{form.formState.errors.title.message}</p> : null}
          </div>
          <div>
            <label className={communityLabelClass}>How often do you want to publish?*</label>
            <div className={communitySelectWrapClass}>
              <select className={communitySelectClass} defaultValue="" {...form.register('frequency')}>
                <option value="" disabled>Select one</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="biweekly">Biweekly</option>
                <option value="monthly">Monthly</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2" />
            </div>
            {form.formState.errors.frequency ? <p className="mt-1 text-xs text-danger">{form.formState.errors.frequency.message}</p> : null}
          </div>
        </div>
        <div className="mt-4">
          <label className={communityLabelClass}>Newsletter description*</label>
          <input className={communityInputClass} placeholder="Add a description to your newsletter" {...form.register('description')} />
          <p className="mt-1 text-xs text-text-tertiary">This description appears alongside your newsletter title</p>
          {form.formState.errors.description ? <p className="mt-1 text-xs text-danger">{form.formState.errors.description.message}</p> : null}
        </div>
        <div className="mt-4 flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded bg-surface">
            {logo ? (
              <img src={logo} alt="Newsletter logo preview" className="h-full w-full object-cover" />
            ) : (
              <svg viewBox="0 0 64 64" className="h-full w-full">
                <rect x="12" y="10" width="40" height="46" rx="6" fill="#E6ECF2" />
                <rect x="20" y="22" width="24" height="4" rx="2" fill="#9BA8B5" />
                <rect x="20" y="31" width="20" height="4" rx="2" fill="#B0BBC5" />
                <rect x="20" y="40" width="14" height="4" rx="2" fill="#C3CCD4" />
              </svg>
            )}
          </div>
          <div>
            <p className="text-sm font-semibold text-text-primary">Add an image or logo for your newsletter to increase engagement.</p>
            <p className="text-sm text-text-tertiary">The recommended image size is 300x300 pixels.</p>
            <button type="button" className="mt-2 rounded-full border border-text-primary px-4 py-1.5 text-sm font-semibold text-text-primary" onClick={() => fileInputRef.current?.click()}>Upload image</button>
          </div>
        </div>
        <div className="mt-6 flex items-start gap-3 rounded-lg bg-surface p-4">
          <svg viewBox="0 0 64 56" className="h-14 w-14 shrink-0">
            <rect x="4" y="10" width="56" height="36" rx="8" fill="#DCE9F3" />
            <path d="M10 16l22 16 22-16" fill="none" stroke="#8EA7BE" strokeWidth="2" />
            <circle cx="14" cy="8" r="4" fill="#F2B38B" />
            <rect x="22" y="20" width="20" height="3" rx="1.5" fill="#9CB1C7" />
            <rect x="22" y="26" width="15" height="3" rx="1.5" fill="#B3C3D4" />
          </svg>
          <div>
            <p className="text-sm font-semibold text-text-primary">Your connections and followers will be invited to subscribe</p>
            <p className="text-sm text-text-secondary">We'll notify your network when you publish the first edition of your newsletter and invite new followers to subscribe.</p>
          </div>
        </div>
      </Modal.Body>
      <Modal.Footer className="sticky bottom-0 flex justify-end gap-2 border-t border-border px-6 py-3">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <button type="button" className={canDone ? communityFooterPrimaryClass : communityFooterPrimaryDisabledClass} disabled={!canDone} onClick={submit}>Done</button>
      </Modal.Footer>
    </Modal>
  )
}
