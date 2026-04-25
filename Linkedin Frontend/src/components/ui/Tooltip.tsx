import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

type TooltipProps = {
  content: ReactNode
  children: ReactNode
  delayMs?: number
}

export function Tooltip({ content, children, delayMs = 200 }: TooltipProps): JSX.Element {
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState({ top: 0, left: 0 })
  const triggerRef = useRef<HTMLSpanElement>(null)
  const timeoutRef = useRef<number>()

  function show(): void {
    timeoutRef.current = window.setTimeout(() => {
      const rect = triggerRef.current?.getBoundingClientRect()
      if (!rect) {
        return
      }
      setCoords({
        top: Math.max(8, rect.top - 36),
        left: Math.min(window.innerWidth - 120, Math.max(8, rect.left + rect.width / 2 - 60)),
      })
      setOpen(true)
    }, delayMs)
  }

  function hide(): void {
    window.clearTimeout(timeoutRef.current)
    setOpen(false)
  }

  useEffect(() => () => window.clearTimeout(timeoutRef.current), [])

  return (
    <>
      <span ref={triggerRef} onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}>
        {children}
      </span>
      {open
        ? createPortal(
            <div
              role="tooltip"
              style={{ top: coords.top, left: coords.left }}
              className="fixed z-50 rounded bg-text-primary px-2 py-1 text-xs text-white"
            >
              {content}
            </div>,
            document.body,
          )
        : null}
    </>
  )
}
