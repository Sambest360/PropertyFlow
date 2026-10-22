import type { Application } from '../../types/domain'
import { getStageDef, resolveWorkflowStatus, type WorkflowStatusKey } from '../applicationWorkflow.js'
import { captureScreeningConsent, resolveConsent } from './pipeline.js'

export type AdultCreditConsentRecord = {
  name: string
  idNumber: string
  signatureText: string
  grantedAt: string
  method: 'applicant'
}

export type CreditCheckConsents = {
  adults: AdultCreditConsentRecord[]
}

function normalizeId(value: string): string {
  return value.replace(/\s+/g, '').toLowerCase()
}

/** Adults that must consent before credit check (at least the primary applicant). */
export function creditConsentAdultsRequired(app: Application): Array<{ name: string; idNumber: string }> {
  const rosterRows = app.creditCheckConsents?.adults ?? []
  if (rosterRows.length) {
    const byId = new Map<string, { name: string; idNumber: string }>()
    for (const a of rosterRows) {
      const id = normalizeId(a.idNumber)
      if (!id) continue
      byId.set(id, { name: a.name, idNumber: a.idNumber })
    }
    if (byId.size) return [...byId.values()]
  }
  return [
    {
      name: app.applicantName,
      idNumber: app.idNumberOrPassport ?? '',
    },
  ].filter((a) => a.name.trim())
}

export function hasAllAdultCreditConsents(app: Application): boolean {
  const required = creditConsentAdultsRequired(app)
  if (!required.length) return false
  const granted = app.creditCheckConsents?.adults ?? []
  return required.every((adult) => {
    const id = normalizeId(adult.idNumber)
    if (!id) return false
    return granted.some(
      (g) =>
        normalizeId(g.idNumber) === id &&
        g.signatureText.trim().length >= 2 &&
        g.name.trim().length > 0,
    )
  })
}

export function isPreCreditCheckWorkflow(status: WorkflowStatusKey): boolean {
  const creditOrder = getStageDef('Rental', 'credit_check')?.order ?? 999
  const order = getStageDef('Rental', status)?.order ?? -1
  if (order < 0) return false
  if (status === 'rejected' || status === 'withdrawn' || status === 'cancelled') return false
  return order < creditOrder
}

export function needsCreditConsentTask(app: Application): boolean {
  const status = resolveWorkflowStatus(app)
  if (app.type !== 'Rental') return false
  if (!isPreCreditCheckWorkflow(status)) return false
  return !hasAllAdultCreditConsents(app)
}

export function captureAdultCreditCheckConsents(
  app: Application,
  input: {
    adults: Array<{ name: string; idNumber: string; signatureText: string }>
    grantedBy?: string | null
    at?: string
  },
): Application {
  const at = input.at ?? new Date().toISOString()
  const merged: AdultCreditConsentRecord[] = [...(app.creditCheckConsents?.adults ?? [])]
  for (const row of input.adults) {
    const id = normalizeId(row.idNumber)
    if (!id || !row.signatureText.trim()) continue
    const next: AdultCreditConsentRecord = {
      name: row.name.trim(),
      idNumber: row.idNumber.trim(),
      signatureText: row.signatureText.trim(),
      grantedAt: at,
      method: 'applicant',
    }
    const idx = merged.findIndex((g) => normalizeId(g.idNumber) === id)
    if (idx >= 0) merged[idx] = next
    else merged.push(next)
  }
  let next: Application = {
    ...app,
    creditCheckConsents: { adults: merged },
  }
  if (hasAllAdultCreditConsents(next) && !resolveConsent(next).granted) {
    next = captureScreeningConsent(next, {
      grantedBy: input.grantedBy ?? null,
      method: 'portal',
      note: 'All adult NCA consents captured',
      at,
    })
  }
  return next
}

/** Set the roster of adults (add/remove co-applicants) without granting consent. */
export function setCreditConsentAdultRoster(
  app: Application,
  adults: Array<{ name: string; idNumber: string }>,
): Application {
  const trimmed = adults
    .map((a) => ({ name: a.name.trim(), idNumber: a.idNumber.trim() }))
    .filter((a) => a.name && a.idNumber)
  if (!trimmed.length) {
    return { ...app, creditCheckConsents: { adults: app.creditCheckConsents?.adults ?? [] } }
  }
  const granted = app.creditCheckConsents?.adults ?? []
  const kept = granted.filter((g) =>
    trimmed.some((t) => normalizeId(t.idNumber) === normalizeId(g.idNumber)),
  )
  return { ...app, creditCheckConsents: { adults: kept } }
}
