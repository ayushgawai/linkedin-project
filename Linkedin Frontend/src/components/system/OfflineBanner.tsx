import { useEffect, useState } from 'react'

export function OfflineBanner(): JSX.Element | null {
  const [online, setOnline] = useState(() => navigator.onLine)

  useEffect(() => {
    const onOnline = () => setOnline(true)
    const onOffline = () => setOnline(false)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  if (online) return null

  return (
    <div className="fixed left-1/2 top-3 z-[80] -translate-x-1/2 rounded-full bg-danger px-4 py-2 text-xs font-semibold text-white">
      You are offline. Trying to reconnect...
    </div>
  )
}
