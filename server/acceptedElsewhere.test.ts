import { beforeEach, describe, expect, it, vi } from 'vitest'

/** Angela #80 (c3f25ac): "accepted elsewhere" notices are written by the server. */
const query = vi.fn()
vi.mock('./db.js', () => ({ query: (...a: unknown[]) => query(...a) }))

const ACC = '00000000-0000-4000-8000-000000000001'
const SIB = '00000000-0000-4000-8000-000000000002'
const APPLICANT = '00000000-0000-4000-8000-000000000003'
const AGENT_B = '00000000-0000-4000-8000-000000000004'
const ADMIN_B = '00000000-0000-4000-8000-000000000005'
const CB = '00000000-0000-4000-8000-0000000000cb'

beforeEach(() => {
  query.mockReset()
  query.mockImplementation(async (sql: string) => {
    if (sql.includes('FROM applications a LEFT JOIN units un')) {
      return [{ applicant_id: APPLICANT, email: 'tess@example.test', applicant_name: 'Tess', unit_title: 'Humewood B14' }]
    }
    if (sql.includes("a.metadata->>'frontend_id' AS fe")) {
      return [{ id: SIB, fe: 'APP-other', client_id: CB, agent_id: AGENT_B }]
    }
    if (sql.includes('FROM users WHERE client_id = ANY')) {
      return [
        { id: ADMIN_B, client_id: CB, role: 'AGENCY_ADMIN' },
        { id: AGENT_B, client_id: CB, role: 'GROUND_AGENT' },
      ]
    }
    return []
  })
})

describe('notifyAcceptedElsewhereServer', () => {
  it('notifies the other agency (agent + staff, once each) and the applicant', async () => {
    const { notifyAcceptedElsewhereServer } = await import('./acceptedElsewhere.js')
    expect(await notifyAcceptedElsewhereServer(ACC)).toBe(3)
    const inserts = query.mock.calls.filter((c) => String(c[0]).includes('INSERT INTO notifications'))
    const rows = inserts.map((c) => c[1] as unknown[])
    expect(rows.map((r) => r[2]).sort()).toEqual([AGENT_B, ADMIN_B, APPLICANT].sort())
    const staff = rows.find((r) => r[2] === AGENT_B)!
    expect(staff[1]).toBe(CB)
    expect(staff[3]).toBe('Applicant accepted elsewhere')
    expect(String(staff[4])).toContain('Tess was accepted at Humewood B14')
    expect(staff[5]).toBe('/workspace/sales/applications/APP-other')
    const mine = rows.find((r) => r[2] === APPLICANT)!
    expect(mine[3]).toBe('Update on your other application')
  })

  it('never throws (best effort)', async () => {
    query.mockRejectedValue(new Error('db down'))
    const { notifyAcceptedElsewhereServer } = await import('./acceptedElsewhere.js')
    await expect(notifyAcceptedElsewhereServer(ACC)).resolves.toBe(0)
  })

  it('the server acceptance list matches the client', async () => {
    const { ACCEPTANCE_STATUSES } = await import('./acceptedElsewhere.js')
    const { APPLICANT_ACCEPTANCE_STATUSES } = await import('../src/lib/applicantPortalActions')
    expect([...ACCEPTANCE_STATUSES]).toEqual([...APPLICANT_ACCEPTANCE_STATUSES])
  })
})
