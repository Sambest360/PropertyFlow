/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_SUPABASE_URL?: string
    readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string
    readonly VITE_ENABLE_API?: string
    readonly VITE_API_BASE?: string
    readonly VITE_DEMO_SWITCHER?: string
    readonly VITE_STAFF_INVITE?: string
    readonly VITE_GOOGLE_MAPS_API_KEY?: string
  }
  
  interface ImportMeta {
    readonly env: ImportMetaEnv
  }
  