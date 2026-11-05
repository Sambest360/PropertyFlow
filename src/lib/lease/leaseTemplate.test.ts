import { describe, expect, it } from 'vitest'
import { fillMergeFields, leaseTemplateIsEmpty, leaseTemplateSections, sanitizeLeaseHtml, STARTER_LEASE_TEMPLATE } from './leaseTemplate'
import { AGENCY_LEASE_TEMPLATE_VERSION, LEASE_TEMPLATE_VERSION, buildLeaseContract } from './leaseContract'
import { leaseTemplateForTenancy } from './contractInput'
import type { Agency, Tenancy } from '../../types/domain'

describe('lease template', () => {
  it('keeps only editor tags, without attributes or scripts', () => {
    const out = sanitizeLeaseHtml('<h1 class="x">Title</h1><p onclick="x()">Hi <b>there</b></p><script>alert(1)</script><img src=x onerror=1><div>Line</div>')
    expect(out).toBe('<h2>Title</h2><p>Hi <b>there</b></p><p>Line</p>')
  })

  it('fills merge fields and blanks unknown ones', () => {
    expect(fillMergeFields('Rent {{rent}} for {{ tenantName }} {{nope}}', { rent: 'R 100', tenantName: 'Ann' })).toBe('Rent R 100 for Ann ________')
  })

  it('turns headings into sections and paragraphs and list items into clauses', () => {
    const s = leaseTemplateSections('<p>Intro</p><h2>1. Rent</h2><p>Pay {{rent}}</p><ul><li>On time</li><li>By EFT</li></ul><h2>2. End</h2><p>Bye</p>', { rent: 'R 5' })
    expect(s).toEqual([
      { title: '', clauses: ['Intro'] },
      { title: '1. Rent', clauses: ['Pay R 5', 'On time', 'By EFT'] },
      { title: '2. End', clauses: ['Bye'] },
    ])
  })

  it('uses the agency template in the contract, else the standard lease', () => {
    const base = {
      leaseReference: 'L1', agencyName: 'Acme', landlordName: 'Lan', tenantName: 'Ten', tenantEmail: 't@x.co',
      propertyTitle: 'Flat', propertyAddress: '1 Road', startDate: '2026-12-01', endDate: null, rent: 1000, deposit: 1000,
    }
    expect(buildLeaseContract(base).version).toBe(LEASE_TEMPLATE_VERSION)
    const c = buildLeaseContract({ ...base, customTemplateHtml: STARTER_LEASE_TEMPLATE })
    expect(c.version).toBe(AGENCY_LEASE_TEMPLATE_VERSION)
    expect(c.sections[0].clauses[0]).toContain('Ten')
    expect(leaseTemplateIsEmpty('<p> </p>')).toBe(true)
  })

  it('keeps signed leases on the text they were signed on', () => {
    const agency = { settings: { leaseTemplate: '<p>New</p>', leaseTemplateSavedAt: '2026-11-05T10:00:00Z' } } as unknown as Agency
    const t = (extra: Partial<Tenancy>) => ({ ...extra }) as Tenancy
    expect(leaseTemplateForTenancy(t({ leaseTemplateHtml: '<p>Old</p>' }), agency)).toBe('<p>Old</p>')
    expect(leaseTemplateForTenancy(t({ leaseTemplateHtml: '' }), agency)).toBeNull()
    expect(leaseTemplateForTenancy(t({}), agency)).toBe('<p>New</p>')
    const signedEarlier = { tenant: { status: 'signed', signedAt: '2026-10-01T00:00:00Z' }, landlord: { status: 'pending' } } as Tenancy['eSign']
    expect(leaseTemplateForTenancy(t({ eSign: signedEarlier }), agency)).toBeNull()
  })
})
