import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import * as Sentry from '@sentry/react'
import './index.css'
import App from './App.tsx'
import CrashFallback from './components/CrashFallback.tsx'
import { scrubEvent } from './lib/monitoring/scrubPii'

const sentryDsn = import.meta.env.VITE_SENTRY_DSN as string | undefined
if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    release: import.meta.env.VITE_SENTRY_RELEASE as string | undefined,
    environment:
      (import.meta.env.VITE_SENTRY_ENVIRONMENT as string | undefined) ??
      (import.meta.env.PROD ? 'production' : 'development'),
    sendDefaultPii: false,
    tracesSampleRate: 0.02,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    integrations: [Sentry.browserTracingIntegration()],
    beforeSend: scrubEvent,
    beforeBreadcrumb: (b) => scrubEvent(b),
    ignoreErrors: [
      'ResizeObserver loop limit exceeded',
      'ResizeObserver loop completed with undelivered notifications',
      /^AbortError/,
    ],
  })
}

const rootEl = document.getElementById('root')!
const rootOptions = sentryDsn
  ? {
      onUncaughtError: Sentry.reactErrorHandler(),
      onCaughtError: Sentry.reactErrorHandler(),
      onRecoverableError: Sentry.reactErrorHandler(),
    }
  : undefined

createRoot(rootEl, rootOptions).render(
  <StrictMode>
    <Sentry.ErrorBoundary fallback={<CrashFallback />}>
      <App />
    </Sentry.ErrorBoundary>
  </StrictMode>,
)
