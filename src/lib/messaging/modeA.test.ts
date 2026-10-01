import { describe, expect, it } from 'vitest'
import {
  buildArrearsMessageThreadInput,
  mapRoutesToFe,
  mapRoutesToPg,
  messagingDeliveryClaim,
  MESSAGING_MODE_A_BANNER,
  resolveOwnerComposeTarget,
  resolveTenantComposeTarget,
  routesToBadgeLabel,
  uniqueParticipantIds,
} from './modeA'

describe('messaging Mode A helpers', () => {
  it('maps routesTo to Postgres including LANDLORD', () => {
    expect(mapRoutesToPg('landlord')).toBe('LANDLORD')
    expect(mapRoutesToPg('agency')).toBe('AGENCY')
    expect(mapRoutesToPg('agent')).toBe('AGENT')
    expect(mapRoutesToPg(undefined)).toBe('AGENT')
  })

  it('maps Postgres routes_to back to frontend', () => {
    expect(mapRoutesToFe('LANDLORD')).toBe('landlord')
    expect(mapRoutesToFe('AGENCY')).toBe('agency')
    expect(mapRoutesToFe('AGENT')).toBe('agent')
  })

  it('landlord visibility thread participants for owner compose', () => {
    const t = resolveOwnerComposeTarget({
      landlordUserId: 'u-ll',
      tenantUserId: 'u-tn',
      includeAgencyUserId: 'u-ag',
    })
    expect(t.routesTo).toBe('landlord')
    expect(t.participantIds).toEqual(['u-ll', 'u-tn', 'u-ag'])
  })

  it('tenant can start with landlord or agent', () => {
    expect(
      resolveTenantComposeTarget({
        preferLandlord: true,
        tenantUserId: 'u-tn',
        landlordId: 'u-ll',
        agentId: 'u-ag',
      }),
    ).toEqual({ participantIds: ['u-tn', 'u-ll'], routesTo: 'landlord' })
    expect(
      resolveTenantComposeTarget({
        preferLandlord: false,
        tenantUserId: 'u-tn',
        landlordId: 'u-ll',
        agentId: 'u-ag',
      }),
    ).toEqual({ participantIds: ['u-tn', 'u-ag'], routesTo: 'agent' })
  })

  it('buildArrearsMessageThreadInput persists landlord route when owner known', () => {
    const input = buildArrearsMessageThreadInput({
      agencyId: 'ag-1',
      propertyId: 'PR-1',
      applicationId: null,
      occupancyId: 'TN-1',
      staffUserId: 'u-staff',
      tenantUserId: 'u-tn',
      landlordId: 'u-ll',
      totalCents: 150000,
    })
    expect(input.routesTo).toBe('landlord')
    expect(input.participantIds).toEqual(['u-staff', 'u-tn', 'u-ll'])
    expect(input.initialMessage).toMatch(/in-app/i)
    expect(input.initialMessage).not.toMatch(/WhatsApp delivered|SMS delivered/i)
    expect(input.subject).toContain('TN-1')
  })

  it('dedupes participant ids', () => {
    expect(uniqueParticipantIds(['a', 'a', null, 'b', undefined, 'a'])).toEqual(['a', 'b'])
  })

  it('badge labels distinguish landlord vs agency', () => {
    expect(routesToBadgeLabel('landlord')).toBe('Landlord')
    expect(routesToBadgeLabel('agency')).toBe('Agency')
    expect(routesToBadgeLabel('agent')).toBe('Agent')
  })

  it('honesty: delivery claim is in-app only — no WhatsApp HTTP', () => {
    expect(messagingDeliveryClaim()).toBe('in-app')
    expect(MESSAGING_MODE_A_BANNER).toMatch(/not live chat, WhatsApp, or SMS/i)
    // No twilio/whatsapp URL constants in this module surface
    expect(MESSAGING_MODE_A_BANNER).not.toMatch(/api\.twilio|graph\.facebook/i)
  })
})
