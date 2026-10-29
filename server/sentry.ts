import * as Sentry from '@sentry/node'
import { runningCommitSha } from './appConfig.js'
import { scrubEvent } from '../src/lib/monitoring/scrubPii.js'

let enabled = false
let pending = false

export function initServerSentry(): void {
  if (enabled || !process.env.SENTRY_DSN?.trim()) return
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    release: runningCommitSha() ?? undefined,
    environment: process.env.NODE_ENV || 'development',
    sendDefaultPii: false,
    tracesSampleRate: 0,
    // Routes catch most failures, log `[route] message` and answer 500 without
    // rethrowing (the guest marketplace outage never reached onError). Report
    // every console.error so those surface too.
    integrations: [Sentry.captureConsoleIntegration({ levels: ['error'] })],
    beforeSend: scrubEvent,
    beforeBreadcrumb: (b) => scrubEvent(b),
  })
  enabled = true
}

export function captureServerError(
  err: unknown,
  ctx?: { route?: string; method?: string; status?: number },
): void {
  if (!enabled) return
  pending = true
  Sentry.withScope((scope) => {
    if (ctx) {
      scope.setContext('request', {
        route: ctx.route,
        method: ctx.method,
        status: ctx.status,
      })
    }
    Sentry.captureException(err)
  })
}

export async function flushServerSentry(timeoutMs = 2000): Promise<void> {
  if (!enabled || !pending) return
  pending = false
  try {
    await Sentry.flush(timeoutMs)
  } catch {
    // ignore flush failures
  }
}
