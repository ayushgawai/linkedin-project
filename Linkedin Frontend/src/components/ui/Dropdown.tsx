import { ChevronDown } from 'lucide-react'
import { createContext, useContext, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { cn } from '../../lib/cn'
import { useClickOutside } from '../../hooks/useClickOutside'

type DropdownContextValue = {
  open: boolean
  setOpen: (open: boolean) => void
  triggerRef: React.RefObject<HTMLButtonElement>
  menuRef: React.RefObject<HTMLDivElement>
}

const DropdownContext = createContext<DropdownContextValue | null>(null)

function useDropdownContext(): DropdownContextValue {
  const context = useContext(DropdownContext)
  if (!context) {
    throw new Error('Dropdown components must be used within Dropdown.Root')
  }
  return context
}

function Root({ children }: { children: ReactNode }): JSX.Element {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useClickOutside(containerRef, () => setOpen(false), open)

  const value = useMemo(() => ({ open, setOpen, triggerRef, menuRef }), [open])

  return (
    <DropdownContext.Provider value={value}>
      <div ref={containerRef} className="relative inline-block">
        {children}
      </div>
    </DropdownContext.Provider>
  )
}

function Trigger({
  children,
  className,
  showEndChevron = true,
}: {
  children: ReactNode
  className?: string
  showEndChevron?: boolean
}): JSX.Element {
  const { open, setOpen, triggerRef } = useDropdownContext()

  return (
    <button
      ref={triggerRef}
      type="button"
      aria-haspopup="menu"
      aria-expanded={open}
      onClick={() => setOpen(!open)}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          setOpen(false)
        }
      }}
      className={cn(
        'inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm text-text-secondary hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2',
        className,
      )}
    >
      {children}
      {showEndChevron ? <ChevronDown className="h-4 w-4" aria-hidden /> : null}
    </button>
  )
}

function Content({ children, className }: { children: ReactNode; className?: string }): JSX.Element | null {
  const { open, setOpen, menuRef } = useDropdownContext()

  if (!open) {
    return null
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    const items = menuRef.current?.querySelectorAll<HTMLButtonElement>('[role=\"menuitem\"]')
    if (!items || items.length === 0) {
      return
    }
    const activeIndex = Array.from(items).findIndex((item) => item === document.activeElement)

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      const nextIndex = activeIndex < 0 ? 0 : (activeIndex + 1) % items.length
      items[nextIndex]?.focus()
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      const prevIndex = activeIndex <= 0 ? items.length - 1 : activeIndex - 1
      items[prevIndex]?.focus()
    }
    if (event.key === 'Home') {
      event.preventDefault()
      items[0]?.focus()
    }
    if (event.key === 'End') {
      event.preventDefault()
      items[items.length - 1]?.focus()
    }
    if (event.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div
      ref={menuRef}
      role="menu"
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      className={cn('absolute right-0 z-30 mt-2 min-w-40 rounded-md border border-border bg-surface-raised py-1 shadow-sm', className)}
    >
      {children}
    </div>
  )
}

function Item({
  children,
  onSelect,
  className,
}: {
  children: ReactNode
  onSelect?: () => void
  className?: string
}): JSX.Element {
  const { setOpen } = useDropdownContext()
  return (
    <button
      type="button"
      role="menuitem"
      onClick={() => {
        onSelect?.()
        setOpen(false)
      }}
      className={cn(
        'block w-full px-3 py-2 text-left text-sm text-text-primary hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-inset',
        className,
      )}
    >
      {children}
    </button>
  )
}

export const Dropdown = {
  Root,
  Trigger,
  Content,
  Item,
}
