const GSI_SCRIPT = 'https://accounts.google.com/gsi/client'

let scriptPromise: Promise<void> | null = null

function loadGoogleIdentityScript(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Google sign-in is only available in the browser.'))
  }
  if (window.google?.accounts?.oauth2) {
    return Promise.resolve()
  }
  if (scriptPromise) {
    return scriptPromise
  }
  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GSI_SCRIPT}"]`)
    if (existing) {
      if (window.google?.accounts?.oauth2) {
        resolve()
        return
      }
      existing.addEventListener('load', () => resolve(), { once: true })
      existing.addEventListener('error', () => reject(new Error('Failed to load Google sign-in script.')), { once: true })
      return
    }
    const script = document.createElement('script')
    script.src = GSI_SCRIPT
    script.async = true
    script.defer = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Failed to load Google sign-in script.'))
    document.head.appendChild(script)
  })
  return scriptPromise
}

const GOOGLE_OAUTH_SCOPES =
  'https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile'

export const MISSING_GOOGLE_CLIENT_ID = 'CONFIG_MISSING_GOOGLE_CLIENT_ID'

/**
 * Shows Google’s account chooser (when multiple accounts exist) and returns an access token
 * for the userinfo API.
 */
export function requestGoogleAccessToken(): Promise<string> {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim()
  if (!clientId) {
    return Promise.reject(new Error(MISSING_GOOGLE_CLIENT_ID))
  }
  return loadGoogleIdentityScript().then(
    () =>
      new Promise((resolve, reject) => {
        const client = window.google!.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: GOOGLE_OAUTH_SCOPES,
          callback: (response) => {
            if (response.error) {
              const desc = response.error_description ?? response.error
              if (
                response.error === 'access_denied' ||
                /popup|closed|dismiss|cancel|user_cancel|consent|abort/i.test(desc)
              ) {
                reject(new Error('GOOGLE_OAUTH_USER_CANCELLED'))
                return
              }
              reject(new Error(desc))
              return
            }
            if (response.access_token) {
              resolve(response.access_token)
            } else {
              reject(new Error('Google did not return an access token.'))
            }
          },
        })
        client.requestAccessToken({ prompt: 'select_account' })
      }),
  )
}
