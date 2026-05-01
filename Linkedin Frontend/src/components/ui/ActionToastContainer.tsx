import { useEffect } from 'react'
import { ActionToast } from './ActionToast'
import { useActionToastStore } from '../../store/actionToastStore'

export function ActionToastContainer(): JSX.Element {
  const toasts = useActionToastStore((s) => s.toasts)
  const history = useActionToastStore((s) => s.history)
  const dismissToast = useActionToastStore((s) => s.dismissToast)

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent): void {
      if (e.key !== 'Escape') return
      const first = useActionToastStore.getState().toasts[0]
      if (first && !first.exiting) {
        dismissToast(first.id)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [dismissToast])

  const total = history.length

  return (
    <div
      className="pointer-events-none fixed bottom-0 left-0 right-0 z-50 flex flex-col-reverse gap-2 px-4 pb-4 md:bottom-6 md:left-6 md:right-auto md:px-0 md:pb-0"
      role="status"
      aria-live="polite"
      aria-relevant="additions text"
    >
      <div className="pointer-events-auto flex flex-col-reverse gap-2">
        {toasts.map((t) => {
          const position = history.findIndex((h) => h.id === t.id) + 1
          return <ActionToast key={t.id} toast={t} position={position || 1} total={Math.max(1, total)} />
        })}
      </div>
    </div>
  )
}
