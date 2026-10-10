import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { LeaseSignEvent, Tenancy } from '../../types/domain'
import { buildSigningRecord } from '../../lib/lease/signingRecord'
import { LeaseSigningRecordView, SIGN_DEVICE_ROLES } from './LeaseSigningRecord'

const tenancy = { id: 'L-1', tenantName: 'Tess Tenant', landlordId: 'u-ll', eSign: null } as unknown as Tenancy
const names: Record<string, string> = { 'u-t': 'Tess Tenant', 'u-staff': 'Sam Staff', 'u-ll': 'Lerato Landlord' }
const events: LeaseSignEvent[] = [
  {
    id: 'e1',
    tenancyId: 'L-1',
    envelopeId: 'ENV-1',
    party: 'tenant',
    signerUserId: 'u-t',
    role: 'tenant',
    method: 'drawn',
    onBehalf: false,
    imageSha256: 'abcdef0123456789abcdef',
    signedAt: '2026-10-10T08:00:00.000Z',
    ip: '10.1.2.3',
    userAgent: 'Mozilla/5.0 test',
  },
  {
    id: 'e2',
    tenancyId: 'L-1',
    envelopeId: 'ENV-1',
    party: 'landlord',
    signerUserId: 'u-staff',
    role: 'agent',
    method: 'drawn',
    onBehalf: true,
    onBehalfConfirmation: "I am signing for Lerato Landlord under the agency's mandate.",
    imageSha256: '1234567890abcdef',
    signedAt: '2026-10-10T09:00:00.000Z',
    ip: '10.9.9.9',
    userAgent: 'Staff browser',
  },
  { id: 'other', tenancyId: 'L-2', envelopeId: 'X', party: 'tenant', signerUserId: 'u-x', role: 'tenant', method: 'drawn', onBehalf: false, imageSha256: null, signedAt: null },
]
const rows = buildSigningRecord({ tenancy, events, userName: (id) => (id ? names[id] ?? null : null), landlordName: 'Lerato Landlord' })

describe('CR10 part 5: signing record', () => {
  it('lists who, role, SAST time, method label, envelope and short hash for this lease only', () => {
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({
      who: 'Tess Tenant',
      roleLabel: 'Tenant',
      when: expect.stringContaining('SAST'),
      methodLabel: 'Drawn electronic signature',
      envelopeId: 'ENV-1',
      shortHash: 'abcdef012345',
    })
    expect(rows[0].when).toContain('10:00') // 08:00Z = 10:00 SAST
    expect(rows[1]).toMatchObject({
      who: 'Signed by Sam Staff for Lerato Landlord (on behalf)',
      roleLabel: 'Staff on behalf of landlord',
    })
  })

  it('renders the on-behalf line and the confirmation', () => {
    const html = renderToStaticMarkup(<LeaseSigningRecordView rows={rows} showDevice />)
    expect(html).toContain('Signed by Sam Staff for Lerato Landlord (on behalf)')
    expect(html).toContain('I am signing for Lerato Landlord under the agency&#x27;s mandate.')
    expect(html).toContain('Signing record')
  })

  it('staff see IP address and user agent; tenant and landlord views never render them', () => {
    expect(renderToStaticMarkup(<LeaseSigningRecordView rows={rows} showDevice={SIGN_DEVICE_ROLES.has('agent')} />)).toContain('10.1.2.3')
    for (const role of ['tenant', 'landlord']) {
      const html = renderToStaticMarkup(<LeaseSigningRecordView rows={rows} showDevice={SIGN_DEVICE_ROLES.has(role)} />)
      expect(html).not.toContain('10.1.2.3')
      expect(html).not.toContain('Mozilla')
      expect(html).not.toContain('IP address')
      expect(html).not.toContain('User agent')
    }
  })

  it('empty state when nothing is recorded', () => {
    const html = renderToStaticMarkup(<LeaseSigningRecordView rows={[]} showDevice={false} />)
    expect(html).toContain('No signatures recorded on this lease yet.')
  })

  it('falls back to the server stamp on the stored eSign when no audit rows are loaded', () => {
    const t = {
      ...tenancy,
      eSign: {
        envelopeId: 'ENV-9',
        tenant: { status: 'signed', signerUserId: 'u-t', signerRole: 'tenant', method: 'saved_image', signedAt: '2026-10-10T08:00:00Z', imageSha256: 'ffff00001111' },
        landlord: { status: 'pending' },
      },
    } as unknown as Tenancy
    const r = buildSigningRecord({ tenancy: t, events: [], userName: (id) => (id ? names[id] ?? null : null), landlordName: 'L' })
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ methodLabel: 'Saved electronic signature', envelopeId: 'ENV-9' })
  })
})
