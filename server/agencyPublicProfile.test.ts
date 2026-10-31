import { beforeEach, describe, expect, it, vi } from 'vitest'

const query = vi.fn()
vi.mock('./db.js', () => ({ query: (...a: unknown[]) => query(...a) }))
vi.mock('./entityMap.js', () => ({ resolveUuid: async () => null }))

import {
  canEditAgencyProfile,
  canSetUserPhoto,
  cleanProfileEdit,
  listingContactForUnit,
  readPublicProfile,
  saveAgencyProfile,
  setUserPhoto,
} from './agencyPublicProfile'
import type { DemoActor } from './actor'

const AG_A = '11111111-1111-4111-8111-111111111111'
const AG_B = '22222222-2222-4222-8222-222222222222'
const ADMIN_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const AGENT_A = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const AGENT_B = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const LANDLORD = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'

const actor = (userId: string, role: string): DemoActor => ({ userId, role, agencyId: null }) as unknown as DemoActor

/** users rows: id → client_id, role, phone, names, avatar. */
const USERS: Record<string, { client_id: string | null; role: string; first_name: string; last_name: string; phone: string | null; avatar_url: string | null; active?: boolean }> = {
  [ADMIN_A]: { client_id: AG_A, role: 'AGENCY_ADMIN', first_name: 'Ann', last_name: 'Admin', phone: '041 000 0000', avatar_url: null },
  [AGENT_A]: { client_id: AG_A, role: 'GROUND_AGENT', first_name: 'Meryl', last_name: 'Agent', phone: '082 123 4567', avatar_url: '/api/files/agency/a/avatars/2026-10/x.jpg' },
  [AGENT_B]: { client_id: AG_B, role: 'GROUND_AGENT', first_name: 'Bob', last_name: 'Other', phone: '083 000 0000', avatar_url: null },
  [LANDLORD]: { client_id: AG_A, role: 'LANDLORD', first_name: 'Lee', last_name: 'Owner', phone: '084 555 1234', avatar_url: null },
}

let unitRow: { client_id: string | null; agent_id: string | null; landlord_id: string | null }

beforeEach(() => {
  query.mockReset()
  unitRow = { client_id: AG_A, agent_id: AGENT_A, landlord_id: LANDLORD }
  query.mockImplementation(async (sql: string, params: unknown[] = []) => {
    if (sql.includes('FROM units u')) return [unitRow]
    if (sql.includes('FROM clients WHERE id::text = $1')) return [{ id: params[0] }]
    if (sql.includes('company_name, trading_as')) {
      return [{ company_name: 'Horizon Realty (Pty) Ltd', trading_as: 'Horizon Realty', city: 'Gqeberha', province: 'Eastern Cape', status: 'active', profile: { phone: '041 111 2222', website: 'https://horizon.example', secret: 'x' } }]
    }
    if (sql.includes("settings->'publicProfile' AS profile FROM clients")) return [{ profile: { logoUrl: '/api/files/agency/a/branding/2026-10/logo.png' } }]
    if (sql.startsWith('UPDATE')) return []
    if (sql.includes('SELECT client_id::text AS client_id FROM users')) return [{ client_id: USERS[String(params[0])]?.client_id ?? null }]
    if (sql.includes('client_id::text AS client_id, role, avatar_url')) {
      const u = USERS[String(params[0])]
      return u ? [{ id: params[0], client_id: u.client_id, role: u.role, avatar_url: u.avatar_url }] : []
    }
    if (sql.includes('SELECT first_name, last_name, role, phone, avatar_url')) {
      const u = USERS[String(params[0])]
      if (!u || u.active === false) return []
      if (sql.includes('client_id = $2') && u.client_id !== params[1]) return []
      if (sql.includes('role = ANY') && !(params[2] as string[]).includes(u.role)) return []
      if (sql.includes("role = 'LANDLORD'") && u.role !== 'LANDLORD') return []
      return [u]
    }
    return []
  })
})

describe('listing contact cards', () => {
  it('shows the agency public profile and the assigned agent (no email, no extra keys)', async () => {
    const out = await listingContactForUnit('unit-1')
    expect(out.agency).toEqual({
      name: 'Horizon Realty',
      area: 'Gqeberha, Eastern Cape',
      phone: '041 111 2222',
      email: null,
      website: 'https://horizon.example',
      address: null,
      description: null,
      logoUrl: null,
    })
    expect(out.person).toEqual({ name: 'Meryl Agent', role: 'Agent', photoUrl: '/api/files/agency/a/avatars/2026-10/x.jpg', phone: '082 123 4567' })
  })

  it('ignores an agent from another agency and falls back to the landlord', async () => {
    unitRow = { client_id: AG_A, agent_id: AGENT_B, landlord_id: LANDLORD }
    const out = await listingContactForUnit('unit-1')
    expect(out.person).toEqual({ name: 'Lee Owner', role: 'Owner', photoUrl: null, phone: '084 555 1234' })
  })

  it('never shows the landlord when an agent is assigned', async () => {
    const out = await listingContactForUnit('unit-1')
    expect(JSON.stringify(out)).not.toContain('Lee')
  })

  it('no person when there is no agent and no landlord', async () => {
    unitRow = { client_id: AG_A, agent_id: null, landlord_id: null }
    expect((await listingContactForUnit('unit-1')).person).toBeNull()
  })
})

