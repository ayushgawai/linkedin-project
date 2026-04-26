import { useEffect } from 'react'

export function useClickOutside<T extends HTMLElement>(
  ref: React.RefObject<T>,
  onOutside: () => void,
  enabled = true,
): void {
  useEffect(() => {
    if (!enabled) {
      return
    }

    function handlePointerDown(event: MouseEvent | TouchEvent): void {
      const target = event.target as Node | null
      if (ref.current && target && !ref.current.contains(target)) {
        onOutside()
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('touchstart', handlePointerDown)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('touchstart', handlePointerDown)
    }
  }, [enabled, onOutside, ref])
}
