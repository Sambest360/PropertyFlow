import { describe, expect, it, vi } from 'vitest'

vi.mock('../../utils/supabase/client', () => ({ createClient: () => ({}) }))

describe('CR10 N4: the Supabase bootstrap never reads users.metadata.signature', () => {
  it('selects only named metadata keys, never the whole metadata column or signature', async () => {
    const { USERS_SELECT } = await import('./data')
    expect(USERS_SELECT).not.toMatch(/signature/i)
    expect(USERS_SELECT.split(',').map((c) => c.trim())).not.toContain('metadata')
    expect(USERS_SELECT).toContain('meta_frontend_id:metadata->frontend_id')
  })
  it('rebuilds metadata from the path columns', async () => {
    const { rebuildUserMetadata } = await import('./data')
    expect(rebuildUserMetadata({ id: 'x', meta_frontend_id: 'u-1', meta_company: null })).toEqual({ id: 'x', metadata: { frontend_id: 'u-1' } })
  })
})
