const STORAGE_KEY = 'linkedin-local-credentials'

export type LocalCredentials = {
  email: string
  password: string
  /** Set at signup so mock login can restore recruiter vs member. */
  role?: 'member' | 'recruiter'
}

export function saveLocalCredentials(creds: LocalCredentials): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(creds))
  } catch {
    /* ignore quota */
  }
}

export function getLocalCredentials(): LocalCredentials | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as LocalCredentials
    if (!parsed?.email || !parsed?.password) return null
    return parsed
  } catch {
    return null
  }
}

export function clearLocalCredentials(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}
