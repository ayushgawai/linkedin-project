const failureStreaks = new Map<string, number>()

export const EXTERNAL_FAILURE_KEYS = {
  rightRailHn: 'ext-hn-rail',
  remotiveStrip: 'ext-remotive-strip',
  newsPage: 'ext-news-page',
  devtoFeatured: 'ext-devto-featured',
} as const

export function recordExternalFailure(key: string): void {
  const n = (failureStreaks.get(key) ?? 0) + 1
  failureStreaks.set(key, n)
  console.error(`[external] failure streak for ${key} = ${n}`)
}

export function clearExternalFailure(key: string): void {
  failureStreaks.set(key, 0)
}

export function isExternalSectionSuppressed(key: string): boolean {
  return (failureStreaks.get(key) ?? 0) >= 3
}
