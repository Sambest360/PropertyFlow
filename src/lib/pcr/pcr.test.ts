import { describe, expect, it } from 'vitest'
import type { Application } from '../../types/domain'
import {
  DEPOSIT_DAMAGE_SOFT_WARN,
  ManualPcrAdapter,
  PCR_MODE_A_COPY,
  RefuseClosedPcrPartnerAdapter,
  attemptLivePartnerPush,
  collectMaintenanceHandoffDrafts,
  createInspection,
  depositDamageWithoutOutgoingSoftWarn,
  ensureIngoingInspection,
  ensureOutgoingInspection,
  findInspection,
  generatePcrPdf,
  handoffDraftToCreateTicketRequest,
  isIngoingPcrClearedForKeys,
  isPcrSoftGatedAction,
  pcrPartnerAdapterFromEnv,
  pcrSoftGate,
  pcrSoftGateMessage,
  recordNoShowOrAdminOverride,
  refundDepositOutgoingSoftWarn,
  softSignStaff,
  softSignTenant,
  updateItemNotes,
  upsertInspectionOnApplication,
  addItemPhoto,
} from './index'

function rentalApp(overrides: Partial<Application> = {}): Application {
  return {
    id: 'APP-PCR-1',
    agencyId: 'ag-1',
    propertyId: 'PR-1',
    unitId: 'UN-1',
    agentId: 'u-agent',
    applicantUserId: 'u-tenant',
    applicantName: 'Thandi Molefe',
    email: 'thandi@example.com',
    phone: '0820000000',
    type: 'Rental',
    workflowStatus: 'inspection_scheduled',
    stage: 'Move-in inspection scheduled',
    progress: 60,
    income: 45000,
    employment: 'Employed',
    creditCheck: 'Passed',
    creditConsent: true,
    documents: [],
    docs: [],
    viewingSlotId: null,
    notes: '',
    submittedAt: '2026-09-01T10:00:00+02:00',
    updatedAt: '2026-09-15T10:00:00+02:00',
    moveInDate: '2026-10-01',
    ...overrides,
  }
}

describe('PCR Mode A honesty', () => {
  it('states soft-demo / not RHA / not PropertyInspect parity', () => {
    expect(PCR_MODE_A_COPY).toMatch(/Mode A soft-demo/i)
    expect(PCR_MODE_A_COPY).toMatch(/not RHA legal advice/i)
    expect(PCR_MODE_A_COPY).toMatch(/not PropertyInspect/i)
    expect(PCR_MODE_A_COPY.toLowerCase()).not.toMatch(/rha certified/)
    expect(PCR_MODE_A_COPY).toMatch(/not GPS-required/i)
    expect(PCR_MODE_A_COPY.toLowerCase()).not.toMatch(/gps is required/)
  })
})

describe('incoming/outgoing inspection + template', () => {
  it('creates incoming with lite room/item template', () => {
    const insp = createInspection({
      id: 'pcr-1',
      agencyId: 'ag-1',
      applicationId: 'APP-1',
      propertyId: 'PR-1',
      kind: 'incoming',
      now: '2026-10-01T09:00:00+02:00',
      scheduledOn: '2026-10-01',
    })
    expect(insp.kind).toBe('incoming')
    expect(insp.status).toBe('scheduled')
    expect(insp.ingoingPcrSigned).toBe(false)
    expect(insp.rooms.length).toBeGreaterThanOrEqual(4)
    expect(insp.rooms[0].items.length).toBeGreaterThanOrEqual(2)
    expect(insp.rooms[0].items[0].condition).toBe('not_checked')
  })

  it('ensureIngoingInspection is idempotent and ensureOutgoing creates separate object', () => {
    const now = '2026-10-01T10:00:00+02:00'
    const a = rentalApp()
    const first = ensureIngoingInspection(a, now, '2026-10-02')
    expect(first.created).toBe(true)
    const second = ensureIngoingInspection(first.application, now)
    expect(second.created).toBe(false)
    expect(second.inspection.id).toBe(first.inspection.id)

    const out = ensureOutgoingInspection(second.application, now)
    expect(out.created).toBe(true)
    expect(findInspection(out.application, 'outgoing')?.kind).toBe('outgoing')
    expect(findInspection(out.application, 'incoming')).toBeTruthy()
  })

  it('supports photos and notes on items', () => {
    const now = '2026-10-01T11:00:00+02:00'
    let insp = createInspection({
      id: 'pcr-notes',
      agencyId: 'ag-1',
      applicationId: 'APP-1',
      propertyId: 'PR-1',
      kind: 'incoming',
      now,
    })
    const room = insp.rooms[0]
    const item = room.items[0]
    insp = updateItemNotes(
      insp,
      room.id,
      item.id,
      { notes: 'Scuff on door', condition: 'fair', needsMaintenance: false },
      now,
    )
    insp = addItemPhoto(
      insp,
      room.id,
      item.id,
      { id: 'ph-1', url: 'data:image/png;base64,AAA', caption: 'door', capturedAt: now },
      now,
    )
    const updated = insp.rooms[0].items[0]
    expect(updated.notes).toMatch(/Scuff/)
    expect(updated.condition).toBe('fair')
    expect(updated.photos).toHaveLength(1)
    expect(insp.status).toBe('in_progress')
  })
})

