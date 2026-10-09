/** Mode A honesty — checklist/status only; not attorney/Deeds. */
export const CONVEYANCING_MODE_A_COPY =
  'Non-production conveyancing. Closing checklist and status labels are staff-recorded in-app only — not a live attorney portal, Deeds Office e-filing, or bank bond-approval feed. Bond/transfer calculators remain estimates (not a quote).'

/**
 * Mode A purchase closing checklist — staff-recorded ticks only.
 * Not live attorney portal, e-filing, Deeds Office, or bank bond HTTP.
 */

export const CLOSING_CHECKLIST_KEYS = [
  'sale_agreement_signed',
  'attorney_appointed',
  'fica_complete',
  'bond_outcome_recorded',
  'deposit_received',
  'compliance_certs',
  'rates_clearance',
  'transfer_duty_paid',
  'lodgement_recorded',
  'registration_recorded',
  'keys_handed_over',
] as const

export type ClosingChecklistKey = (typeof CLOSING_CHECKLIST_KEYS)[number]

export type ClosingChecklistItemDef = {
  key: ClosingChecklistKey
  label: string
  hint: string
}

/** Soft-demo checklist labels — staff ticks, not system-asserted deeds/bank facts. */
export const CLOSING_CHECKLIST_ITEMS: ClosingChecklistItemDef[] = [
  {
    key: 'sale_agreement_signed',
    label: 'Sale agreement signed',
    hint: 'Staff recorded that both parties signed the OTP / sale agreement',
  },
  {
    key: 'attorney_appointed',
    label: 'Transfer attorney appointed',
    hint: 'Staff recorded the conveyancing firm (optional note below)',
  },
  {
    key: 'fica_complete',
    label: 'FICA recorded complete',
    hint: 'Staff recorded FICA pack complete — not a live bureau call',
  },
  {
    key: 'bond_outcome_recorded',
    label: 'Bond outcome recorded',
    hint: 'Staff recorded bank letter outcome — not live bond approval',
  },
  {
    key: 'deposit_received',
    label: 'Deposit received',
    hint: 'Staff recorded deposit receipt from trust / attorney letter',
  },
  {
    key: 'compliance_certs',
    label: 'Compliance certificates recorded',
    hint: 'Electrical / plumbing / beetle etc. — staff tick from attorney pack',
  },
  {
    key: 'rates_clearance',
    label: 'Rates clearance recorded',
    hint: 'Staff recorded municipal rates clearance from attorney pack',
  },
  {
    key: 'transfer_duty_paid',
    label: 'Transfer duty recorded paid',
    hint: 'Staff recorded SARS transfer-duty receipt — not live SARS filing',
  },
  {
    key: 'lodgement_recorded',
    label: 'Lodgement recorded',
    hint: 'Staff marked lodgement recorded from attorney update — not e-filing',
  },
  {
    key: 'registration_recorded',
    label: 'Registration recorded',
    hint: 'Staff recorded registration notice — not live Deeds Office feed',
  },
  {
    key: 'keys_handed_over',
    label: 'Keys handed over',
    hint: 'Staff recorded key handover on occupation',
  },
]

export type PurchaseClosingChecklist = {
  /** Manual staff ticks — soft-demo only. */
  ticks: Partial<Record<ClosingChecklistKey, boolean>>
  /** Optional staff note naming the conveyancing firm. */
  attorneyFirmNote?: string
  /** Optional staff note for lodgement / attorney reference. */
  lodgementReferenceNote?: string
  updatedAt?: string
}

export function emptyClosingChecklist(): PurchaseClosingChecklist {
  return { ticks: {} }
}

export function closingChecklistProgress(checklist: PurchaseClosingChecklist | undefined): {
  done: number
  total: number
  pct: number
} {
  const total = CLOSING_CHECKLIST_KEYS.length
  const ticks = checklist?.ticks ?? {}
  const done = CLOSING_CHECKLIST_KEYS.filter((k) => ticks[k] === true).length
  return { done, total, pct: Math.round((done / total) * 100) }
}

/** Mid-transfer demo seed for APP-905 — staff-recorded ticks only. */
export function midTransferDemoChecklist(): PurchaseClosingChecklist {
  return {
    ticks: {
      sale_agreement_signed: true,
      attorney_appointed: true,
      fica_complete: true,
      bond_outcome_recorded: true,
      deposit_received: true,
      compliance_certs: true,
      rates_clearance: false,
      transfer_duty_paid: false,
      lodgement_recorded: false,
      registration_recorded: false,
      keys_handed_over: false,
    },
    attorneyFirmNote: 'Horizon Conveyancers (demo note — not a live attorney portal)',
    lodgementReferenceNote: '',
    updatedAt: '2026-07-21',
  }
}
