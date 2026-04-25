import axios from 'axios'

export const externalClient = axios.create({
  timeout: 8000,
  headers: { Accept: 'application/json' },
  validateStatus: (s) => s >= 200 && s < 300,
})

const inFlight = new Map<string, Promise<unknown>>()
const responseCache = new Map<string, { at: number; data: unknown }>()
const CACHE_TTL_MS = 60_000

export async function getExternal<T>(url: string): Promise<T> {
  const now = Date.now()
  const cached = responseCache.get(url)
  if (cached && now - cached.at < CACHE_TTL_MS) {
    return cached.data as T
  }
  const running = inFlight.get(url) as Promise<T> | undefined
  if (running) {
    return running
  }
  const p = externalClient
    .get<T>(url)
    .then((res) => {
      inFlight.delete(url)
      const data = res.data
      responseCache.set(url, { at: Date.now(), data })
      return data
    })
    .catch((err) => {
      inFlight.delete(url)
      throw err
    })
  inFlight.set(url, p)
  return p as Promise<T>
}
