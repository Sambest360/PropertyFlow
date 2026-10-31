import { beforeAll, describe, expect, it } from 'vitest'
import { unitPersistPayload } from '../src/lib/unitPersistPayload.js'

/**
 * Edit → save → read back, against a REAL scratch Postgres (never live).
 * Runs only when PF_TEST_PG_SEEDED_URL points at a throwaway database loaded
 * with database/postgres/schema.sql + seed.sql. Each case writes through the
 * real handlePersist and reads back through the real buildBootstrap, the same
 * path a page reload takes.
 */
const url = process.env.PF_TEST_PG_SEEDED_URL

type Boot = Awaited<ReturnType<typeof import('./bootstrap.js').buildBootstrap>> & Record<string, any>

describe.skipIf(!url)('edits are saved and read back (real Postgres)', () => {
  let handlePersist: typeof import('./writes.js').handlePersist
  let buildBootstrap: typeof import('./bootstrap.js').buildBootstrap
  let invalidate: () => void
  const staff = ['u-lerato', 'agency_admin'] as const

  const boot = async (): Promise<Boot> => {
    invalidate()
    return (await buildBootstrap()) as Boot
  }
  const save = (resource: string, id: string, data: Record<string, unknown>) =>
    handlePersist({ resource, action: 'upsert', id, data } as never, ...staff)
  const remove = (resource: string, id: string) =>
    handlePersist({ resource, action: 'delete', id } as never, ...staff)

  beforeAll(async () => {
    process.env.DATABASE_URL = url
    ;({ handlePersist } = await import('./writes.js'))
    ;({ buildBootstrap } = await import('./bootstrap.js'))
    const cache = await import('./idMapCache.js')
    invalidate = () => cache.invalidateIdMapCache()
  })

  it('editing a published listing keeps the edit after the publish unit write', async () => {
    const b = await boot()
    const prop = b.properties.find((p: any) => p.status === 'Published' || p.status === 'Rented')
    const unit = b.units.find((u: any) => u.id === prop.unitId)
    const edited = {
      ...prop,
      title: 'Edited title',
      rent: 15432,
      description: 'Edited description',
      images: ['https://example.test/a.jpg'],
    }
    // publishProperty: property write, then the unit status write.
    await save('property', prop.id, { ...edited, status: 'Published' })
    await save('unit', unit.id, {
      ...unitPersistPayload(unit, edited),
      statusKey: 'PUBLISHED',
      listingType: unit.listingType,
    })
    const after = (await boot()).properties.find((p: any) => p.id === prop.id)
    expect(after).toMatchObject({
      title: 'Edited title',
      rent: 15432,
      description: 'Edited description',
      images: ['https://example.test/a.jpg'],
    })
  })

  it('inventory: condition, notes, model and purchase date survive a reload', async () => {
    const b = await boot()
    const asset = b.internalAssets[0]
    await save('asset', asset.id, {
      ...asset,
      condition: 'Needs replacement',
      notes: 'Seal worn',
      model: 'RF28',
      purchaseDate: '2025-02-01',
      purchaseValue: 8999,
    })
    const after = (await boot()).internalAssets.find((a: any) => a.id === asset.id)
    expect(after).toMatchObject({
      condition: 'Needs replacement',
      notes: 'Seal worn',
      model: 'RF28',
      purchaseDate: '2025-02-01',
      purchaseValue: 8999,
    })
  })

  it('inventory and floor-plan rooms added with front-end ids keep those ids', async () => {
    const b = await boot()
    const unit = b.units[0]
    await save('room', 'rm-audit-1', {
      id: 'rm-audit-1',
      clientId: unit.clientId,
      unitId: unit.id,
      name: 'Audit study',
      kind: 'study',
      beds: 0,
      baths: 0,
      layout: { x: 1, y: 2, w: 30, h: 20 },
    })
    await save('asset', 'ia-audit-1', {
      id: 'ia-audit-1',
      clientId: unit.clientId,
      unitId: unit.id,
      roomId: 'rm-audit-1',
      itemName: 'Audit desk',
      assetTypeKey: 'FURNITURE',
      condition: 'Fair',
    })
    let after = await boot()
    expect(after.infraRooms.find((r: any) => r.id === 'rm-audit-1')).toMatchObject({
      name: 'Audit study',
      layout: { x: 1, y: 2, w: 30, h: 20 },
    })
    expect(after.internalAssets.find((a: any) => a.id === 'ia-audit-1')).toMatchObject({
      roomId: 'rm-audit-1',
      condition: 'Fair',
    })

    await remove('room', 'rm-audit-1')
    after = await boot()
    expect(after.infraRooms.find((r: any) => r.id === 'rm-audit-1')).toBeUndefined()
    expect(after.internalAssets.find((a: any) => a.id === 'ia-audit-1')?.roomId).toBeNull()

    await remove('asset', 'ia-audit-1')
    expect((await boot()).internalAssets.find((a: any) => a.id === 'ia-audit-1')).toBeUndefined()
  })

  it('agency trading name and contacts are saved and kept by a later partial edit', async () => {
    const b = await boot()
    const agency = b.agencies[0]
    await save('agency', agency.id, {
      ...agency,
      tradingAs: 'Audit Realty',
      email: 'desk@audit.test',
      phone: '0410000000',
      province: 'EC',
    })
    // The edit modal sends name/slug/city/permissions only.
    await save('agency', agency.id, { name: agency.name, slug: agency.slug, city: 'Gqeberha', status: agency.status })
    const after = (await boot()).agencies.find((a: any) => a.id === agency.id)
    expect(after).toMatchObject({
      city: 'Gqeberha',
      tradingAs: 'Audit Realty',
      email: 'desk@audit.test',
      phone: '0410000000',
      province: 'EC',
    })
  })

  it('a blocked application stays blocked, with its reason, after a reload', async () => {
    const b = await boot()
    const app = b.applications.find((a: any) => a.stage !== 'Blocked')
    await save('application', app.id, {
      ...app,
      stage: 'Blocked',
      progress: 0,
      blockReason: 'Fraudulent payslip',
      blockedAt: '2026-10-30',
    })
    const after = (await boot()).applications.find((a: any) => a.id === app.id)
    expect(after).toMatchObject({ stage: 'Blocked', blockReason: 'Fraudulent payslip', blockedAt: '2026-10-30' })
  })
})
