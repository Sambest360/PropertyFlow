import { afterEach, describe, expect, it, vi } from 'vitest'
import { postDepositTransition } from './trustDepositsApi'

/** Follow-up to #80: deposit release propose / approve go through the server routes. */
describe('postDepositTransition', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('POSTs to the dual-control route and returns the server patch', async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        ok: true,
        deposit: { id: 'dh-1', status: 'release_proposed', releaseProposedBy: 'u-a', releaseApprovedBy: null, updatedAt: '2026-10-09T10:00:00.000Z' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const res = await postDepositTransition('dh 1', 'propose-release')
    expect(res).toEqual({
      ok: true,
      deposit: { id: 'dh-1', status: 'release_proposed', releaseProposedBy: 'u-a', releaseApprovedBy: null, updatedAt: '2026-10-09T10:00:00.000Z' },
    })
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/trust/deposits/dh%201/propose-release')
    expect(init.method).toBe('POST')
    expect(init.credentials).toBe('include')
  })

  it('surfaces the server refusal (e.g. the two-person rule) as ok:false', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({ error: 'deposit_approve_release_failed', message: 'Dual control: the proposer cannot approve their own deposit release' }, { status: 403 }),
      ),
    )
    const res = await postDepositTransition('dh-1', 'approve-release')
    expect(res).toEqual({ ok: false, status: 403, error: 'Dual control: the proposer cannot approve their own deposit release' })
  })

  it('a network failure is ok:false, never a silent success', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    expect(await postDepositTransition('dh-1', 'approve-release')).toEqual({ ok: false, error: 'offline' })
  })
})
