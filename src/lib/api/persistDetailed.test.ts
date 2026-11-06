import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { persistToApiDetailed } from './persist'

vi.mock('./config', () => ({
  isApiEnabled: true,
}))

describe('persistToApiDetailed', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns server error message on 400', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 400,
      headers: { get: () => 'application/json' },
      text: async () => JSON.stringify({ message: 'agent not resolved: u-missing' }),
    } as Response)

    const result = await persistToApiDetailed({
      resource: 'unit',
      action: 'upsert',
      id: 'unt-test',
      data: { id: 'unt-test' },
    })

    expect(result).toEqual({ ok: false, error: 'agent not resolved: u-missing' })
  })

  it('saves of the same record go out one at a time, in order', async () => {
    const order: string[] = []
    let release: () => void = () => {}
    vi.mocked(fetch)
      .mockImplementationOnce(async (_u, init) => {
        order.push(`start ${JSON.parse(String(init?.body)).data.step}`)
        await new Promise<void>((r) => (release = r))
        order.push('end 1')
        return { ok: true, status: 200, headers: { get: () => 'application/json' }, text: async () => '{"ok":true}' } as Response
      })
      .mockImplementationOnce(async (_u, init) => {
        order.push(`start ${JSON.parse(String(init?.body)).data.step}`)
        return { ok: true, status: 200, headers: { get: () => 'application/json' }, text: async () => '{"ok":true}' } as Response
      })
    const a = persistToApiDetailed({ resource: 'application', action: 'upsert', id: 'APP-1', data: { id: 'APP-1', step: 1 } })
    const b = persistToApiDetailed({ resource: 'application', action: 'upsert', id: 'APP-1', data: { id: 'APP-1', step: 2 } })
    await new Promise((r) => setTimeout(r, 10))
    expect(order).toEqual(['start 1'])
    release()
    await Promise.all([a, b])
    expect(order).toEqual(['start 1', 'end 1', 'start 2'])
  })
})

describe('slimApplicationPayload', () => {
  it('sends only the file being uploaded; other documents go without their content', async () => {
    const { slimApplicationPayload } = await import('./persist')
    const out = slimApplicationPayload({
      id: 'APP-1',
      __uploadDocKey: 'fica',
      documents: [
        { key: 'id', status: 'verified', file: { name: 'id.pdf', dataUrl: 'data:x' } },
        { key: 'fica', status: 'uploaded', file: { name: 'fica.pdf', dataUrl: 'data:y' } },
        { key: 'bank', status: 'required' },
      ],
    })!
    expect(out.__uploadDocKey).toBeUndefined()
    expect(out.documents).toEqual([
      { key: 'id', status: 'verified', file: null },
      { key: 'fica', status: 'uploaded', file: { name: 'fica.pdf', dataUrl: 'data:y' } },
      { key: 'bank', status: 'required' },
    ])
  })
})
