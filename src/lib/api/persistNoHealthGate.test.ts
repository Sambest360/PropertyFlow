/**
 * Postgres-API saves must not wait on, or fail because of, GET /api/health.
 *
 * Live /api/health pings the database and answered in 1.3-2.3 s. The old
 * quickHealth() aborted it after 800 ms and every save returned false without
 * posting. Each save now posts and the server's answer decides.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./config', () => ({ isApiEnabled: true, isSupabaseMode: false }))
vi.mock('../supabase/persist', () => ({
  persistToSupabase: vi.fn(async () => true),
  persistBatchToSupabase: vi.fn(async () => true),
  supabaseMarkNotificationsRead: vi.fn(async () => true),
}))
vi.mock('./actorAuth', () => ({ actorHeaders: () => ({}) }))
vi.mock('./authClient', () => ({ authHeaders: () => ({}) }))
vi.mock('../bootstrapMerge', () => ({ markLocalPersistWrite: vi.fn() }))

type HealthMode = 'slow' | 'failing' | 'network-error'
type WriteMode = 'ok' | 'refused' | 'network-error'

const calls: string[] = []

function stubFetch(health: HealthMode, write: WriteMode) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      calls.push(`${init?.method ?? 'GET'} ${url}`)
      if (url.endsWith('/api/health')) {
        if (health === 'failing') return Response.json({ ok: false }, { status: 503 })
        if (health === 'network-error') throw new TypeError('Failed to fetch')
        // Slow: never answers unless aborted. A save that waited on it would hang.
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('The operation was aborted.', 'AbortError')),
          )
        })
      }
      if (write === 'network-error') throw new TypeError('Failed to fetch')
      if (write === 'refused') {
        return Response.json({ error: 'forbidden', message: 'Forbidden' }, { status: 403 })
      }
      return Response.json({ ok: true })
    }),
  )
}

const HEALTH_MODES: HealthMode[] = ['slow', 'failing', 'network-error']

describe('persist does not gate saves on /api/health', () => {
  beforeEach(() => {
    calls.length = 0
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  describe.each(HEALTH_MODES)('with /api/health %s', (health) => {
    it('persistToApi posts /api/persist and returns the server answer', async () => {
      stubFetch(health, 'ok')
      const { persistToApi } = await import('./persist')
      const ok = await persistToApi({
        resource: 'tenancy',
        action: 'upsert',
        id: 'TN-1',
        data: { id: 'TN-1' },
      })
      expect(ok).toBe(true)
      expect(calls).toContain('POST /api/persist')
      expect(calls).not.toContain('GET /api/health')
    })

    it('queueUpsert posts /api/persist', async () => {
      stubFetch(health, 'ok')
      const { queueUpsert } = await import('./persist')
      queueUpsert('payout_instruction', 'PO-1', { amountZar: 100 })
      await vi.waitFor(() => expect(calls).toContain('POST /api/persist'))
      expect(calls).not.toContain('GET /api/health')
    })

    it('persistBatchToApi posts /api/persist/batch and returns the server answer', async () => {
      stubFetch(health, 'ok')
      const { persistBatchToApi } = await import('./persist')
      const ok = await persistBatchToApi([
        { resource: 'payment', action: 'upsert', id: 'PAY-1', data: { id: 'PAY-1' } },
      ])
      expect(ok).toBe(true)
      expect(calls).toContain('POST /api/persist/batch')
      expect(calls).not.toContain('GET /api/health')
    })

    it('persistApproveApplication posts the approve route and returns the server answer', async () => {
      stubFetch(health, 'ok')
      const { persistApproveApplication } = await import('./persist')
      const ok = await persistApproveApplication({ applicationId: 'APP-1', actorUserId: 'u-james' })
      expect(ok).toBe(true)
      expect(calls).toContain('POST /api/applications/APP-1/approve')
      expect(calls).not.toContain('GET /api/health')
    })

    it('persistMarkNotificationsRead posts mark-read and returns the server answer', async () => {
      stubFetch(health, 'ok')
      const { persistMarkNotificationsRead } = await import('./persist')
      const ok = await persistMarkNotificationsRead({ ids: ['N-1'], userId: 'u-james' })
      expect(ok).toBe(true)
      expect(calls).toContain('POST /api/notifications/mark-read')
      expect(calls).not.toContain('GET /api/health')
    })
  })

  describe.each(['refused', 'network-error'] as const)('a %s POST still fails the save', (write) => {
    it('persistToApi returns false', async () => {
      stubFetch('slow', write)
      const { persistToApi } = await import('./persist')
      const ok = await persistToApi({
        resource: 'application',
        action: 'upsert',
        id: 'APP-1',
        data: { id: 'APP-1' },
      })
      expect(ok).toBe(false)
      expect(calls).toContain('POST /api/persist')
    })

    it('persistBatchToApi returns false', async () => {
      stubFetch('slow', write)
      const { persistBatchToApi } = await import('./persist')
      const ok = await persistBatchToApi([
        { resource: 'payment', action: 'upsert', id: 'PAY-1', data: { id: 'PAY-1' } },
      ])
      expect(ok).toBe(false)
      expect(calls).toContain('POST /api/persist/batch')
    })

    it('persistApproveApplication returns false', async () => {
      stubFetch('slow', write)
      const { persistApproveApplication } = await import('./persist')
      expect(await persistApproveApplication({ applicationId: 'APP-1' })).toBe(false)
      expect(calls).toContain('POST /api/applications/APP-1/approve')
    })

    it('persistMarkNotificationsRead returns false', async () => {
      stubFetch('slow', write)
      const { persistMarkNotificationsRead } = await import('./persist')
      expect(await persistMarkNotificationsRead({ all: true, userId: 'u-james' })).toBe(false)
      expect(calls).toContain('POST /api/notifications/mark-read')
    })
  })
})
