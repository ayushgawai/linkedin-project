import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import { cn } from '../../lib/cn'

type TabsContextValue = {
  value: string
  setValue: (value: string) => void
}

const TabsContext = createContext<TabsContextValue | null>(null)

function useTabsContext(): TabsContextValue {
  const context = useContext(TabsContext)
  if (!context) {
    throw new Error('Tabs components must be used within Tabs.Root')
  }
  return context
}

function Root({ defaultValue, children }: { defaultValue: string; children: ReactNode }): JSX.Element {
  const [value, setValue] = useState(defaultValue)
  const context = useMemo(() => ({ value, setValue }), [value])
  return <TabsContext.Provider value={context}>{children}</TabsContext.Provider>
}

function List({ children }: { children: ReactNode }): JSX.Element {
  return <div role="tablist" aria-orientation="horizontal" className="flex border-b border-border">{children}</div>
}

function Trigger({ value, children }: { value: string; children: ReactNode }): JSX.Element {
  const context = useTabsContext()
  const active = context.value === value
  return (
    <button
      role="tab"
      aria-selected={active}
      className={cn(
        'relative -mb-px px-4 py-2 text-sm font-medium text-text-secondary transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2',
        active && 'border-b-2 border-brand-primary text-brand-primary',
      )}
      onClick={() => context.setValue(value)}
      onKeyDown={(event) => {
        const siblings = (event.currentTarget.parentElement?.querySelectorAll('[role=\"tab\"]') ?? []) as NodeListOf<HTMLButtonElement>
        const currentIndex = Array.from(siblings).findIndex((tab) => tab === event.currentTarget)
        if (event.key === 'ArrowRight' && siblings.length > 0) {
          event.preventDefault()
          const next = siblings[(currentIndex + 1) % siblings.length]
          next?.focus()
          next?.click()
        }
        if (event.key === 'ArrowLeft' && siblings.length > 0) {
          event.preventDefault()
          const prev = siblings[(currentIndex - 1 + siblings.length) % siblings.length]
          prev?.focus()
          prev?.click()
        }
        if (event.key === 'Home' && siblings.length > 0) {
          event.preventDefault()
          siblings[0]?.focus()
          siblings[0]?.click()
        }
        if (event.key === 'End' && siblings.length > 0) {
          event.preventDefault()
          siblings[siblings.length - 1]?.focus()
          siblings[siblings.length - 1]?.click()
        }
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          context.setValue(value)
        }
      }}
    >
      {children}
    </button>
  )
}

function Content({ value, children }: { value: string; children: ReactNode }): JSX.Element | null {
  const context = useTabsContext()
  if (context.value !== value) {
    return null
  }
  return (
    <div role="tabpanel" className="py-4">
      {children}
    </div>
  )
}

export const Tabs = {
  Root,
  List,
  Trigger,
  Content,
}
