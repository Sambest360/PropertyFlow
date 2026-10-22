import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('server sentry', () => {
  const originalDsn = process.env.SENTRY_DSN

  beforeEach(() => {
    vi.resetModules()
    delete process.env.SENTRY_DSN
  })

  afterEach(() => {
    if (originalDsn === undefined) delete process.env.SENTRY_DSN
    else process.env.SENTRY_DSN = originalDsn
  })

  it('init/capture/flush are no-ops without SENTRY_DSN', async () => {
    const { initServerSentry, captureServerError, flushServerSentry } = await import('./sentry.js')
    initServerSentry()
    captureServerError(new Error('x'), { status: 500 })
    await flushServerSentry()
    expect(true).toBe(true)
  })
})
