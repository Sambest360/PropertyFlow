import { describe, expect, it } from 'vitest'
import type { Application } from '../types/domain'
import {
  applyWorkflowTransition,
  activeCategoryStages,
  activeWorkflowCategory,
  categoryProgress,
  documentsForStage,
  getAvailableTransitions,
  getLifecycleMilestones,
  getStageRequirements,
  milestoneVisualState,
  normalizeApplication,
  primaryNextTransition,
  resolveWorkflowStatus,
  workflowProgress,
  workflowStageLabel,
  PURCHASE_WORKFLOW,
} from './applicationWorkflow'
import { buildDocumentChecklist, ensureApplicationDocuments } from './workflow'

function rentalApp(overrides: Partial<Application> = {}): Application {
  return {
    id: 'APP-1',
    agencyId: 'AG-1',
    propertyId: 'P-1',
    agentId: 'U-1',
    applicantUserId: null,
    applicantName: 'Amy Visser',
    email: 'amy@media.com',
    phone: '+27 73 880 5511',
    type: 'Rental',
    stage: 'Documents Pending',
    progress: 20,
    income: 45_000,
    employment: 'Employed',
    creditCheck: 'Not Started',
    creditConsent: true,
    documents: buildDocumentChecklist('Rental'),
    docs: [],
    viewingSlotId: null,
    notes: '',
    submittedAt: '2026-07-20',
    updatedAt: '2026-07-20',
    ...overrides,
  }
}

function verifiedFicaPackDocs() {
  return buildDocumentChecklist('Rental').map((d) =>
    d.key === 'id' || d.key === 'address' || d.key === 'fica'
      ? { ...d, status: 'verified' as const }
      : { ...d, status: 'uploaded' as const },
  )
}

/** DQ-C3 Mode A: approve/lease soft-gate cleared by passed or manual_override. */
function clearedScreeningFields(): Pick<Application, 'screening' | 'creditCheck' | 'creditConsent'> {
  return {
    screening: { status: 'passed', provider: 'mock' },
    creditCheck: 'Passed',
    creditConsent: true,
  }
}

