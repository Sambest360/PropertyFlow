import { describe, expect, it, vi } from 'vitest'
import { ensureLeaseEnvelopeForSign, leaseSignatureSaved, LEASE_SIGNATURE_NOT_RECORDED } from './leaseSignatureOrdering'

type L = { id: string; eSign?: { envelopeId?: string | null } | null }

describe('CR10 fix 6 / B3: modal sign with no envelope', () => {
  it('issues through the existing path, waits for the envelope save, then returns the lease to stamp', async () => {
    const order: string[] = []
    const issue = vi.fn(async (l: L) => (order.push('issue'), { ...l, eSign: { envelopeId: 'ENV-1' } }))
    let release!: (v: boolean) => void
    const save = new Promise<boolean>((r) => (release = r))
    const p = ensureLeaseEnvelopeForSign<L>({ id: 'L-1' }, { issue, envelopeSave: () => save.then((v) => (order.push('saved'), v)) })
    await Promise.resolve()
    expect(order).toEqual(['issue'])
    release(true)
    expect((await p)?.eSign?.envelopeId).toBe('ENV-1')
    expect(order).toEqual(['issue', 'saved'])
  })
  it('refuses (null) when no envelope could be issued or its save failed', async () => {
    expect(await ensureLeaseEnvelopeForSign<L>({ id: 'L-1' }, { issue: async (l) => l, envelopeSave: () => undefined })).toBeNull()
    expect(
      await ensureLeaseEnvelopeForSign<L>({ id: 'L-1' }, { issue: async (l) => ({ ...l, eSign: { envelopeId: 'E' } }), envelopeSave: async () => false }),
    ).toBeNull()
  })
  it('the stage moves only after the stamped lease save resolves true', async () => {
    let release!: (v: boolean) => void
    const stampSave = new Promise<boolean>((r) => (release = r))
    let moved = false
    const gate = leaseSignatureSaved(stampSave, 'staff').then((r) => {
      if (!r) moved = true
      return r
    })
    await Promise.resolve()
    expect(moved).toBe(false)
    release(true)
    expect(await gate).toBeNull()
    expect(moved).toBe(true)
    expect(await leaseSignatureSaved(Promise.resolve(false), 'staff')).toMatchObject({ code: LEASE_SIGNATURE_NOT_RECORDED })
  })
})
