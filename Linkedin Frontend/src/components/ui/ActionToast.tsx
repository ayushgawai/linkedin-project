import {
  AlertTriangle,
  CalendarCheck,
  CheckCircle2,
  Info,
  MessageSquare,
  Sparkles,
  UserPlus,
  X,
  XCircle,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { cn } from '../../lib/cn'
import type { ActionToastIcon, ActionToastItem } from '../../store/actionToastStore'
import { useActionToastStore } from '../../store/actionToastStore'

function formatRelativeShort(ts: number): string {
  const sec = Math.floor((Date.now() - ts) / 1000)
  if (sec < 60) return 'Just now'
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}h`
  const d = Math.floor(h / 24)
  return `${d}d`
}

function renderMessageWithLink(
  message: string,
  linkText: string | undefined,
  linkTo: string | undefined,
  onNavigate: (to: string) => void,
): JSX.Element {
  if (!linkText || !linkTo) {
    return <span>{message}</span>
  }
  const idx = message.indexOf(linkText)
  if (idx === -1) {
    const gap = message.length > 0 && !/\s$/.test(message) ? ' ' : ''
    return (
      <span>
        {message}
        {gap}
        <Link
          to={linkTo}
          onClick={(e) => {
            e.preventDefault()
            onNavigate(linkTo)
          }}
          className="font-semibold text-text-primary underline decoration-1 underline-offset-2 hover:text-brand-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-1"
        >
          {linkText}
        </Link>
      </span>
    )
  }
  const before = message.slice(0, idx)
  const after = message.slice(idx + linkText.length)
  return (
    <span>
      {before}
      <Link
        to={linkTo}
        onClick={(e) => {
          e.preventDefault()
          onNavigate(linkTo)
        }}
        className="font-semibold text-text-primary underline decoration-1 underline-offset-2 hover:text-brand-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-1"
      >
        {linkText}
      </Link>
      {after}
    </span>
  )
}

function iconLabel(icon: ActionToastIcon): string {
  switch (icon) {
    case 'success':
    case 'applied':
    case 'saved':
      return 'Success'
    case 'connection':
      return 'Connection'
    case 'interview':
      return 'Interview'
    case 'rejected':
      return 'Rejected'
    case 'message':
      return 'Message'
    case 'ai':
      return 'AI'
    case 'info':
      return 'Info'
    case 'warning':
      return 'Warning'
    default:
      return 'Notification'
  }
}

function progressBarClass(icon: ActionToastIcon): string {
  switch (icon) {
    case 'success':
    case 'applied':
    case 'saved':
      return 'bg-success'
    case 'interview':
      return 'bg-success'
    case 'rejected':
      return 'bg-danger'
    case 'warning':
      return 'bg-warning'
    case 'connection':
    case 'message':
    case 'info':
      return 'bg-brand-primary'
    case 'ai':
      return 'bg-purple-500'
    default:
      return 'bg-brand-primary'
  }
}

function IconVisual({ icon }: { icon: ActionToastIcon }): JSX.Element {
  if (icon === 'success' || icon === 'applied' || icon === 'saved') {
    return (
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-success" aria-hidden>
        <CheckCircle2 className="h-3.5 w-3.5 text-white" strokeWidth={2.5} aria-hidden />
      </div>
    )
  }
  if (icon === 'connection') {
    return <UserPlus className="h-6 w-6 shrink-0 text-brand-primary" strokeWidth={2} aria-hidden />
  }
  if (icon === 'interview') {
    return <CalendarCheck className="h-6 w-6 shrink-0 text-success" strokeWidth={2} aria-hidden />
  }
  if (icon === 'rejected') {
    return <XCircle className="h-6 w-6 shrink-0 text-danger" strokeWidth={2} aria-hidden />
  }
  if (icon === 'message') {
    return <MessageSquare className="h-6 w-6 shrink-0 text-brand-primary" strokeWidth={2} aria-hidden />
  }
  if (icon === 'ai') {
    return <Sparkles className="h-6 w-6 shrink-0 text-purple-500" strokeWidth={2} aria-hidden />
  }
  if (icon === 'warning') {
    return <AlertTriangle className="h-6 w-6 shrink-0 text-warning" strokeWidth={2} aria-hidden />
  }
  return <Info className="h-6 w-6 shrink-0 text-brand-primary" strokeWidth={2} aria-hidden />
}

type ActionToastProps = {
  toast: ActionToastItem
  position: number
  total: number
}

export function ActionToast({ toast, position, total }: ActionToastProps): JSX.Element {
  const navigate = useNavigate()
  const dismissToast = useActionToastStore((s) => s.dismissToast)
  const purgeToast = useActionToastStore((s) => s.purgeToast)

  const [uiState, setUiState] = useState<'entering' | 'visible' | 'exiting'>('entering')
  const [nowTick, setNowTick] = useState(0)
  const [flash, setFlash] = useState(false)
  const [paused, setPaused] = useState(false)
  const [progressPct, setProgressPct] = useState(100)
  const remainingRef = useRef(toast.duration ?? 6000)
  const lastTickRef = useRef(Date.now())

  const reducedMotion = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
    [],
  )

  const duration = toast.duration ?? 6000

  const relativeLabel = useMemo(() => formatRelativeShort(toast.timestamp), [toast.timestamp, nowTick])

  useEffect(() => {
    remainingRef.current = duration
    lastTickRef.current = Date.now()
    setProgressPct(100)
  }, [duration, toast.resumeToken])

  useEffect(() => {
    if (toast.flashUntil && Date.now() < toast.flashUntil) {
      setFlash(true)
      const t = window.setTimeout(() => setFlash(false), 320)
      return () => clearTimeout(t)
    }
    return undefined
  }, [toast.flashUntil])

  useEffect(() => {
    const id = requestAnimationFrame(() => setUiState('visible'))
    return () => cancelAnimationFrame(id)
  }, [])

  useEffect(() => {
    if (!toast.exiting) return
    setUiState('exiting')
    const t = window.setTimeout(() => purgeToast(toast.id), 200)
    return () => clearTimeout(t)
  }, [toast.exiting, toast.id, purgeToast])

  useEffect(() => {
    const id = window.setInterval(() => setNowTick((n) => n + 1), 30_000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (paused || toast.exiting) {
      return undefined
    }
    lastTickRef.current = Date.now()
    const id = window.setInterval(() => {
      const now = Date.now()
      const delta = now - lastTickRef.current
      lastTickRef.current = now
      remainingRef.current -= delta
      const pct = Math.max(0, Math.min(100, (remainingRef.current / duration) * 100))
      setProgressPct(pct)
      if (remainingRef.current <= 0) {
        clearInterval(id)
        dismissToast(toast.id)
      }
    }, 120)
    return () => clearInterval(id)
  }, [paused, toast.exiting, toast.id, dismissToast, duration])

  const handleNavigate = useCallback(
    (to: string) => {
      navigate(to)
      dismissToast(toast.id)
    },
    [navigate, dismissToast, toast.id],
  )

  const ariaLabel = `${iconLabel(toast.icon)}: ${toast.message}${toast.linkText ? ` ${toast.linkText}` : ''}`

  const translateClass =
    uiState === 'entering'
      ? reducedMotion
        ? 'opacity-0'
        : 'translate-y-4 opacity-0'
      : uiState === 'exiting'
        ? reducedMotion
          ? 'opacity-0'
          : 'translate-y-4 opacity-0'
        : reducedMotion
          ? 'opacity-100'
          : 'translate-y-0 opacity-100'

  const transitionMs = uiState === 'exiting' ? 200 : 250

  return (
    <div
      aria-label={ariaLabel}
      role="group"
      aria-atomic="true"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => {
        lastTickRef.current = Date.now()
        setPaused(false)
      }}
      className={cn(
        'relative min-w-[min(100%,320px)] max-w-[400px] overflow-hidden rounded-lg border border-border bg-white px-4 pt-3 pb-2 shadow-lg shadow-black/10 ease-out',
        translateClass,
        flash && 'bg-success/5',
      )}
      style={{
        transitionProperty: reducedMotion ? 'opacity' : 'opacity, transform',
        transitionDuration: `${transitionMs}ms`,
        transitionTimingFunction: uiState === 'exiting' ? 'ease-in' : 'ease-out',
      }}
    >
      <div className="flex items-start gap-3">
        <IconVisual icon={toast.icon} />
        <div className="min-w-0 flex-1 text-sm font-normal text-text-primary">
          {renderMessageWithLink(toast.message, toast.linkText, toast.linkTo, handleNavigate)}
        </div>
        {toast.dismissible !== false ? (
          <button
            type="button"
            className="shrink-0 rounded-full p-0.5 text-text-tertiary transition hover:bg-black/5 hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
            aria-label="Dismiss notification"
            onClick={() => dismissToast(toast.id)}
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        ) : null}
      </div>
      <div className="mt-2 flex items-center justify-between">
        <span className="text-xs text-text-tertiary">{relativeLabel}</span>
        <span className="text-xs text-text-tertiary">
          {position}/{total}
        </span>
      </div>
      <div className="relative mt-2 h-0.5 w-full overflow-hidden rounded-full bg-black/5" aria-hidden>
        <div
          className={cn('h-full rounded-full transition-[width] duration-100 ease-linear', progressBarClass(toast.icon))}
          style={{ width: `${uiState === 'visible' ? progressPct : 100}%` }}
        />
      </div>
    </div>
  )
}
