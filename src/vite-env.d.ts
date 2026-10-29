/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_ENABLE_API?: string
    readonly VITE_API_BASE?: string
    readonly VITE_DEMO_SWITCHER?: string
    readonly VITE_GOOGLE_MAPS_API_KEY?: string
    readonly VITE_SENTRY_DSN?: string
    readonly VITE_SENTRY_RELEASE?: string
    readonly VITE_SENTRY_ENVIRONMENT?: string
  }
  
  interface ImportMeta {
    readonly env: ImportMetaEnv
  }
  