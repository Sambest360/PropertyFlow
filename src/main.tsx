import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { purgeSensitiveLocalCache } from './lib/auth/sensitiveStorage'
import './index.css'
import App from './App.tsx'

purgeSensitiveLocalCache()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
