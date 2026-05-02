/**
 * MinIO URLs are often stored as http://127.0.0.1:9000/... or http://minio:9000/...
 * Those hosts only work on the machine that runs MinIO / Docker. Other browsers
 * (or teammates) must load objects through the API gateway instead.
 */
export function rewriteMinioUrlForApiGateway(url: string | null | undefined): string | null {
  if (url == null) return null
  const s = String(url).trim()
  if (!s) return null
  if (s.startsWith('data:') || s.startsWith('blob:')) return s

  const api = import.meta.env.VITE_API_BASE_URL
  if (!api || typeof api !== 'string') return s

  let apiOrigin: string
  try {
    if (api.startsWith('http://') || api.startsWith('https://')) {
      apiOrigin = new URL(api).origin
    } else if (typeof window !== 'undefined' && window.location?.origin) {
      apiOrigin = new URL(api, window.location.origin).origin
    } else {
      return s
    }
  } catch {
    return s
  }

  try {
    const u = new URL(s)
    const loopback = u.hostname === '127.0.0.1' || u.hostname === 'localhost'
    const dockerMinio = u.hostname === 'minio' || u.hostname === 'host.docker.internal'
    if (!loopback && !dockerMinio) return s
    // Avoid rewriting unrelated localhost services (e.g. the API itself on 8011).
    if (loopback && u.port && u.port !== '9000') return s
    // MinIO API is typically on 9000; skip odd ports for docker-internal hostnames.
    if (dockerMinio && u.port && u.port !== '9000') return s

    return `${apiOrigin}/media${u.pathname}${u.search}`
  } catch {
    return s
  }
}