describe('agency profile edits', () => {
  it('only reads contact fields; validates phone, email and website', () => {
    expect(cleanProfileEdit({ name: 'New name', company_name: 'X', phone: ' 041  111 2222 ', email: 'a@b.co', website: 'horizon.co.za', plan: 'pro' })).toEqual({
      phone: '041 111 2222',
      email: 'a@b.co',
      website: 'https://horizon.co.za',
      address: null,
      description: null,
    })
    expect(() => cleanProfileEdit({ phone: 'call me' })).toThrow(/phone/)
    expect(() => cleanProfileEdit({ email: 'nope' })).toThrow(/email/)
    expect(() => cleanProfileEdit({ website: 'javascript:alert(1)' })).toThrow(/website/)
  })

  it('drops inline data-URL and unsafe logos when reading', () => {
    expect(readPublicProfile({ logoUrl: 'data:image/png;base64,AAAA' }).logoUrl).toBeNull()
    expect(readPublicProfile({ logoUrl: 'javascript:x' }).logoUrl).toBeNull()
    expect(readPublicProfile(null).phone).toBeNull()
  })

  it('agency admins edit only their own agency; super admins any; agents none', () => {
    expect(canEditAgencyProfile('client_admin', AG_A, AG_A)).toBe(true)
    expect(canEditAgencyProfile('agent_admin', AG_A, AG_A)).toBe(true)
    expect(canEditAgencyProfile('client_admin', AG_A, AG_B)).toBe(false)
    expect(canEditAgencyProfile('ground_agent', AG_A, AG_A)).toBe(false)
    expect(canEditAgencyProfile('super_admin', null, AG_B)).toBe(true)
  })

  it('refuses another agency’s admin on the server and never writes the name', async () => {
    await expect(saveAgencyProfile(actor(ADMIN_A, 'client_admin'), AG_B, { phone: '041 222 3333' }, vi.fn())).rejects.toMatchObject({ status: 403 })
    await saveAgencyProfile(actor(ADMIN_A, 'client_admin'), AG_A, { name: 'Hacked', phone: '041 222 3333' }, vi.fn())
    const update = query.mock.calls.find((c) => String(c[0]).startsWith('UPDATE clients'))!
    expect(String(update[0])).not.toMatch(/company_name/)
    expect(JSON.parse(String((update[1] as unknown[])[1]))).toMatchObject({ phone: '041 222 3333', logoUrl: '/api/files/agency/a/branding/2026-10/logo.png' })
    expect(String((update[1] as unknown[])[1])).not.toContain('Hacked')
  })
})

describe('profile photos', () => {
  const upload = vi.fn(async (_d: string, folder: string) => `/api/files/${folder}/p.jpg`)
  const yes = async () => true
  const no = async () => false

  it('rules: self (staff), own-agency admin with users.manage, super admin', () => {
    const target = { id: AGENT_A, clientId: AG_A, dbRole: 'GROUND_AGENT' }
    expect(canSetUserPhoto({ role: 'ground_agent', uuid: AGENT_A, clientId: AG_A, usersManage: false }, target)).toBe(true)
    expect(canSetUserPhoto({ role: 'ground_agent', uuid: AGENT_B, clientId: AG_A, usersManage: false }, target)).toBe(false)
    expect(canSetUserPhoto({ role: 'client_admin', uuid: ADMIN_A, clientId: AG_A, usersManage: true }, target)).toBe(true)
    expect(canSetUserPhoto({ role: 'client_admin', uuid: ADMIN_A, clientId: AG_A, usersManage: false }, target)).toBe(false)
    expect(canSetUserPhoto({ role: 'client_admin', uuid: ADMIN_A, clientId: AG_B, usersManage: true }, target)).toBe(false)
    expect(canSetUserPhoto({ role: 'client_admin', uuid: ADMIN_A, clientId: AG_A, usersManage: true }, { id: LANDLORD, clientId: AG_A, dbRole: 'LANDLORD' })).toBe(false)
    expect(canSetUserPhoto({ role: 'tenant', uuid: LANDLORD, clientId: AG_A, usersManage: false }, { id: LANDLORD, clientId: AG_A, dbRole: 'END_USER' })).toBe(false)
    expect(canSetUserPhoto({ role: 'super_admin', uuid: null, clientId: null, usersManage: false }, target)).toBe(true)
  })

  it('agency admin sets own staff photo into the agency folder', async () => {
    const r = await setUserPhoto(actor(ADMIN_A, 'client_admin'), AGENT_A, 'data:image/jpeg;base64,AAAA', yes, upload)
    expect(r.avatarUrl).toBe(`/api/files/agency/${AG_A}/avatars/p.jpg`)
  })

  it('refuses another agency’s staff and an admin without users.manage', async () => {
    await expect(setUserPhoto(actor(ADMIN_A, 'client_admin'), AGENT_B, 'data:image/jpeg;base64,AAAA', yes, upload)).rejects.toMatchObject({ status: 403 })
    await expect(setUserPhoto(actor(ADMIN_A, 'client_admin'), AGENT_A, 'data:image/jpeg;base64,AAAA', no, upload)).rejects.toMatchObject({ status: 403 })
  })

  it('removes with null and rejects non-image payloads', async () => {
    expect(await setUserPhoto(actor(AGENT_A, 'ground_agent'), AGENT_A, null, no, upload)).toEqual({ avatarUrl: null })
    await expect(setUserPhoto(actor(AGENT_A, 'ground_agent'), AGENT_A, 'https://evil.example/x.jpg', no, upload)).rejects.toMatchObject({ status: 400 })
  })
})
