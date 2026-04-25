import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react'
import { cn } from '../../lib/cn'

type ToastVariant = 'success' | 'error' | 'info'

type ToastItem = {
  id: string
  title: string
  description?: string
  variant: ToastVariant
}

type ToastContextValue = {
  toast: (payload: Omit<ToastItem, 'id'>) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const variantClasses: Record<ToastVariant, string> = {
  success: 'border-success/30 bg-success/10',
  error: 'border-danger/30 bg-danger/10',
  info: 'border-brand-primary/30 bg-brand-primary/10',
}

const variantIcon: Record<ToastVariant, JSX.Element> = {
  success: <CheckCircle2 className="h-4 w-4 text-success" aria-hidden />,
  error: <AlertCircle className="h-4 w-4 text-danger" aria-hidden />,
  info: <Info className="h-4 w-4 text-brand-primary" aria-hidden />,
}

export function ToastProvider({ children }: { children: ReactNode }): JSX.Element {
  const [items, setItems] = useState<ToastItem[]>([])

  const removeToast = useCallback((id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id))
  }, [])

  const toast = useCallback((payload: Omit<ToastItem, 'id'>) => {
    const id = crypto.randomUUID()
    setItems((prev) => [...prev, { ...payload, id }])
    window.setTimeout(() => removeToast(id), 3500)
  }, [removeToast])

  const value = useMemo<ToastContextValue>(() => ({ toast }), [toast])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed bottom-4 left-4 z-[60] flex w-[min(92vw,24rem)] flex-col gap-2">
        {items.map((item) => (
          <div key={item.id} className={cn('rounded-lg border p-3 shadow-sm', variantClasses[item.variant])} role="status" aria-live="polite">
            <div className="flex items-start gap-2">
              {variantIcon[item.variant]}
              <div className="flex-1">
                <p className="text-sm font-semibold text-text-primary">{item.title}</p>
                {item.description ? <p className="text-xs text-text-secondary">{item.description}</p> : null}
              </div>
              <button
                type="button"
                onClick={() => removeToast(item.id)}
                className="rounded p-1 text-text-secondary hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2"
                aria-label="Dismiss notification"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within ToastProvider')
  }
  return context
}
