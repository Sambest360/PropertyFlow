/**
 * Client for the server-side screening API (server/screeningRoutes.ts).
 * Needs the API (isApiEnabled); there is no Supabase-direct path for checks.
 */
import { authHeaders } from './authClient'
import { isApiEnabled } from './config'
import type {
  ScreeningCheckStatus,
  ScreeningCheckType,
  ScreeningPayer,
} from '../screening/consentTerms'

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) || ''

export const screeningApiAvailable = isApiEnabled

export type ScreeningCheckSummary = {
  id: string
  checkType: ScreeningCheckType
  provider: string
  providerName: string
  status: ScreeningCheckStatus
  summary: Record<string, unknown>
  attempt: number
  previousCheckId: string | null
  requestedAt: string
  completedAt: string | null
  retainUntil: string | null
  purged: boolean
}

export type LandlordCheck = { id: string; checkType: ScreeningCheckType; outcome: 'PASS' | 'FAIL' | 'PENDING' }

export type ScreeningQuote = { provider: string; providerName: string; priceCents: number; payer: ScreeningPayer }

export type ScreeningChecksResponse =
  | { ok: true; view: 'landlord'; checks: LandlordCheck[] }
  | { ok: true; view: 'subject'; checks: ScreeningCheckSummary[] }
  | {
      ok: true
      view: 'staff'
      canRequest: boolean
      canViewFull: boolean
      enabledChecks: ScreeningCheckType[]
      payer: ScreeningPayer
      quotes: Partial<Record<ScreeningCheckType, ScreeningQuote | null>>
      consentCovers: Partial<Record<ScreeningCheckType, boolean>>
      checks: ScreeningCheckSummary[]
    }

export type ScreeningConsentView = {
  id: string
  subjectName: string
  subjectId: string
  checkTypes: ScreeningCheckType[]
  consentTextVersion: string
  acceptedAt: string
  expiresAt: string
  withdrawnAt: string | null
  active: boolean
}

export type ScreeningConsentTerms = {
  ok: true
  version: string
  agencyName: string
  applicantName: string
  checkTypes: ScreeningCheckType[]
  providers: Partial<Record<ScreeningCheckType, string[]>>
  creditRetentionMonths: number
  validDays: number
  text: string
  consents: ScreeningConsentView[]
}

export type AgencyScreeningSettings = {
  enabledChecks: ScreeningCheckType[]
  providers: Partial<Record<ScreeningCheckType, string[]>>
  payer: ScreeningPayer
  creditRetentionMonths: number
}

export type ScreeningProviderChoice = {
  id: string
  name: string
  supports: ScreeningCheckType[]
  configured: boolean
}

export type ScreeningUsageRow = {
  clientId: string
  agencyRef: string
  agencyName: string
  provider: string
  checkType: ScreeningCheckType
  payer: ScreeningPayer
  count: number
  costCents?: number
  priceCents: number
  uninvoicedPriceCents: number
}

export type ScreeningPrice = {
  provider: string
  checkType: ScreeningCheckType
  costCents?: number
  markupBps?: number
  priceCents: number
}

export class ScreeningApiError extends Error {
  status: number
  code?: string
  constructor(status: number, message: string, code?: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  if (!isApiEnabled) throw new ScreeningApiError(503, 'Screening needs the API server.')
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...authHeaders() },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) {
    throw new ScreeningApiError(
      res.status,
      typeof json.message === 'string' ? json.message : 'Screening request failed',
      typeof json.code === 'string' ? json.code : undefined,
    )
  }
  return json as T
}

const q = encodeURIComponent

export const screeningApi = {
  listChecks: (applicationId: string) =>
    request<ScreeningChecksResponse>('GET', `/api/screening/checks?applicationId=${q(applicationId)}`),
  requestCheck: (applicationId: string, checkType: ScreeningCheckType, confirmDuplicate = false) =>
    request<{
      ok: boolean
      reused: boolean
      warning?: string
      message?: string
      error?: string
      check: ScreeningCheckSummary | null
    }>('POST', '/api/screening/checks', { applicationId, checkType, confirmDuplicate }),
  fullResult: (checkId: string) =>
    request<{ ok: true; check: ScreeningCheckSummary; result: unknown }>('GET', `/api/screening/checks/${q(checkId)}/full`),
  consentTerms: (applicationId: string) =>
    request<ScreeningConsentTerms>('GET', `/api/screening/consent-terms?applicationId=${q(applicationId)}`),
  giveConsent: (input: {
    applicationId: string
    checkTypes: ScreeningCheckType[]
    typedName: string
    subjectName?: string
    idNumber?: string
    consentTextVersion: string
  }) => request<{ ok: true; consent: ScreeningConsentView }>('POST', '/api/screening/consents', { ...input, accepted: true }),
  withdrawConsent: (consentId: string) =>
    request<{ ok: true }>('POST', `/api/screening/consents/${q(consentId)}/withdraw`, {}),
  getSettings: (agencyId?: string) =>
    request<{
      ok: true
      settings: AgencyScreeningSettings
      providers: ScreeningProviderChoice[]
      defaultOrder: Record<ScreeningCheckType, string[]>
    }>('GET', `/api/screening/settings${agencyId ? `?agencyId=${q(agencyId)}` : ''}`),
  saveSettings: (settings: AgencyScreeningSettings, agencyId?: string) =>
    request<{ ok: true; settings: AgencyScreeningSettings }>('PUT', '/api/screening/settings', { settings, agencyId }),
  usage: (month: string, agencyId?: string) =>
    request<{
      ok: true
      month: string
      rows: ScreeningUsageRow[]
      totals: { count: number; costCents?: number; priceCents: number; uninvoicedPriceCents: number }
    }>('GET', `/api/admin/screening/usage?month=${q(month)}${agencyId ? `&agencyId=${q(agencyId)}` : ''}`),
  bill: (agencyId: string, month: string, invoiceId: string) =>
    request<{ ok: true; count: number; priceCents: number; lineItemAdded: boolean }>(
      'POST',
      '/api/admin/screening/usage/bill',
      { agencyId, month, invoiceId },
    ),
  pricing: () =>
    request<{ ok: true; providers: ScreeningProviderChoice[]; prices: ScreeningPrice[] }>('GET', '/api/admin/screening/pricing'),
  setPrice: (input: { provider: string; checkType: ScreeningCheckType; costCents: number; markupBps: number }) =>
    request<{ ok: true; price: ScreeningPrice }>('PUT', '/api/admin/screening/pricing', input),
}

export function formatCents(cents: number): string {
  return `R${(cents / 100).toFixed(2)}`
}
