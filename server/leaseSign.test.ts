import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * CR10: the one server sign function, and the two holes it closes:
 *  1. portal signing accepted any image and a client time;
 *  2. staff lease saves stored eSign whole (could overwrite a tenant's signature).
 */
const query = vi.fn()
const clientCalls: Array<{ sql: string; params: unknown[] }> = []
let failOnUpdate = false

vi.mock('./db.js', () => ({
  databaseConfigured: true,
  query: (...args: unknown[]) => query(...args),
  withTransaction: async (fn: (c: unknown) => Promise<unknown>) => {
    const staged: typeof clientCalls = []
    const client = { staged }
    const out = await fn(client)
    clientCalls.push(...staged) // committed
    return out
  },
  clientQuery: async (client: { staged: typeof clientCalls }, sql: string, params: unknown[] = []) => {
    if (failOnUpdate && sql.includes('UPDATE leases')) throw new Error('update failed')
    client.staged.push({ sql, params })
    return []
  },
}))

const UUID: Record<string, string> = {
  'u-t': 'uuid-t',
  'u-t2': 'uuid-t2',
  'u-ll': 'uuid-ll',
  'u-staff': 'uuid-staff',
  'u-other-staff': 'uuid-os',
  'ag-a': 'client-a',
  'ag-b': 'client-b',
  'L-1': 'lease-1',
}
const sendLeaseSignedEmail = vi.fn()
let emailFlag = false
vi.mock('./mailtrap.js', () => ({
  isEmailLeaseSignedEnabled: () => emailFlag,
  sendLeaseSignedEmail: (...a: unknown[]) => sendLeaseSignedEmail(...a),
}))

vi.mock('./entityMap.js', () => ({
  resolveUuid: async (_t: string, fe: string) => UUID[fe] ?? null,
}))

export const PNG = 'data:image/png;base64,' + 'iVBORw0KGgo'.repeat(8)
export const PNG2 = 'data:image/png;base64,' + 'AAAABBBB'.repeat(8)

let leaseESign: Record<string, unknown>
const storedSig: Record<string, string> = {}

function baseESign(): Record<string, unknown> {
  return {
    status: 'sent',
    provider: 'mock',
    envelopeId: 'ENV-1',
    tenant: { status: 'pending' },
    landlord: { status: 'pending' },
    events: [],
  }
}

beforeEach(() => {
  emailFlag = false
  sendLeaseSignedEmail.mockReset()
  sendLeaseSignedEmail.mockResolvedValue({ sent: true })
  clientCalls.length = 0
  failOnUpdate = false
  leaseESign = baseESign()
  for (const k of Object.keys(storedSig)) delete storedSig[k]
  query.mockReset()
  query.mockImplementation(async (sql: string, params: unknown[] = []) => {
    if (sql.includes('FROM leases WHERE id')) {
      return [
        {
          id: 'lease-1',
          client_id: 'client-a',
          tenant_id: 'uuid-t',
          landlord_id: 'uuid-ll',
          metadata: { eSign: leaseESign },
        },
      ]
    }
    if (sql.includes('AS tenant_email')) {
      return [
        {
          tenant_email: 't@x.test',
          tenant_name: 'Tess',
          landlord_email: 'l@x.test',
          landlord_name: 'Lerato',
          agent_email: 'a@x.test',
          agent_name: 'Agent',
          property_title: '12 Oak St',
        },
      ]
    }
    if (sql.includes('SELECT metadata FROM users')) {
      const s = storedSig[String(params[0])]
      return [{ metadata: s ? { signature: s } : {} }]
    }
    return []
  })
})

const TENANT = { userId: 'u-t', role: 'tenant', agencyId: null }
const OTHER_TENANT = { userId: 'u-t2', role: 'tenant', agencyId: null }
const LANDLORD = { userId: 'u-ll', role: 'landlord', agencyId: null }
const STAFF = { userId: 'u-staff', role: 'agent', agencyId: 'ag-a' }
const OTHER_AGENCY_STAFF = { userId: 'u-other-staff', role: 'agent', agencyId: 'ag-b' }

async function stamp(actor: object, party: 'tenant' | 'landlord', sent: Record<string, unknown>) {
  const { stampLeaseSignature, loadLeaseForSign } = await import('./leaseSign.js')
  const lease = (await loadLeaseForSign('lease-1'))!
  return stampLeaseSignature({
    actor: actor as never,
    tenancyFeId: 'L-1',
    lease,
    party,
    sent,
    meta: { ip: '10.0.0.1', userAgent: 'test-agent' },
  })
}

const updates = () => clientCalls.filter((c) => c.sql.includes('UPDATE leases'))
const storedAfter = () => JSON.parse(String(updates().at(-1)!.params[1])) as Record<string, Record<string, unknown>>

describe('stampLeaseSignature: who may sign which block', () => {
  it('the tenant signs their own block: server time, signer, method, hash, IP and user agent', async () => {
    const res = await stamp(TENANT, 'tenant', {
      status: 'signed',
      method: 'drawn',
      signatureDataUrl: PNG,
      signedAt: '1999-01-01T00:00:00.000Z',
      signerUserId: 'u-someone-else',
    })
    expect(res.signed).toBe(true)
    const t = storedAfter().tenant
    expect(t.signedAt).not.toBe('1999-01-01T00:00:00.000Z')
    expect(Math.abs(Date.parse(String(t.signedAt)) - Date.now())).toBeLessThan(10_000)
    expect(t).toMatchObject({ signerUserId: 'u-t', method: 'drawn', onBehalf: false, ip: '10.0.0.1', userAgent: 'test-agent' })
    expect(t.imageSha256).toMatch(/^[0-9a-f]{64}$/)
    expect(storedAfter().status).toBe('partially_signed')
  })

  it('staff signing the tenant block gets 403 SIGNATURE_NOT_SIGNER, and nothing is written', async () => {
    await expect(stamp(STAFF, 'tenant', { status: 'signed', method: 'drawn', signatureDataUrl: PNG })).rejects.toMatchObject({
      status: 403,
      code: 'SIGNATURE_NOT_SIGNER',
    })
    expect(clientCalls).toHaveLength(0)
  })

  it('another tenant, or staff of another agency, gets 403 SIGNATURE_NOT_SIGNER', async () => {
    await expect(stamp(OTHER_TENANT, 'tenant', { status: 'signed', method: 'drawn', signatureDataUrl: PNG })).rejects.toMatchObject({
      code: 'SIGNATURE_NOT_SIGNER',
    })
    await expect(
      stamp(OTHER_AGENCY_STAFF, 'landlord', { status: 'signed', method: 'drawn', signatureDataUrl: PNG, onBehalfConfirmation: 'x' }),
    ).rejects.toMatchObject({ code: 'SIGNATURE_NOT_SIGNER' })
  })

  it('staff on behalf of the landlord: refused without the mandate tick', async () => {
    await expect(stamp(STAFF, 'landlord', { status: 'signed', method: 'drawn', signatureDataUrl: PNG })).rejects.toMatchObject({
      status: 403,
      code: 'SIGNATURE_ON_BEHALF_UNCONFIRMED',
    })
    expect(clientCalls).toHaveLength(0)
  })

  it('staff on behalf of the landlord with the tick: stored with on_behalf, the staff uuid and the confirmation', async () => {
    const { onBehalfConfirmationText } = await import('./leaseSign.js')
    const confirmation = onBehalfConfirmationText('Lerato Landlord')
    await stamp(STAFF, 'landlord', { status: 'signed', method: 'drawn', signatureDataUrl: PNG, onBehalfConfirmation: confirmation })
    expect(storedAfter().landlord).toMatchObject({
      signerUserId: 'u-staff',
      onBehalf: true,
      onBehalfConfirmation: "I am signing for Lerato Landlord under the agency's mandate.",
    })
  })

  it("staff can't sign on behalf with a saved image (must draw)", async () => {
    await expect(
      stamp(STAFF, 'landlord', { status: 'signed', method: 'saved_image', signatureDataUrl: PNG, onBehalfConfirmation: 'x' }),
    ).rejects.toMatchObject({ code: 'SIGNATURE_NOT_OWN' })
  })

  it("saved_image must match the actor's own stored signature (403 SIGNATURE_NOT_OWN otherwise)", async () => {
    storedSig['uuid-t'] = PNG2
    await expect(stamp(TENANT, 'tenant', { status: 'signed', method: 'saved_image', signatureDataUrl: PNG })).rejects.toMatchObject({
      status: 403,
      code: 'SIGNATURE_NOT_OWN',
    })
    storedSig['uuid-t'] = PNG
    await stamp(TENANT, 'tenant', { status: 'signed', method: 'saved_image', signatureDataUrl: PNG })
    expect(storedAfter().tenant.method).toBe('saved_image')
  })

  it('a non-PNG or oversize image is 400 SIGNATURE_INVALID', async () => {
    await expect(
      stamp(TENANT, 'tenant', { status: 'signed', method: 'drawn', signatureDataUrl: 'data:image/jpeg;base64,AAAA' }),
    ).rejects.toMatchObject({ status: 400, code: 'SIGNATURE_INVALID' })
    await expect(
      stamp(TENANT, 'tenant', { status: 'signed', method: 'drawn', signatureDataUrl: 'data:image/png;base64,' + 'A'.repeat(160_000) }),
    ).rejects.toMatchObject({ status: 400, code: 'SIGNATURE_INVALID' })
    await expect(stamp(TENANT, 'tenant', { status: 'signed', method: 'drawn' })).rejects.toMatchObject({ code: 'SIGNATURE_INVALID' })
  })

  it('paper mark-signed: staff only, no image stored', async () => {
    await expect(stamp(TENANT, 'tenant', { status: 'signed', method: 'paper_mark' })).rejects.toMatchObject({
      code: 'SIGNATURE_NOT_SIGNER',
    })
    await stamp(STAFF, 'tenant', { status: 'signed', method: 'paper_mark', signatureDataUrl: PNG })
    const t = storedAfter().tenant
    expect(t).toMatchObject({ method: 'paper_mark', onBehalf: true, imageSha256: null, signerUserId: 'u-staff' })
    expect(t).not.toHaveProperty('signatureDataUrl')
  })

  it('a signed block is never replaced (forward only)', async () => {
    leaseESign = { ...baseESign(), tenant: { status: 'signed', signatureDataUrl: PNG, signerUserId: 'u-t' } }
    const res = await stamp(TENANT, 'tenant', { status: 'signed', method: 'drawn', signatureDataUrl: PNG2 })
    expect(res.signed).toBe(false)
    expect(clientCalls).toHaveLength(0)
  })
})

describe('hole 2: staff lease saves no longer store eSign whole', () => {
  async function staffSave(actor: object, eSign: unknown, extra: Record<string, unknown> = {}) {
    const { enforceStaffTenancyESign } = await import('./leaseSign.js')
    const body = { id: 'L-1', action: 'upsert', data: { id: 'L-1', rent: 9000, ...extra, ...(eSign === undefined ? {} : { eSign }) } }
    await enforceStaffTenancyESign(actor as never, body)
    return body.data as Record<string, unknown>
  }

  it("staff overwriting the tenant's block with their own image is 403 SIGNATURE_NOT_SIGNER", async () => {
    await expect(
      staffSave(STAFF, { ...baseESign(), tenant: { status: 'signed', method: 'drawn', signatureDataUrl: PNG } }),
    ).rejects.toMatchObject({ status: 403, code: 'SIGNATURE_NOT_SIGNER' })
    expect(clientCalls).toHaveLength(0)
  })

  it("an already signed tenant block can't be replaced or wiped by a staff save", async () => {
    const signedTenant = { status: 'signed', signatureDataUrl: PNG, signerUserId: 'u-t', method: 'drawn' }
    leaseESign = { ...baseESign(), status: 'partially_signed', tenant: signedTenant }
    const data = await staffSave(STAFF, { ...baseESign(), tenant: { status: 'signed', signatureDataUrl: PNG2 } })
    expect((data.eSign as Record<string, unknown>).tenant).toEqual(signedTenant)
    expect((data.eSign as Record<string, unknown>).status).toBe('partially_signed')
    const kept = await staffSave(STAFF, undefined)
    expect((kept.eSign as Record<string, unknown>).tenant).toEqual(signedTenant)
    const nulled = await staffSave(STAFF, null)
    expect((nulled.eSign as Record<string, unknown>).tenant).toEqual(signedTenant)
  })

  it('a client-sent status is ignored; a new envelope starts with pending blocks', async () => {
    const data = await staffSave(STAFF, { ...baseESign(), status: 'completed' })
    expect((data.eSign as Record<string, unknown>).status).toBe('sent')
    const fresh = await staffSave(STAFF, {
      ...baseESign(),
      envelopeId: 'ENV-2',
      status: 'completed',
      tenant: { status: 'signed', signatureDataUrl: PNG },
    })
    expect(fresh.eSign).toMatchObject({ envelopeId: 'ENV-2', status: 'sent', tenant: { status: 'pending' } })
  })

  it('CR10 fix 1: a new envelope is refused while any block is signed; the signed tenant block stays signed', async () => {
    const signedTenant = { status: 'signed', signatureDataUrl: PNG, signerUserId: 'u-t', method: 'drawn' }
    leaseESign = { ...baseESign(), status: 'partially_signed', tenant: signedTenant }
    await expect(staffSave(STAFF, { ...baseESign(), envelopeId: 'ENV-2' })).rejects.toMatchObject({
      status: 403,
      code: 'SIGNATURE_ENVELOPE_LOCKED',
    })
    expect(updates()).toHaveLength(0)
    expect((leaseESign.tenant as Record<string, unknown>).status).toBe('signed')
    const kept = await staffSave(STAFF, undefined)
    expect((kept.eSign as Record<string, unknown>).tenant).toEqual(signedTenant)
  })

  it('a staff on-behalf landlord signing through a lease save goes through the stamp', async () => {
    const data = await staffSave(STAFF, {
      ...baseESign(),
      landlord: { status: 'signed', method: 'drawn', signatureDataUrl: PNG, onBehalfConfirmation: 'I am signing for L.' },
    })
    expect((data.eSign as Record<string, Record<string, unknown>>).landlord).toMatchObject({ onBehalf: true, signerUserId: 'u-staff' })
    expect(updates()).toHaveLength(1)
  })
})

describe('hole 1: portal signing goes through the same stamp', () => {
  it('a tenant portal write with a non-PNG image is 400, and a client time is replaced by the server time', async () => {
    const { enforcePortalWritePolicy } = await import('./portalWritePolicy.js')
    const bad = {
      resource: 'tenancy',
      action: 'upsert',
      id: 'L-1',
      data: { eSign: { ...baseESign(), tenant: { status: 'signed', method: 'drawn', signatureDataUrl: 'data:image/svg+xml;base64,AAAA' } } },
    }
    await expect(enforcePortalWritePolicy(TENANT as never, bad as never, null as never)).rejects.toMatchObject({
      status: 400,
      code: 'SIGNATURE_INVALID',
    })
    const ok = {
      resource: 'tenancy',
      action: 'upsert',
      id: 'L-1',
      data: {
        eSign: {
          ...baseESign(),
          tenant: { status: 'signed', method: 'drawn', signatureDataUrl: PNG, signedAt: '2000-01-01T00:00:00.000Z' },
        },
      },
      requestMeta: { ip: '1.2.3.4', userAgent: 'ua' },
    }
    const out = await enforcePortalWritePolicy(TENANT as never, ok as never, null as never)
    expect(out.handled).toBeTruthy()
    expect(storedAfter().tenant.signedAt).not.toBe('2000-01-01T00:00:00.000Z')
    expect(storedAfter().tenant).toMatchObject({ ip: '1.2.3.4', userAgent: 'ua', signerUserId: 'u-t' })
  })

  it('a landlord portal write signs only the landlord block, never on behalf', async () => {
    const { enforcePortalWritePolicy } = await import('./portalWritePolicy.js')
    await enforcePortalWritePolicy(
      LANDLORD as never,
      { resource: 'tenancy', action: 'upsert', id: 'L-1', data: { eSign: { ...baseESign(), landlord: { status: 'signed', method: 'drawn', signatureDataUrl: PNG } } } } as never,
      null as never,
    )
    expect(storedAfter().landlord).toMatchObject({ onBehalf: false, signerUserId: 'u-ll' })
    expect(storedAfter().tenant).toEqual({ status: 'pending' })
  })
})

describe('CR10 part 4: exactly one lease_signed row per signing, same transaction', () => {
  const events = () => clientCalls.filter((c) => c.sql.includes("'lease_signed'"))
  const payloadOf = (i = 0) => JSON.parse(String(events()[i].params[4])) as Record<string, unknown>

  it('directory (staff for the landlord, through a lease save): one row, on behalf, confirmation, hash, no image', async () => {
    const { enforceStaffTenancyESign } = await import('./leaseSign.js')
    const body = {
      id: 'L-1',
      action: 'upsert',
      data: { eSign: { ...baseESign(), landlord: { status: 'signed', method: 'drawn', signatureDataUrl: PNG, onBehalfConfirmation: "I am signing for L under the agency's mandate." } } },
      requestMeta: { ip: '9.9.9.9', userAgent: 'ua' },
    }
    await enforceStaffTenancyESign(STAFF as never, body)
    expect(events()).toHaveLength(1)
    const p = payloadOf()
    const { sha256Hex } = await import('./leaseSign.js')
    expect(p).toMatchObject({
      tenancyId: 'L-1',
      leaseId: 'lease-1',
      envelopeId: 'ENV-1',
      party: 'landlord',
      actorUserId: 'uuid-staff',
      role: 'agent',
      method: 'drawn',
      on_behalf: true,
      image_sha256: sha256Hex(PNG),
      on_behalf_confirmation: "I am signing for L under the agency's mandate.",
      ip: '9.9.9.9',
      user_agent: 'ua',
    })
    expect(typeof p.signed_at).toBe('string')
    expect(JSON.stringify(p)).not.toContain('data:')
    // UPDATE and INSERT in the same transaction, UPDATE first.
    expect(clientCalls.map((c) => (c.sql.includes('UPDATE leases') ? 'update' : 'insert'))).toEqual(['update', 'insert'])
  })

  it('tenant modal / portal (tenant signs own block): one row', async () => {
    const { enforcePortalWritePolicy } = await import('./portalWritePolicy.js')
    await enforcePortalWritePolicy(
      TENANT as never,
      { resource: 'tenancy', action: 'upsert', id: 'L-1', data: { eSign: { ...baseESign(), tenant: { status: 'signed', method: 'drawn', signatureDataUrl: PNG } } } } as never,
      null as never,
    )
    expect(events()).toHaveLength(1)
    expect(payloadOf()).toMatchObject({ party: 'tenant', role: 'tenant', on_behalf: false, method: 'drawn' })
  })

  it('landlord modal / portal (landlord signs own block): one row', async () => {
    const { enforcePortalWritePolicy } = await import('./portalWritePolicy.js')
    await enforcePortalWritePolicy(
      LANDLORD as never,
      { resource: 'tenancy', action: 'upsert', id: 'L-1', data: { eSign: { ...baseESign(), landlord: { status: 'signed', method: 'drawn', signatureDataUrl: PNG } } } } as never,
      null as never,
    )
    expect(events()).toHaveLength(1)
    expect(payloadOf()).toMatchObject({ party: 'landlord', role: 'landlord', on_behalf: false })
  })

  it('paper mark-signed: one row, method paper_mark, no hash', async () => {
    await stamp(STAFF, 'tenant', { status: 'signed', method: 'paper_mark' })
    expect(events()).toHaveLength(1)
    expect(payloadOf()).toMatchObject({ method: 'paper_mark', image_sha256: null, on_behalf: true })
  })

  it('a refused signing writes nothing; a failed lease UPDATE rolls back (no row)', async () => {
    await expect(stamp(STAFF, 'tenant', { status: 'signed', method: 'drawn', signatureDataUrl: PNG })).rejects.toBeTruthy()
    expect(events()).toHaveLength(0)
    failOnUpdate = true
    await expect(stamp(TENANT, 'tenant', { status: 'signed', method: 'drawn', signatureDataUrl: PNG })).rejects.toThrow('update failed')
    expect(clientCalls).toHaveLength(0)
  })

  it('re-sending an already signed block writes no second row', async () => {
    await stamp(TENANT, 'tenant', { status: 'signed', method: 'drawn', signatureDataUrl: PNG })
    leaseESign = storedAfter() as Record<string, unknown>
    await stamp(TENANT, 'tenant', { status: 'signed', method: 'drawn', signatureDataUrl: PNG })
    expect(events()).toHaveLength(1)
  })

  it('a client persist of lease_signed is refused (generic and portal policies)', async () => {
    const { isClientLeaseSignedWrite } = await import('./leaseSign.js')
    expect(isClientLeaseSignedWrite({ resource: 'lease_signed' })).toBe(true)
    expect(isClientLeaseSignedWrite({ resource: 'property_event', data: { event_type: 'lease_signed' } })).toBe(true)
    expect(isClientLeaseSignedWrite({ resource: 'activity', data: { type: 'lease_signed' } })).toBe(true)
    expect(isClientLeaseSignedWrite({ resource: 'property_event', data: { action: 'Note' } })).toBe(false)
    const { enforcePortalWritePolicy } = await import('./portalWritePolicy.js')
    await expect(
      enforcePortalWritePolicy(TENANT as never, { resource: 'property_event', action: 'upsert', id: 'E-1', data: { event_type: 'lease_signed' } } as never, null as never),
    ).rejects.toMatchObject({ status: 403, code: 'LEASE_SIGNED_SERVER_ONLY' })
  })
})

describe('CR10 part 6: sign after reload (mock) writes exactly one lease_signed row', () => {
  it('a reloaded client sends the stored envelope plus its new landlord block: one row', async () => {
    leaseESign = { ...baseESign(), status: 'partially_signed', tenant: { status: 'signed', signerUserId: 'u-t', method: 'drawn' } }
    const { enforceStaffTenancyESign } = await import('./leaseSign.js')
    const body = {
      id: 'L-1',
      action: 'upsert',
      data: {
        eSign: {
          ...leaseESign,
          status: 'completed',
          landlord: { status: 'signed', method: 'drawn', signatureDataUrl: PNG, signerName: 'Owner', onBehalfConfirmation: "I am signing for Owner under the agency's mandate." },
          events: [{ at: 'x', type: 'party_signed', party: 'landlord', summary: 'Signature recorded for Owner (test provider).' }],
        },
      },
    }
    await enforceStaffTenancyESign(STAFF as never, body)
    expect(clientCalls.filter((c) => c.sql.includes("'lease_signed'"))).toHaveLength(1)
    expect((body.data.eSign as Record<string, unknown>).status).toBe('completed')
  })
})

describe('CR10 part 8: lease-signed email', () => {
  const flush = () => new Promise((r) => setTimeout(r, 0))
  const signLandlordToComplete = async () => {
    leaseESign = { ...baseESign(), status: 'partially_signed', tenant: { status: 'signed', signerUserId: 'u-t' } }
    return stamp(LANDLORD, 'landlord', { status: 'signed', method: 'drawn', signatureDataUrl: PNG })
  }

  it('goes once on completed, to the tenant and the landlord, with plain copy inputs', async () => {
    emailFlag = true
    const res = await signLandlordToComplete()
    await flush()
    expect(res.completedNow).toBe(true)
    expect(sendLeaseSignedEmail).toHaveBeenCalledTimes(2)
    expect(sendLeaseSignedEmail.mock.calls.map((c) => (c[0] as { to: string }).to)).toEqual(['t@x.test', 'l@x.test'])
    expect(sendLeaseSignedEmail.mock.calls[0][0]).toMatchObject({ propertyTitle: '12 Oak St' })
    expect(storedAfter()).toHaveProperty('completedEmailSentAt')
  })

  it('never on a partial signing', async () => {
    emailFlag = true
    await stamp(TENANT, 'tenant', { status: 'signed', method: 'drawn', signatureDataUrl: PNG })
    await flush()
    expect(sendLeaseSignedEmail).not.toHaveBeenCalled()
  })

  it('not again once the sent flag is set', async () => {
    emailFlag = true
    leaseESign = { ...baseESign(), status: 'partially_signed', completedEmailSentAt: '2026-10-10T00:00:00Z', tenant: { status: 'signed' } }
    await stamp(LANDLORD, 'landlord', { status: 'signed', method: 'drawn', signatureDataUrl: PNG })
    await flush()
    expect(sendLeaseSignedEmail).not.toHaveBeenCalled()
  })

  it('a send failure does not fail the signing', async () => {
    emailFlag = true
    sendLeaseSignedEmail.mockRejectedValue(new Error('smtp down'))
    const res = await signLandlordToComplete()
    await flush()
    expect(res.signed).toBe(true)
    expect(clientCalls.filter((c) => c.sql.includes("'lease_signed'"))).toHaveLength(1)
  })

  it('flag off (default): no email', async () => {
    await signLandlordToComplete()
    await flush()
    expect(sendLeaseSignedEmail).not.toHaveBeenCalled()
  })
})

describe('CR10 fix 3: envelopeStatus as #80 (completed needs both parties)', () => {
  it('tenant signed with no landlord block is partially_signed, not completed', async () => {
    const { envelopeStatus } = await import('./leaseSign.js')
    expect(envelopeStatus('sent', { status: 'signed' }, undefined)).toBe('partially_signed')
    expect(envelopeStatus('sent', { status: 'signed' }, null)).toBe('partially_signed')
    expect(envelopeStatus('sent', { status: 'signed' }, { status: 'signed' })).toBe('completed')
    expect(envelopeStatus('sent', { status: 'pending' }, { status: 'pending' })).toBe('sent')
  })
})

describe('CR10 fix 6 / B3: staff modal sign with no envelope = issue, then server stamp', () => {
  it('issuing writes no lease_signed row; the following stamp writes exactly one', async () => {
    leaseESign = undefined as never
    const { enforceStaffTenancyESign } = await import('./leaseSign.js')
    const issue = { id: 'L-1', action: 'upsert', data: { id: 'L-1', eSign: baseESign() } as Record<string, unknown> }
    await enforceStaffTenancyESign(STAFF as never, issue)
    expect(clientCalls.filter((c) => c.sql.includes("'lease_signed'"))).toHaveLength(0)
    leaseESign = issue.data.eSign as Record<string, unknown>
    const sign = {
      id: 'L-1',
      action: 'upsert',
      data: {
        id: 'L-1',
        eSign: {
          ...leaseESign,
          landlord: { status: 'signed', method: 'drawn', signatureDataUrl: PNG, signerName: 'Owner', onBehalfConfirmation: "I am signing for Owner under the agency's mandate." },
        },
      } as Record<string, unknown>,
    }
    await enforceStaffTenancyESign(STAFF as never, sign)
    expect(clientCalls.filter((c) => c.sql.includes("'lease_signed'"))).toHaveLength(1)
  })
})

describe('CR10 B1: enforceStaffTenancyESign gates every non-delete action', () => {
  it('a staff patch with a forged signed tenant block is refused', async () => {
    const { enforceStaffTenancyESign } = await import('./leaseSign.js')
    await expect(
      enforceStaffTenancyESign(STAFF as never, {
        id: 'L-1',
        action: 'patch',
        data: { eSign: { ...baseESign(), tenant: { status: 'signed', method: 'drawn', signatureDataUrl: PNG } } },
      }),
    ).rejects.toMatchObject({ status: 403, code: 'SIGNATURE_NOT_SIGNER' })
    expect(updates()).toHaveLength(0)
  })
})

describe('CR10 fix B2a: envelope replacement locked once signing has started', () => {
  it('partially_signed (even with no signed block stored) or completed: 403 SIGNATURE_ENVELOPE_LOCKED', async () => {
    const { enforceStaffTenancyESign } = await import('./leaseSign.js')
    for (const status of ['partially_signed', 'completed']) {
      leaseESign = { ...baseESign(), status }
      await expect(
        enforceStaffTenancyESign(STAFF as never, { id: 'L-1', action: 'upsert', data: { eSign: { ...baseESign(), envelopeId: 'ENV-9' } } }),
      ).rejects.toMatchObject({ status: 403, code: 'SIGNATURE_ENVELOPE_LOCKED' })
    }
    expect(updates()).toHaveLength(0)
  })
  it('a sent envelope with nothing signed can still be replaced', async () => {
    const { enforceStaffTenancyESign } = await import('./leaseSign.js')
    const body = { id: 'L-1', action: 'upsert', data: { eSign: { ...baseESign(), envelopeId: 'ENV-9' } } as Record<string, unknown> }
    await enforceStaffTenancyESign(STAFF as never, body)
    expect(body.data.eSign).toMatchObject({ envelopeId: 'ENV-9', status: 'sent' })
  })
})