describe('applicationWorkflow', () => {
  it('maps legacy stages to workflow status', () => {
    const app = rentalApp({ stage: 'Documents Pending' })
    expect(resolveWorkflowStatus(app)).toBe('documents_requested')
    expect(normalizeApplication(app).stage).toBe('Documents requested')
  })

  it('offers document upload transition from documents_requested', () => {
    const app = normalizeApplication(
      rentalApp({
        documents: buildDocumentChecklist('Rental').map((d) => ({ ...d, status: 'uploaded' as const })),
      }),
    )
    const actions = getAvailableTransitions(app, ['applications.review'])
    expect(actions.some((a) => a.actionKey === 'UPLOAD_DOCS')).toBe(true)
  })

  it('advances through screening chain', () => {
    let app = normalizeApplication(
      rentalApp({
        workflowStatus: 'documents_uploaded',
        documents: buildDocumentChecklist('Rental').map((d) => ({ ...d, status: 'uploaded' as const })),
      }),
    )
    app = applyWorkflowTransition(app, 'fica_verification')
    expect(app.workflowStatus).toBe('fica_verification')
    expect(workflowStageLabel('Rental', 'fica_verification')).toBe('FICA verification')
    expect(workflowProgress('Rental', 'fica_verification')).toBeGreaterThan(0)
  })

  it('backfills empty document checklists on normalize', () => {
    const app = normalizeApplication(
      rentalApp({ documents: [], stage: 'Application started', workflowStatus: 'application_started' }),
    )
    expect(app.documents.length).toBeGreaterThan(0)
    expect(app.documents.every((d) => d.status === 'required')).toBe(true)
  })

  it('ensureApplicationDocuments preserves uploaded statuses', () => {
    const partial = ensureApplicationDocuments({
      type: 'Rental',
      documents: [{ key: 'id', label: 'Old label', status: 'uploaded' }],
    })
    expect(partial.find((d) => d.key === 'id')?.status).toBe('uploaded')
    expect(partial.length).toBe(buildDocumentChecklist('Rental').length)
  })

  it('suggests the primary action from application_started', () => {
    const app = normalizeApplication(
      rentalApp({ workflowStatus: 'application_started', stage: 'Application started' }),
    )
    const next = primaryNextTransition(app, ['applications.review'])
    // P0-3: both the applicant-facing Submit and the staff Approve are primary
    // candidates from `started`; either is a valid lead action.
    expect(['SUBMIT_APPLICATION', 'AGENT_APPROVE']).toContain(next?.actionKey)
  })

  it('resolves active category and stages for current phase only', () => {
    const app = normalizeApplication(
      rentalApp({ workflowStatus: 'application_started', stage: 'Application started' }),
    )
    expect(activeWorkflowCategory(app)).toBe('application')
    const stages = activeCategoryStages(app)
    expect(stages.map((s) => s.key)).toEqual([
      'application_started',
      'application_submitted',
      'documents_requested',
      'documents_uploaded',
    ])
    expect(categoryProgress(app)).toBe(0)
  })

  it('lists Viewing first on the rental journey rail', () => {
    const milestones = getLifecycleMilestones('Rental')
    expect(milestones[0]?.key).toBe('viewing_scheduled')
    expect(milestoneVisualState('Rental', 'application_submitted', 'viewing_scheduled')).toBe(
      'completed',
    )
    expect(milestoneVisualState('Rental', 'application_submitted', 'application_submitted')).toBe(
      'current',
    )
    expect(milestoneVisualState('Rental', 'viewing_scheduled', 'application_started')).toBe(
      'upcoming',
    )
  })

  it('exposes lifecycle milestones and stage document requirements', () => {
    const app = normalizeApplication(rentalApp({ workflowStatus: 'documents_requested' }))
    const milestones = getLifecycleMilestones('Rental')
    expect(milestones.some((m) => m.key === 'documents_requested')).toBe(true)
    const req = getStageRequirements('documents_requested')
    expect(req?.documentKeys?.length).toBeGreaterThan(0)
    expect(documentsForStage(app, 'documents_requested').length).toBeGreaterThan(0)
  })

  // P0-approve (R10): the stuck-71% recovery — an application past approval
  // with NO lease must surface 'Approve & create lease'; one holding a lease
  // must keep the plain deposit flow.
  describe('RECOVER_APPROVE lease recovery', () => {
    // DQ-C2: lease recovery also soft-gated on verified FICA pack
    const leaselessApp = normalizeApplication(
      rentalApp({
        workflowStatus: 'deposit_invoice_sent',
        stage: 'Deposit invoice issued',
        documents: verifiedFicaPackDocs(),
        ...clearedScreeningFields(),
      }),
    )

    it('offers Approve & create lease only when no lease exists', () => {
      const withoutLease = getAvailableTransitions(leaselessApp, ['applications.review'], false)
      const recover = withoutLease.find((t) => t.actionKey === 'RECOVER_APPROVE')
      expect(recover).toBeDefined()
      expect(recover?.effect).toBe('approve')
      expect(recover?.to).toBe('conditionally_approved')

      const withLease = getAvailableTransitions(leaselessApp, ['applications.review'], true)
      expect(withLease.find((t) => t.actionKey === 'RECOVER_APPROVE')).toBeUndefined()
      // Deposit flow remains available in both cases
      expect(withLease.some((t) => t.actionKey === 'CONFIRM_DEPOSIT_PAID')).toBe(true)
    })

    it('primaryNextTransition prefers Approve & create lease when leaseExists=false', () => {
      const next = primaryNextTransition(leaselessApp, ['applications.review'], false)
      expect(next?.actionKey).toBe('RECOVER_APPROVE')
      const withLease = primaryNextTransition(leaselessApp, ['applications.review'], true)
      expect(withLease?.actionKey).toBe('CONFIRM_DEPOSIT_PAID')
    })

    it('defaults to lease-exists behavior for legacy callers', () => {
      const legacy = getAvailableTransitions(leaselessApp, ['applications.review'])
      expect(legacy.find((t) => t.actionKey === 'RECOVER_APPROVE')).toBeUndefined()
    })

    it('is permission-gated behind applications.review', () => {
      const denied = getAvailableTransitions(leaselessApp, [], false)
      expect(denied.find((t) => t.actionKey === 'RECOVER_APPROVE')).toBeUndefined()
    })

    it('never appears for applications already holding an applicant-side approval flow', () => {
      // A lease-less app still at review stage follows the normal approve path
      const early = normalizeApplication(
        rentalApp({
          workflowStatus: 'agent_review',
          documents: verifiedFicaPackDocs(),
          ...clearedScreeningFields(),
        }),
      )
      const transitions = getAvailableTransitions(early, ['applications.review'], false)
      expect(transitions.find((t) => t.actionKey === 'RECOVER_APPROVE')).toBeUndefined()
      expect(transitions.some((t) => t.actionKey === 'AGENT_APPROVE')).toBe(true)
    })

    it('hides Approve & create lease when FICA pack is incomplete', () => {
      const incomplete = normalizeApplication(
        rentalApp({
          workflowStatus: 'deposit_invoice_sent',
          stage: 'Deposit invoice issued',
          documents: buildDocumentChecklist('Rental').map((d) => ({ ...d, status: 'uploaded' as const })),
        }),
      )
      const transitions = getAvailableTransitions(incomplete, ['applications.review'], false)
      expect(transitions.find((t) => t.actionKey === 'RECOVER_APPROVE')).toBeUndefined()
    })

    it('hides Approve & create lease when screening is incomplete (DQ-C3)', () => {
      const incomplete = normalizeApplication(
        rentalApp({
          workflowStatus: 'deposit_invoice_sent',
          stage: 'Deposit invoice issued',
          documents: verifiedFicaPackDocs(),
          screening: { status: 'pending', provider: 'mock' },
          creditCheck: 'Not Started',
          creditConsent: true,
        }),
      )
      const transitions = getAvailableTransitions(incomplete, ['applications.review'], false)
      expect(transitions.find((t) => t.actionKey === 'RECOVER_APPROVE')).toBeUndefined()
    })
  })
})

