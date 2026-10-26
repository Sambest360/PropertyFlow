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

  it('reports a logged route error (caught and answered 500, never thrown)', async () => {
    const { createServer } = await import('node:http')
    const bodies: string[] = []
    const server = createServer((req, res) => {
      let body = ''
      req.on('data', (d) => (body += d))
      req.on('end', () => {
        bodies.push(body)
        res.end('{}')
      })
    })
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
    const { port } = server.address() as { port: number }
    process.env.SENTRY_DSN = `http://publickey@127.0.0.1:${port}/1`
    const quiet = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    try {
      const { initServerSentry } = await import('./sentry.js')
      const Sentry = await import('@sentry/node')
      initServerSentry()
      console.error('[api/public/marketplace]', 'function unit_listing_limit_snapshot(uuid) does not exist')
      await Sentry.flush(2000)
    } finally {
      quiet.mockRestore()
      server.close()
    }
    expect(bodies.join('\n')).toContain('unit_listing_limit_snapshot(uuid) does not exist')
  })
})
