import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { purgeStaleSupabaseAuthCookiesFromEnv } from './lib/auth/supabaseCookieHygiene'

if (typeof window !== 'undefined') {
  purgeStaleSupabaseAuthCookiesFromEnv()
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
