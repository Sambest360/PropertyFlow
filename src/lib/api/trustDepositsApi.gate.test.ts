import { afterEach, describe, expect, it, vi } from 'vitest'
import { setWriteGateHydration } from '../auth/writeGate'
import { setApiActor } from './actorAuth'

describe('trustDepositsApi write gate', () => {
  afterEach(() => {
    setWriteGateHydration(null)
    setApiActor(null)
  })

  it('blocks deposit transitions until hydration matches session user', async () => {
    setApiActor({ userId: 'u-staff', role: 'agent_admin', agencyId: 'ag-1' })
    setWriteGateHydration(null)
    const { postDepositTransition } = await import('./trustDepositsApi')
    const r = await postDepositTransition('dep-1', 'propose-release')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/still loading/i)
  })
})