describe('soft sign / no-show override → ingoing_pcr_signed', () => {
  it('sets ingoingPcrSigned only after staff + tenant soft ack', () => {
    const now = '2026-10-01T12:00:00+02:00'
    let insp = createInspection({
      id: 'pcr-sign',
      agencyId: 'ag-1',
      applicationId: 'APP-1',
      propertyId: 'PR-1',
      kind: 'incoming',
      now,
    })
    const staff = softSignStaff(insp, { userId: 'u-staff', name: 'Lerato' }, now)
    expect(staff.ok).toBe(true)
    if (!staff.ok) return
    expect(staff.inspection.ingoingPcrSigned).toBe(false)

    const tenant = softSignTenant(
      staff.inspection,
      { userId: 'u-tenant', name: 'Thandi Molefe' },
      now,
    )
    expect(tenant.ok).toBe(true)
    if (!tenant.ok) return
    expect(tenant.inspection.ingoingPcrSigned).toBe(true)
    expect(tenant.inspection.status).toBe('signed')
  })

  it('documented no-show + admin override sets ingoingPcrSigned', () => {
    const now = '2026-10-01T13:00:00+02:00'
    const insp = createInspection({
      id: 'pcr-noshow',
      agencyId: 'ag-1',
      applicationId: 'APP-1',
      propertyId: 'PR-1',
      kind: 'incoming',
      now,
    })
    const bad = recordNoShowOrAdminOverride(insp, {
      byUserId: 'u-admin',
      byName: 'Admin',
      reason: 'short',
      kind: 'tenant_no_show',
      now,
    })
    expect(bad.ok).toBe(false)

    const ok = recordNoShowOrAdminOverride(insp, {
      byUserId: 'u-admin',
      byName: 'Admin',
      reason: 'Tenant no-show after two SMS reminders; proceed with photo pack.',
      kind: 'tenant_no_show',
      now,
    })
    expect(ok.ok).toBe(true)
    if (!ok.ok) return
    expect(ok.inspection.ingoingPcrSigned).toBe(true)
    expect(ok.inspection.status).toBe('no_show_override')
  })
})

describe('keys/move-in soft-gate', () => {
  it('gates KEYS_READY family until ingoing signed or override', () => {
    expect(isPcrSoftGatedAction('KEYS_READY')).toBe(true)
    expect(isPcrSoftGatedAction('COMPLETE_KEY_HANDOVER')).toBe(true)
    expect(isPcrSoftGatedAction('ACTIVATE_TENANCY')).toBe(true)
    expect(isPcrSoftGatedAction('COMPLETE_INSPECTION')).toBe(false)

    const app = rentalApp()
    expect(pcrSoftGate(app)).toMatch(/blocked until/i)
    expect(isIngoingPcrClearedForKeys(app)).toBe(false)

    const now = '2026-10-01T14:00:00+02:00'
    let insp = createInspection({
      id: 'pcr-gate',
      agencyId: 'ag-1',
      applicationId: app.id,
      propertyId: app.propertyId,
      kind: 'incoming',
      now,
    })
    const ov = recordNoShowOrAdminOverride(insp, {
      byUserId: 'u-admin',
      byName: 'Admin',
      reason: 'Audited override — tenant unreachable after lease start.',
      kind: 'admin_override',
      now,
    })
    expect(ov.ok).toBe(true)
    if (!ov.ok) return
    const cleared = upsertInspectionOnApplication(app, ov.inspection)
    expect(pcrSoftGate(cleared)).toBe(true)
    expect(pcrSoftGateMessage(cleared)).toBeNull()
    expect(isIngoingPcrClearedForKeys(cleared)).toBe(true)
  })

  it('purchase apps are not PCR soft-gated', () => {
    expect(pcrSoftGate(rentalApp({ type: 'Purchase' }))).toBe(true)
  })
})