describe('landlord portal review transitions', () => {
  it('portal.owner can approve or decline from landlord_review', () => {
    const app = {
      id: 'APP-LL-1',
      agencyId: 'ag-horizon',
      propertyId: 'PR-1001',
      agentId: null,
      applicantUserId: 'u-tenant',
      applicantName: 'Test Applicant',
      email: 'a@example.com',
      phone: '',
      type: 'Rental' as const,
      workflowStatus: 'landlord_review',
      stage: 'Owner / landlord approval',
      progress: 40,
      income: 0,
      employment: '',
      creditCheck: 'Passed' as const,
      creditConsent: true,
      screening: { status: 'passed' as const, provider: 'mock' as const },
      documents: verifiedFicaPackDocs(),
      docs: [],
      viewingSlotId: null,
      notes: '',
      submittedAt: '2026-01-01',
      updatedAt: '2026-01-01',
    }
    const owner = getAvailableTransitions(app, ['portal.owner'])
    expect(owner.some((t) => t.actionKey === 'CONDITIONALLY_APPROVE')).toBe(true)
    expect(owner.some((t) => t.actionKey === 'LANDLORD_REJECTED')).toBe(true)
    expect(owner.some((t) => t.actionKey === 'SEND_LANDLORD_REVIEW')).toBe(false)

    const staff = getAvailableTransitions(app, ['applications.review'])
    expect(staff.some((t) => t.actionKey === 'CONDITIONALLY_APPROVE')).toBe(true)
  })
})


