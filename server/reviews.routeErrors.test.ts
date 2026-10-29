import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'
import { reviewError } from './reviewError.js'

/**
 * GET /api/reviews is public: a database fault must not reach visitors as raw
 * driver text. 4xx messages ("Listing not found") still do. server/index.ts
 * answers every reviews route through reviewError.
 */
function appThrowing(err: unknown) {
  const app = new Hono()
  app.get('/api/reviews', (c) => {
    try {
      throw err
    } catch (e) {
      return reviewError(c, 'reviews_failed', e)
    }
  })
  return app
}

describe('reviews route errors', () => {
  it('a database fault answers a generic message and logs the detail', async () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await appThrowing(new Error('relation "reviews" does not exist at character 42')).request('/api/reviews')
    expect(res.status).toBe(500)
    const body = (await res.json()) as { error: string; message: string }
    expect(body).toEqual({ error: 'reviews_failed', message: 'Reviews are unavailable right now. Try again shortly.' })
    expect(quiet.mock.calls.some((c) => c.join(' ').includes('relation "reviews"'))).toBe(true)
    quiet.mockRestore()
  })

  it('a 4xx keeps its message', async () => {
    const res = await appThrowing(Object.assign(new Error('Listing not found'), { status: 404 })).request('/api/reviews')
    expect(res.status).toBe(404)
    expect(((await res.json()) as { message: string }).message).toBe('Listing not found')
  })

  it('server/index.ts uses it for every reviews route', async () => {
    const { readFileSync } = await import('node:fs')
    const src = readFileSync(new URL('./index.ts', import.meta.url), 'utf8')
    for (const code of ['reviews_failed', 'review_failed', 'review_action_failed', 'review_queue_failed']) {
      expect(src).toContain(`return reviewError(c, '${code}', err)`)
    }
  })
})
