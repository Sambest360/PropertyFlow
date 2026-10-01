import type { PaymentRecord } from '../../types/domain'
import type { DunningNoticeDraft, DunningStage, RentCycleAsOf } from './types'
import { DUNNING_NON_PRODUCTION_NOTE } from './types'
import { daysPastDueOn } from './schedule'

/** Day+3 / +7 / +14 stages (aligned with trust arrears copy — operational Mode A). */
export function dunningStageForDays(daysOverdue: number): DunningStage | null {
  if (daysOverdue < 3) return null
  if (daysOverdue < 7) return 'reminder_1'
  if (daysOverdue < 14) return 'reminder_2'
  return 'final'
}

export function dunningStageLabel(stage: DunningStage): string {
  switch (stage) {
    case 'reminder_1':
      return 'First reminder (Day +3)'
    case 'reminder_2':
      return 'Second reminder (Day +7)'
    case 'final':
      return 'Final notice (Day +14)'
  }
}

/**
 * Build an in-app dunning notice. Honest: no live email/SMS/bank claim.
 * Staff may still send before Day +3 by forcing a stage.
 */
export function buildDunningNotice(params: {
  payment: Pick<PaymentRecord, 'id' | 'type' | 'amount' | 'dueDate' | 'partyName' | 'status'>
  propertyTitle: string
  asOf: RentCycleAsOf
  /** Force a stage (staff action); otherwise derived from days overdue. */
  stage?: DunningStage
  amountLabel: string
}): DunningNoticeDraft | null {
  const days = daysPastDueOn(params.payment.dueDate, params.payment.status, params.asOf)
  const stage = params.stage ?? dunningStageForDays(days)
  if (!stage) return null

  const label = dunningStageLabel(stage)
  const title = `Rent notice · ${label}`
  const body = [
    `${params.payment.partyName}: ${params.payment.type} of ${params.amountLabel} for ${params.propertyTitle}`,
    `was due ${params.payment.dueDate} (${days} day${days === 1 ? '' : 's'} overdue).`,
    DUNNING_NON_PRODUCTION_NOTE,
  ].join(' ')

  const notesLine = `[Dunning ${params.asOf} · ${stage} · in-app] ${label}. ${DUNNING_NON_PRODUCTION_NOTE}`

  return {
    stage,
    title,
    body,
    notesLine,
    nonProduction: true,
    channel: 'in_app',
  }
}

/** Append a dunning audit line to existing payment notes. */
export function appendDunningNotes(existing: string | null | undefined, line: string): string {
  const prev = (existing ?? '').trim()
  return prev ? `${prev}\n${line}` : line
}

/** Whether staff can send a dunning notice for this open overdue line. */
export function canSendDunningNotice(
  payment: Pick<PaymentRecord, 'status' | 'dueDate' | 'type'>,
  asOf: RentCycleAsOf,
): boolean {
  if (payment.status !== 'Due' && payment.status !== 'Overdue') return false
  if (payment.type !== 'Rent' && payment.type !== 'First Month Rent' && payment.type !== 'Deposit') {
    return false
  }
  return daysPastDueOn(payment.dueDate, payment.status, asOf) > 0
}