describe('Mode A purchase invent-kill labels', () => {
  function purchaseApp(overrides: Partial<Application> = {}): Application {
    return {
      id: 'APP-905',
      agencyId: 'ag-horizon',
      propertyId: 'PR-1001',
      agentId: 'u-lerato',
      applicantUserId: null,
      applicantName: 'Nomsa Dlamini',
      email: 'nomsa.d@email.com',
      phone: '+27 71 883 1102',
      type: 'Purchase',
      workflowStatus: 'transfer_processing',
      stage: 'Transfer attorney processing',
      progress: 68,
      income: 92000,
      employment: 'Standard Bank — Analyst',
      creditCheck: 'Passed',
      creditConsent: true,
      documents: buildDocumentChecklist('Purchase'),
      docs: [],
      viewingSlotId: null,
      notes: '',
      submittedAt: '2026-07-21',
      updatedAt: '2026-07-21',
      ...overrides,
    }
  }

  it('uses staff-recorded bond/lodgement hints — not invented deeds/bank facts', () => {
    const bond = PURCHASE_WORKFLOW.transitions.find((t) => t.actionKey === 'BOND_APPROVED')
    const lodge = PURCHASE_WORKFLOW.transitions.find((t) => t.actionKey === 'DEEDS_LODGEMENT')
    expect(bond?.label).toMatch(/Record bond outcome from bank letter/i)
    expect(bond?.hint).not.toMatch(/Bank grants home loan/i)
    expect(lodge?.label).toMatch(/Mark lodgement recorded/i)
    expect(lodge?.hint).not.toMatch(/Documents lodged at Deeds Office/i)
  })

  it('offers next-actions from mid-transfer APP-905 status', () => {
    const app = normalizeApplication(purchaseApp())
    expect(resolveWorkflowStatus(app)).toBe('transfer_processing')
    const actions = getAvailableTransitions(app, ['applications.review'])
    expect(actions.some((a) => a.actionKey === 'COMPLIANCE_CERTS')).toBe(true)
    expect(primaryNextTransition(app, ['applications.review'])).not.toBeNull()
  })
})

describe('Mode A PCR soft-gate on keys / move-in', () => {
  it('hides KEYS_READY until incoming PCR soft-signed or override', () => {
    const app = normalizeApplication(
      rentalApp({
        workflowStatus: 'inspection_completed',
        stage: 'Move-in inspection completed',
        documents: verifiedFicaPackDocs(),
        ...clearedScreeningFields(),
      }),
    )
    const blocked = getAvailableTransitions(app, ['applications.review'])
    expect(blocked.some((a) => a.actionKey === 'KEYS_READY')).toBe(false)

    const cleared = normalizeApplication({
      ...app,
      pcrInspections: [
        {
          id: 'pcr-in-APP-1',
          agencyId: app.agencyId,
          applicationId: app.id,
          propertyId: app.propertyId,
          kind: 'incoming',
          status: 'signed',
          rooms: [],
          generalNotes: '',
          ingoingPcrSigned: true,
          createdAt: '2026-10-01T10:00:00+02:00',
          updatedAt: '2026-10-01T10:00:00+02:00',
        },
      ],
    })
    const open = getAvailableTransitions(cleared, ['applications.review'])
    expect(open.some((a) => a.actionKey === 'KEYS_READY')).toBe(true)
  })
})

describe('P0 Approve→occupancy from document stages', () => {
  it('exposes AGENT_APPROVE from documents_uploaded when FICA verified + screening cleared', () => {
    const app = rentalApp({
      workflowStatus: 'documents_uploaded',
      documents: verifiedFicaPackDocs(),
      ...clearedScreeningFields(),
    })
    const transitions = getAvailableTransitions(app, ['applications.review'])
    expect(transitions.some((t) => t.actionKey === 'AGENT_APPROVE')).toBe(true)
  })

  it('hides AGENT_APPROVE from documents_uploaded when screening pending', () => {
    const app = rentalApp({
      workflowStatus: 'documents_uploaded',
      documents: verifiedFicaPackDocs(),
      screening: { status: 'pending', provider: 'mock' },
      creditCheck: 'In Progress',
    })
    const transitions = getAvailableTransitions(app, ['applications.review'])
    expect(transitions.some((t) => t.actionKey === 'AGENT_APPROVE')).toBe(false)
  })
})
