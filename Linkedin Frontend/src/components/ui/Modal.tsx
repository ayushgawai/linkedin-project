import { X } from 'lucide-react'
import {
  createContext,
  forwardRef,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type HTMLAttributes,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { cn } from '../../lib/cn'

type ModalSize = 'sm' | 'md' | 'lg' | 'xl'

type ModalContextValue = {
  onClose: () => void
}

const ModalContext = createContext<ModalContextValue | null>(null)

const sizeClasses: Record<ModalSize, string> = {
  sm: 'max-w-md',
  md: 'max-w-xl',
  lg: 'max-w-3xl',
  xl: 'max-w-5xl',
}

type ModalProps = {
  isOpen: boolean
  onClose: () => void
  title: string
  size?: ModalSize
  children: ReactNode
}

export function Modal({ isOpen, onClose, title, size = 'md', children }: ModalProps): JSX.Element | null {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) {
      return
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        onClose()
      }
      if (event.key === 'Tab' && panelRef.current) {
        const focusables = panelRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        )
        const first = focusables[0]
        const last = focusables[focusables.length - 1]
        if (!first || !last) {
          return
        }

        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first.focus()
        }
      }
    }

    document.addEventListener('keydown', onKeyDown)

    const timeout = window.setTimeout(() => {
      panelRef.current?.focus()
    }, 0)

    return () => {
      window.clearTimeout(timeout)
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [isOpen, onClose])

  const context = useMemo<ModalContextValue>(() => ({ onClose }), [onClose])

  if (!isOpen) {
    return null
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/40 transition-opacity duration-200"
        aria-label="Close modal backdrop"
        onClick={onClose}
      />
      <ModalContext.Provider value={context}>
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label={title}
          tabIndex={-1}
          className={cn(
            'relative z-10 w-full rounded-lg border border-border bg-surface-raised outline-none transition duration-200 ease-out',
            sizeClasses[size],
          )}
        >
          {children}
        </div>
      </ModalContext.Provider>
    </div>,
    document.body,
  )
}

type SectionProps = HTMLAttributes<HTMLDivElement>

const Header = forwardRef<HTMLDivElement, SectionProps>(function ModalHeader({ className, children, ...props }, ref) {
  const context = useContext(ModalContext)
  return (
    <div ref={ref} className={cn('flex items-center justify-between border-b border-border px-4 py-3', className)} {...props}>
      <h3 className="text-base font-semibold text-text-primary">{children}</h3>
      <button
        type="button"
        className="rounded-full p-1 text-text-secondary transition hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2"
        aria-label="Close modal"
        onClick={context?.onClose}
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  )
})

const Body = forwardRef<HTMLDivElement, SectionProps>(function ModalBody({ className, ...props }, ref) {
  return <div ref={ref} className={cn('max-h-[70vh] overflow-auto px-4 py-4', className)} {...props} />
})

const Footer = forwardRef<HTMLDivElement, SectionProps>(function ModalFooter({ className, ...props }, ref) {
  return <div ref={ref} className={cn('flex justify-end gap-2 border-t border-border px-4 py-3', className)} {...props} />
})

Modal.Header = Header
Modal.Body = Body
Modal.Footer = Footer