describe('deposit damage soft-warn (not hard forfeit)', () => {
  it('warns when claiming damage without outgoing path', () => {
    const app = rentalApp()
    const warn = depositDamageWithoutOutgoingSoftWarn({
      claimingDamageOrDeduction: true,
      application: app,
    })
    expect(warn).toBe(DEPOSIT_DAMAGE_SOFT_WARN)
    expect(warn?.toLowerCase()).toMatch(/not a hard auto-forfeit/)

    const withOut = ensureOutgoingInspection(app, '2026-10-01T15:00:00+02:00')
    expect(
      depositDamageWithoutOutgoingSoftWarn({
        claimingDamageOrDeduction: true,
        application: withOut.application,
      }),
    ).toBeNull()
    expect(refundDepositOutgoingSoftWarn(app)).toMatch(/soft-warn/i)
    expect(refundDepositOutgoingSoftWarn(withOut.application)).toBeNull()
  })
})

describe('partner adapter refuse-closed', () => {
  it('manual adapter succeeds; PropertyInspect/RedRabbit refuse live push', async () => {
    const insp = createInspection({
      id: 'pcr-partner',
      agencyId: 'ag-1',
      applicationId: 'APP-1',
      propertyId: 'PR-1',
      kind: 'incoming',
      now: '2026-10-01T16:00:00+02:00',
    })
    const manual = new ManualPcrAdapter()
    const manRes = await attemptLivePartnerPush(manual, insp)
    expect(manRes.ok).toBe(true)

    for (const code of ['propertyinspect', 'redrabbit'] as const) {
      const partner = new RefuseClosedPcrPartnerAdapter(code, { configured: false })
      const res = await attemptLivePartnerPush(partner, insp)
      expect(res.ok).toBe(false)
      if (res.ok) return
      expect(res.error.toLowerCase()).toMatch(/refuse|not configured|placeholder/)
      expect(res.error.toLowerCase()).not.toMatch(/pushed successfully/)
    }

    const fromEnv = pcrPartnerAdapterFromEnv('propertyinspect', {
      PCR_ADAPTER: 'partner',
      PCR_PARTNER_API_KEY: 'fake-key',
    })
    expect(fromEnv.live).toBe(true)
    const envRes = await fromEnv.pushInspection(insp)
    expect(envRes.ok).toBe(false)
  })
})

describe('maintenance handoff hook', () => {
  it('drafts ticket shapes for damaged / flagged items', () => {
    const now = '2026-10-01T17:00:00+02:00'
    let insp = createInspection({
      id: 'pcr-maint',
      agencyId: 'ag-1',
      applicationId: 'APP-1',
      propertyId: 'PR-1',
      kind: 'incoming',
      now,
    })
    const room = insp.rooms.find((r) => r.name.toLowerCase().includes('kitchen')) ?? insp.rooms[0]
    const item = room.items[0]
    insp = updateItemNotes(
      insp,
      room.id,
      item.id,
      { condition: 'damaged', notes: 'Leaking tap', needsMaintenance: true },
      now,
    )
    const drafts = collectMaintenanceHandoffDrafts(insp)
    expect(drafts.length).toBeGreaterThanOrEqual(1)
    const req = handoffDraftToCreateTicketRequest(drafts[0], 'UN-1')
    expect(req.unit_id).toBe('UN-1')
    expect(req.title).toMatch(/PCR follow-up/)
    expect(req.description).toMatch(/Mode A soft PCR handoff/)
  })
})

describe('downloadable PCR PDF pack', () => {
  it('generates real PDF bytes with honesty text', async () => {
    const now = '2026-10-01T18:00:00+02:00'
    let insp = createInspection({
      id: 'pcr-pdf',
      agencyId: 'ag-1',
      applicationId: 'APP-1',
      propertyId: 'PR-1',
      kind: 'incoming',
      now,
      scheduledOn: '2026-10-01',
    })
    const signed = softSignStaff(insp, { userId: 'u-s', name: 'Staff' }, now)
    expect(signed.ok).toBe(true)
    if (!signed.ok) return
    const both = softSignTenant(
      signed.inspection,
      { userId: 'u-t', name: 'Tenant' },
      now,
    )
    expect(both.ok).toBe(true)
    if (!both.ok) return
    insp = both.inspection

    const pdf = await generatePcrPdf({
      inspection: insp,
      agencyName: 'Demo Agency',
      propertyTitle: '12 Test St',
      propertyAddress: '12 Test St, Cape Town',
      tenantName: 'Thandi Molefe',
      generatedAt: now,
    })
    expect(pdf.fileName).toContain('pcr-incoming')
    expect(pdf.dataUrl.startsWith('data:application/pdf;base64,')).toBe(true)
    expect(pdf.bytes[0]).toBe(0x25)
    expect(pdf.bytes[1]).toBe(0x50)
    expect(pdf.bytes[2]).toBe(0x44)
    expect(pdf.bytes[3]).toBe(0x46)
    expect(pdf.honesty).toBe(PCR_MODE_A_COPY)
    expect(pdf.honesty.toLowerCase()).toMatch(/not rha legal advice/)
  })
})
