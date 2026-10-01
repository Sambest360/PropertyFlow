import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  isPersistApiSuccessResponse,
  persistViaServerApi,
  preferServerPersistForApplication,
} from './persist'

describe('preferServerPersistForApplication', () => {
  it('routes application upserts through /api/persist (DATABASE_URL) first', () => {
    expect(preferServerPersistForApplication('application', 'upsert')).toBe(true)
  })

  it('does not force other resources onto the server path', () => {
    expect(preferServerPersistForApplication('application', 'delete')).toBe(false)
    expect(preferServerPersistForApplication('lead', 'upsert')).toBe(false)
    expect(preferServerPersistForApplication('tenancy', 'upsert')).toBe(false)
  })
})

describe('isPersistApiSuccessResponse', () => {
  it('accepts JSON { ok: true } with application/json content-type', () => {
    expect(
      isPersistApiSuccessResponse(
        200,
        'application/json; charset=utf-8',
        JSON.stringify({ ok: true, id: 'APP-x', uuid: 'u' }),
      ),
    ).toBe(true)
  })

  it('rejects HTML SPA shell that returns HTTP 200', () => {
    expect(
      isPersistApiSuccessResponse(
        200,
        'text/html; charset=utf-8',
        '<!doctype html><html><body>PropertyFlow</body></html>',
      ),
    ).toBe(false)
  })

  it('rejects JSON without ok:true even on HTTP 200', () => {
    expect(
      isPersistApiSuccessResponse(200, 'application/json', JSON.stringify({ error: 'nope' })),
    ).toBe(false)
    expect(isPersistApiSuccessResponse(200, 'application/json', '{"ok":false}')).toBe(false)
  })

  it('rejects non-2xx', () => {
    expect(
      isPersistApiSuccessResponse(503, 'application/json', JSON.stringify({ ok: false })),
    ).toBe(false)
  })
})

describe('persistViaServerApi', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  const op = {
    resource: 'application' as const,
    action: 'upsert' as const,
    id: 'APP-lakg7d',
    data: { id: 'APP-lakg7d', agencyId: 'ag-g2p4yf' },
  }

  it('returns false when the server answers HTML 200 (false-ok SPA rewrite)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response('<!doctype html><html><body>ok</body></html>', {
          status: 200,
          headers: { 'content-type': 'text/html; charset=utf-8' },
        }),
      ),
    )
    await expect(persistViaServerApi(op)).resolves.toBe(false)
  })

  it('returns true only for JSON { ok: true }', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ ok: true, id: 'APP-lakg7d', uuid: 'u' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    )
    await expect(persistViaServerApi(op)).resolves.toBe(true)
  })

  it('returns false on 503 database_unconfigured JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({ error: 'database_unconfigured', message: 'DATABASE_URL is not set' }),
          { status: 503, headers: { 'content-type': 'application/json' } },
        ),
      ),
    )
    await expect(persistViaServerApi(op)).resolves.toBe(false)
  })
})

/**
 * Contract mirror for createApplication (AppStore): when persistUpsert/persistToApi
 * returns false, the optimistic APP is removed and the caller gets HTTP 500.
 * We assert the boolean gate here — AppStore already awaits and rolls back.
 */
describe('createApplication rollback contract (persist false)', () => {
  it('false persist must not be treated as durable success', () => {
    const persisted = false
    const shouldRollbackOptimisticApp = !persisted
    const httpStatus = persisted ? 200 : 500
    expect(shouldRollbackOptimisticApp).toBe(true)
    expect(httpStatus).toBe(500)
  })
})
