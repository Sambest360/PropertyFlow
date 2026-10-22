import { beforeEach, describe, expect, it, vi } from 'vitest'

const captureServerError = vi.fn()

vi.mock('./sentry.js', () => ({
  captureServerError: (...args: unknown[]) => captureServerError(...args),
  initServerSentry: vi.fn(),
  flushServerSentry: vi.fn(async () => undefined),
}))

describe('errStatus sentry capture', () => {
  beforeEach(() => {
    captureServerError.mockClear()
  })

  it('captures when resolved status is 500', async () => {
    const { errStatus } = await import('./errStatus.js')
    const status = errStatus(new Error('boom'))
    expect(status).toBe(500)
    expect(captureServerError).toHaveBeenCalledTimes(1)
    expect(captureServerError).toHaveBeenCalledWith(expect.any(Error), { status: 500 })
  })

  it('does not capture for 403 policy errors', async () => {
    const { errStatus } = await import('./errStatus.js')
    const status = errStatus(Object.assign(new Error('nope'), { status: 403 }))
    expect(status).toBe(403)
    expect(captureServerError).not.toHaveBeenCalled()
  })
})
