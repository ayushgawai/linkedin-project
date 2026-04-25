/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string
  readonly VITE_WS_BASE_URL: string
  readonly VITE_AI_BASE_URL: string
  readonly VITE_USE_MOCKS: string
  /** Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Web client ID */
  readonly VITE_GOOGLE_CLIENT_ID: string
  readonly VITE_HN_API_BASE: string
  readonly VITE_DEVTO_API_BASE: string
  readonly VITE_REMOTIVE_API_BASE: string
  readonly VITE_ARBEITNOW_API_BASE: string
  /** Set to `false` to use in-memory mocks and skip all third-party fetches. */
  readonly VITE_ENABLE_EXTERNAL_DATA: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
