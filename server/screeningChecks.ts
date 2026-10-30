/**
 * Server-side screening checks (FICA ID / liveness / bank AVS, credit, rental history).
 *
 * The agency is the FICA accountable institution; Lekaya is the POPIA operator.
 * - Consent is given by the subject only and names the checks, providers and
 *   retention. A check needs an unexpired, unwithdrawn consent covering its type.
 * - Providers are picked per check type from clients.settings.screening.providers,
 *   then the default fallback order. An ERROR attempt is never charged and the
 *   next provider is tried.
 * - Full results are sealed with 256-bit GCM (screeningCrypto.ts); only a summary is
 *   readable without the key. Viewing the full result writes a VIEWED_FULL audit row.
 * - Never log ID numbers or provider payloads.
 *
 * Only the mock provider runs. tpn / verifynow / verifyid / deis are stubs that
 * throw "not configured" without their env keys and never call out.
 */
import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import type { DemoActor } from './actor.js'
import { openJson, openText, sealJson, sealText } from './screeningCrypto.js'
import {
  DEFAULT_CREDIT_RETENTION_MONTHS,
  ID_CHECK_TYPES,
  ID_RETENTION_YEARS_AFTER_RELATIONSHIP,
  SCREENING_CHECK_TYPES,
  SCREENING_CONSENT_VALID_DAYS,
  SCREENING_CONSENT_VERSION,
  buildConsentText,
  isScreeningCheckType,
  maskLast4,
  priceWithMarkup,
  providerDisplayName,
  type ScreeningCheckStatus,
  type ScreeningCheckType,
  type ScreeningPayer,
} from '../src/lib/screening/consentTerms.js'

export type { ScreeningCheckStatus, ScreeningCheckType, ScreeningPayer }

type Env = Record<string, string | undefined>

export const DUPLICATE_WINDOW_DAYS = 30
const DAY_MS = 86_400_000

const TERMINAL: ReadonlySet<ScreeningCheckStatus> = new Set(['PASSED', 'FAILED', 'REFER', 'ERROR', 'CANCELLED'])
const BILLABLE: ReadonlySet<ScreeningCheckStatus> = new Set(['PASSED', 'FAILED', 'REFER'])
const OPEN: ScreeningCheckStatus[] = ['REQUESTED', 'IN_PROGRESS']

export function screeningError(status: number, code: string, message: string): Error & { status: number; code: string } {
  return Object.assign(new Error(message), { status, code })
}

// ---------------------------------------------------------------------------
// Providers
// ---------------------------------------------------------------------------

export type ProviderRequest = {
  checkType: ScreeningCheckType
  /** Our check id; providers echo it back as their reference. */
  reference: string
  subject: { name: string; idNumber: string | null }
}

export type ProviderResult = {
  status: ScreeningCheckStatus
  providerRef: string | null
  /** Non-sensitive outcome shown to agency staff. */
  summary: Record<string, unknown>
  /** Full provider result; sealed before it is stored. */
  result?: unknown
}

export type ScreeningProvider = {
  id: string
  supports: readonly ScreeningCheckType[]
  /** False when the env keys it needs are missing (it is then skipped). */
  configured: boolean
  request(input: ProviderRequest): Promise<ProviderResult>
  fetchResult(providerRef: string): Promise<ProviderResult>
  verifyWebhook(rawBody: string, headers: Record<string, string | undefined>): boolean
  parseWebhook(body: unknown): ProviderResult
}

/** HMAC-SHA256 hex of the raw body in x-screening-signature (optionally "sha256=" prefixed). */
export function verifyHmacSignature(rawBody: string, header: string | undefined, secret: string | undefined): boolean {
  const s = secret?.trim()
  if (!s || !header) return false
  const got = Buffer.from(header.trim().replace(/^sha256=/i, ''), 'utf8')
  const expected = Buffer.from(createHmac('sha256', s).update(rawBody, 'utf8').digest('hex'), 'utf8')
  if (got.length !== expected.length) return false
  return timingSafeEqual(got, expected)
}

export function signWebhookBody(rawBody: string, secret: string): string {
  return createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')
}

function webhookSecretEnv(providerId: string): string {
  return `SCREENING_${providerId.toUpperCase()}_WEBHOOK_SECRET`
}

function signatureHeader(headers: Record<string, string | undefined>): string | undefined {
  return headers['x-screening-signature'] ?? headers['X-Screening-Signature']
}

function mapWebhookStatus(v: unknown): ScreeningCheckStatus {
  const s = String(v ?? '').toUpperCase()
  if (s === 'PASS' || s === 'PASSED') return 'PASSED'
  if (s === 'FAIL' || s === 'FAILED') return 'FAILED'
  if (s === 'REFER') return 'REFER'
  if (s === 'ERROR') return 'ERROR'
  if (s === 'CANCELLED') return 'CANCELLED'
  return 'IN_PROGRESS'
}

function mockOutcome(status: ScreeningCheckStatus, checkType: ScreeningCheckType, at: string) {
  const outcome = status === 'PASSED' ? 'PASS' : status === 'FAILED' ? 'FAIL' : 'REFER'
  const summary: Record<string, unknown> = { outcome, checkedAt: at, mock: true }
  if (checkType === 'CREDIT') {
    summary.score = outcome === 'PASS' ? 712 : outcome === 'FAIL' ? 480 : 590
    summary.band = outcome === 'PASS' ? 'Good' : outcome === 'FAIL' ? 'Poor' : 'Fair'
  }
  return summary
}

/**
 * Deterministic test provider, keyed on the last digit of the ID number:
 * 0 PASS, 1 FAIL, 2 REFER, 3 async (completes by webhook), 9 ERROR, else PASS.
 * Disabled in production (NODE_ENV=production) unless SCREENING_ALLOW_MOCK=1.
 */
export function createMockProvider(env: Env, now: () => Date = () => new Date()): ScreeningProvider {
  const productionLocked = env.NODE_ENV?.trim() === 'production' && env.SCREENING_ALLOW_MOCK?.trim() !== '1'
  return {
    id: 'mock',
    supports: SCREENING_CHECK_TYPES,
    configured: !productionLocked,
    async request(input) {
      const digit = (input.subject.idNumber ?? '').replace(/\D/g, '').slice(-1)
      const providerRef = `mock-${input.reference}`
      if (digit === '9') return { status: 'ERROR', providerRef: null, summary: { error: 'mock_provider_error' } }
      if (digit === '3') return { status: 'IN_PROGRESS', providerRef, summary: { mock: true } }
      const status: ScreeningCheckStatus = digit === '1' ? 'FAILED' : digit === '2' ? 'REFER' : 'PASSED'
      const at = now().toISOString()
      const summary = mockOutcome(status, input.checkType, at)
      return {
        status,
        providerRef,
        summary,
        result: {
          provider: 'mock',
          providerRef,
          checkType: input.checkType,
          subjectName: input.subject.name,
          outcome: summary.outcome,
          detail: { note: 'E2E TEST mock bureau response. No real check was run.', checkedAt: at },
        },
      }
    },
    async fetchResult(providerRef) {
      const at = now().toISOString()
      return { status: 'PASSED', providerRef, summary: { outcome: 'PASS', checkedAt: at, mock: true } }
    },
    verifyWebhook(rawBody, headers) {
      return verifyHmacSignature(rawBody, signatureHeader(headers), env[webhookSecretEnv('mock')])
    },
    parseWebhook(body) {
      const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
      const status = mapWebhookStatus(b.status)
      const providerRef = typeof b.providerRef === 'string' ? b.providerRef : null
      const checkType = isScreeningCheckType(b.checkType) ? b.checkType : 'CREDIT'
      const at = typeof b.checkedAt === 'string' ? b.checkedAt : now().toISOString()
      const summary = BILLABLE.has(status) ? mockOutcome(status, checkType, at) : { mock: true }
      return { status, providerRef, summary, result: BILLABLE.has(status) ? { provider: 'mock', providerRef, ...summary } : undefined }
    },
  }
}

function notConfigured(id: string, keys: readonly string[]) {
  return screeningError(503, 'PROVIDER_NOT_CONFIGURED', `${id} is not configured (set ${keys.join(', ')})`)
}

/** Live-provider placeholder: refuses without keys, never calls out. */
export function createStubProvider(
  id: string,
  supports: readonly ScreeningCheckType[],
  requiredEnv: readonly string[],
  env: Env,
): ScreeningProvider {
  const configured = requiredEnv.every((k) => Boolean(env[k]?.trim()))
  const refuse = () => {
    if (!configured) throw notConfigured(id, requiredEnv)
    throw screeningError(501, 'PROVIDER_NOT_IMPLEMENTED', `${id} adapter is not implemented yet`)
  }
  return {
    id,
    supports,
    configured,
    async request() {
      return refuse()
    },
    async fetchResult() {
      return refuse()
    },
    verifyWebhook(rawBody, headers) {
      return verifyHmacSignature(rawBody, signatureHeader(headers), env[webhookSecretEnv(id)])
    },
    parseWebhook() {
      return refuse()
    },
  }
}

export type ProviderRegistry = ReadonlyMap<string, ScreeningProvider>

export function createProviderRegistry(env: Env = process.env, now: () => Date = () => new Date()): ProviderRegistry {
  const providers: ScreeningProvider[] = [
    createMockProvider(env, now),
    createStubProvider('tpn', ['CREDIT', 'RENTAL_HISTORY'], ['SCREENING_TPN_API_KEY', 'SCREENING_TPN_API_URL'], env),
    createStubProvider('verifynow', ['ID_VERIFY', 'LIVENESS', 'BANK_AVS'], ['SCREENING_VERIFYNOW_API_KEY'], env),
    createStubProvider('verifyid', ['ID_VERIFY', 'LIVENESS'], ['SCREENING_VERIFYID_API_KEY'], env),
    createStubProvider('deis', ['BANK_AVS'], ['SCREENING_DEIS_API_KEY'], env),
  ]
  return new Map(providers.map((p) => [p.id, p]))
}

export const DEFAULT_PROVIDER_ORDER: Record<ScreeningCheckType, readonly string[]> = {
  ID_VERIFY: ['verifynow', 'verifyid', 'mock'],
  LIVENESS: ['verifyid', 'verifynow', 'mock'],
  BANK_AVS: ['deis', 'verifynow', 'mock'],
  CREDIT: ['tpn', 'mock'],
  RENTAL_HISTORY: ['tpn', 'mock'],
}

// ---------------------------------------------------------------------------
// Agency settings (clients.settings.screening)
// ---------------------------------------------------------------------------

export type AgencyScreeningSettings = {
  enabledChecks: ScreeningCheckType[]
  providers: Partial<Record<ScreeningCheckType, string[]>>
  payer: ScreeningPayer
  creditRetentionMonths: number
}

export function parseScreeningSettings(settings: unknown): AgencyScreeningSettings {
  const root = settings && typeof settings === 'object' ? (settings as Record<string, unknown>) : {}
  const block = root.screening && typeof root.screening === 'object' ? (root.screening as Record<string, unknown>) : {}
  const enabled = Array.isArray(block.enabledChecks) ? block.enabledChecks.filter(isScreeningCheckType) : null
  const providers: Partial<Record<ScreeningCheckType, string[]>> = {}
  if (block.providers && typeof block.providers === 'object') {
    for (const [k, v] of Object.entries(block.providers as Record<string, unknown>)) {
      if (!isScreeningCheckType(k)) continue
      const list = Array.isArray(v) ? v : typeof v === 'string' ? [v] : []
      providers[k] = list.filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
    }
  }
  const months = Number(block.creditRetentionMonths)
  return {
    enabledChecks: enabled ?? [...SCREENING_CHECK_TYPES],
    providers,
    payer: block.payer === 'APPLICANT' ? 'APPLICANT' : 'AGENCY',
    creditRetentionMonths:
      Number.isInteger(months) && months > 0 && months <= 120 ? months : DEFAULT_CREDIT_RETENTION_MONTHS,
  }
}

/** Agency choice first, then the default fallback order; configured providers that support the type. */
export function orderedProviders(
  registry: ProviderRegistry,
  settings: AgencyScreeningSettings,
  checkType: ScreeningCheckType,
): ScreeningProvider[] {
  const ids = [...(settings.providers[checkType] ?? []), ...DEFAULT_PROVIDER_ORDER[checkType]]
  const out: ScreeningProvider[] = []
  for (const id of ids) {
    const p = registry.get(id)
    if (!p || !p.configured || !p.supports.includes(checkType) || out.includes(p)) continue
    out.push(p)
  }
  return out
}

export function computeRetainUntil(
  checkType: ScreeningCheckType,
  completedAt: Date,
  settings: AgencyScreeningSettings,
  relationshipEnd: Date | 'ongoing' | null,
): Date {
  const d = new Date(completedAt)
  if (ID_CHECK_TYPES.has(checkType)) {
    const base = relationshipEnd instanceof Date && relationshipEnd > completedAt ? new Date(relationshipEnd) : d
    base.setUTCFullYear(base.getUTCFullYear() + ID_RETENTION_YEARS_AFTER_RELATIONSHIP)
    return base
  }
  d.setUTCMonth(d.getUTCMonth() + settings.creditRetentionMonths)
  return d
}

// ---------------------------------------------------------------------------
// Store (Postgres in screeningStore.ts; an in-memory fake in tests)
// ---------------------------------------------------------------------------

export type ApplicationRow = {
  id: string
  ref: string
  clientId: string
  agencyName: string
  agencySettings: unknown
  applicantUserId: string | null
  applicantName: string
  agentId: string | null
  landlordUserId: string | null
  idNumber: string | null
}

export type ConsentRow = {
  id: string
  clientId: string
  applicationId: string | null
  subjectUserId: string | null
  subjectName: string
  subjectIdLast4: string | null
  subjectIdEncrypted: Buffer | null
  subjectIdKeyId: string | null
  checkTypes: ScreeningCheckType[]
  consentTextVersion: string
  consentTextHash: string
  typedName: string
  acceptedAt: Date
  expiresAt: Date
  ip: string | null
  userAgent: string | null
  withdrawnAt: Date | null
}

export type CheckRow = {
  id: string
  clientId: string
  applicationId: string | null
  consentId: string
  checkType: ScreeningCheckType
  provider: string
  providerRef: string | null
  status: ScreeningCheckStatus
  resultSummary: Record<string, unknown>
  resultEncrypted: Buffer | null
  resultKeyId: string | null
  retainUntil: Date | null
  purgedAt: Date | null
  attempt: number
  previousCheckId: string | null
  requestedBy: string | null
  requestedAt: Date
  completedAt: Date | null
}

export type AuditAction =
  | 'CONSENT_GIVEN'
  | 'CONSENT_WITHDRAWN'
  | 'REQUESTED'
  | 'REUSED'
  | 'STATUS_CHANGED'
  | 'WEBHOOK'
  | 'CHARGED'
  | 'VIEWED_FULL'
  | 'PURGED'

export type AuditInsert = {
  clientId: string
  checkId?: string | null
  consentId?: string | null
  action: AuditAction
  actorUserId?: string | null
  detail?: Record<string, unknown>
}

export type ChargeInsert = {
  clientId: string
  checkId: string
  provider: string
  checkType: ScreeningCheckType
  costCents: number
  markupBps: number
  priceCents: number
  payer: ScreeningPayer
  billingMonth: string
}

export type PriceRow = { provider: string; checkType: ScreeningCheckType; costCents: number; markupBps: number }

export type UsageRow = {
  clientId: string
  agencyRef: string
  agencyName: string
  provider: string
  checkType: ScreeningCheckType
  payer: ScreeningPayer
  count: number
  costCents: number
  priceCents: number
  uninvoicedPriceCents: number
}

export type ScreeningStore = {
  tx<T>(fn: () => Promise<T>): Promise<T>
  resolveActor(actor: DemoActor): Promise<{ userUuid: string | null; clientUuid: string | null }>
  resolveClient(ref: string): Promise<string | null>
  loadApplication(ref: string): Promise<ApplicationRow | null>
  agencySettings(clientId: string): Promise<unknown>
  /** Writes clients.settings.screening only (other settings keys untouched). */
  saveAgencyScreeningSettings(clientId: string, settings: AgencyScreeningSettings): Promise<void>
  insertConsent(row: Omit<ConsentRow, 'id'>): Promise<ConsentRow>
  getConsent(id: string): Promise<ConsentRow | null>
  listConsents(applicationId: string): Promise<ConsentRow[]>
  withdrawConsent(id: string, at: Date): Promise<boolean>
  findValidConsent(applicationId: string, checkType: ScreeningCheckType, now: Date): Promise<ConsentRow | null>
  findRecentCheck(applicationId: string, checkType: ScreeningCheckType, since: Date): Promise<CheckRow | null>
  insertCheck(row: Omit<CheckRow, 'id'> & { id?: string }): Promise<CheckRow>
  /** Conditional update; null when the row is missing or not in onlyIfStatus. */
  updateCheck(id: string, patch: Partial<Omit<CheckRow, 'id'>>, onlyIfStatus?: ScreeningCheckStatus[]): Promise<CheckRow | null>
  getCheck(id: string): Promise<CheckRow | null>
  listChecks(applicationId: string): Promise<CheckRow[]>
  findCheckByProviderRef(provider: string, providerRef: string): Promise<CheckRow | null>
  insertAudit(row: AuditInsert): Promise<void>
  getPrice(provider: string, checkType: ScreeningCheckType): Promise<PriceRow | null>
  listPrices(): Promise<PriceRow[]>
  upsertPrice(row: PriceRow, actorUserId: string | null): Promise<PriceRow>
  /** Null when the check is already charged. */
  insertCharge(row: ChargeInsert): Promise<{ id: string } | null>
  usage(billingMonth: string, clientId: string | null): Promise<UsageRow[]>
  billCharges(clientId: string, billingMonth: string, invoiceRef: string): Promise<{ count: number; priceCents: number; lineItemAdded: boolean }>
  purgeCandidates(now: Date, limit: number): Promise<CheckRow[]>
  /** End of the subject's tenancy with the agency ('ongoing' = no end yet, null = none). */
  relationshipEnd(applicationId: string | null, clientId: string): Promise<Date | 'ongoing' | null>
}

export type ScreeningDeps = {
  store: ScreeningStore
  registry: ProviderRegistry
  env: Env
  now: () => Date
  /** Per-user permission switch-off check (server/permissionGate.ts); tests inject a stub. */
  assertNotRestricted?: (actor: DemoActor, permission: 'screening.run') => Promise<void>
}

// ---------------------------------------------------------------------------
// Access
// ---------------------------------------------------------------------------

const AGENCY_ADMIN_ROLES: ReadonlySet<string> = new Set(['client_admin', 'agent_admin'])
const AGENT_ROLES: ReadonlySet<string> = new Set(['ground_agent', 'agent'])

type Access = 'admin' | 'assigned' | 'staff' | 'platform' | 'subject' | 'landlord' | null

async function accessFor(deps: ScreeningDeps, actor: DemoActor, app: ApplicationRow): Promise<{ access: Access; userUuid: string | null }> {
  const { userUuid, clientUuid } = await deps.store.resolveActor(actor)
  if (actor.role === 'super_admin') return { access: 'platform', userUuid }
  const sameAgency = clientUuid != null && clientUuid === app.clientId
  if (sameAgency && AGENCY_ADMIN_ROLES.has(actor.role)) return { access: 'admin', userUuid }
  if (sameAgency && AGENT_ROLES.has(actor.role)) {
    return { access: userUuid && app.agentId === userUuid ? 'assigned' : 'staff', userUuid }
  }
  if (userUuid && actor.role === 'tenant' && app.applicantUserId === userUuid) return { access: 'subject', userUuid }
  if (userUuid && actor.role === 'landlord' && app.landlordUserId === userUuid) return { access: 'landlord', userUuid }
  return { access: null, userUuid }
}

function forbid(message: string) {
  return screeningError(403, 'FORBIDDEN', message)
}

async function requireApplication(deps: ScreeningDeps, ref: unknown): Promise<ApplicationRow> {
  if (typeof ref !== 'string' || !ref.trim()) throw screeningError(400, 'APPLICATION_REQUIRED', 'applicationId is required')
  const app = await deps.store.loadApplication(ref.trim())
  if (!app) throw screeningError(404, 'APPLICATION_NOT_FOUND', 'Application not found')
  return app
}

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

export type CheckSummaryView = {
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

export type LandlordCheckView = {
  id: string
  checkType: ScreeningCheckType
  outcome: 'PASS' | 'FAIL' | 'PENDING'
}

function iso(d: Date | null): string | null {
  return d ? d.toISOString() : null
}

export function summaryView(row: CheckRow): CheckSummaryView {
  return {
    id: row.id,
    checkType: row.checkType,
    provider: row.provider,
    providerName: providerDisplayName(row.provider),
    status: row.status,
    summary: row.resultSummary ?? {},
    attempt: row.attempt,
    previousCheckId: row.previousCheckId,
    requestedAt: row.requestedAt.toISOString(),
    completedAt: iso(row.completedAt),
    retainUntil: iso(row.retainUntil),
    purged: row.purgedAt != null,
  }
}

export function landlordView(row: CheckRow): LandlordCheckView {
  return {
    id: row.id,
    checkType: row.checkType,
    outcome: row.status === 'PASSED' ? 'PASS' : row.status === 'FAILED' ? 'FAIL' : 'PENDING',
  }
}

function consentView(row: ConsentRow, now: Date) {
  return {
    id: row.id,
    subjectName: row.subjectName,
    subjectId: maskLast4(row.subjectIdLast4),
    checkTypes: row.checkTypes,
    consentTextVersion: row.consentTextVersion,
    acceptedAt: row.acceptedAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    withdrawnAt: iso(row.withdrawnAt),
    active: row.withdrawnAt == null && row.expiresAt > now,
  }
}

// ---------------------------------------------------------------------------
// Consent
// ---------------------------------------------------------------------------

export function consentProviders(registry: ProviderRegistry, settings: AgencyScreeningSettings) {
  const out: Partial<Record<ScreeningCheckType, string[]>> = {}
  for (const type of settings.enabledChecks) out[type] = orderedProviders(registry, settings, type).map((p) => p.id)
  return out
}

export function consentHash(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

function normName(v: string): string {
  return v.trim().replace(/\s+/g, ' ').toLowerCase()
}

export async function getConsentTerms(deps: ScreeningDeps, actor: DemoActor, applicationRef: unknown) {
  const app = await requireApplication(deps, applicationRef)
  const { access } = await accessFor(deps, actor, app)
  if (!access || access === 'landlord') throw forbid('Only the applicant or agency staff can see screening consent')
  const settings = parseScreeningSettings(app.agencySettings)
  const providers = consentProviders(deps.registry, settings)
  const checkTypes = settings.enabledChecks
  const text = buildConsentText({
    version: SCREENING_CONSENT_VERSION,
    agencyName: app.agencyName,
    checkTypes,
    providers,
    creditRetentionMonths: settings.creditRetentionMonths,
  })
  const now = deps.now()
  const consents = (await deps.store.listConsents(app.id)).map((c) => consentView(c, now))
  return {
    ok: true as const,
    version: SCREENING_CONSENT_VERSION,
    agencyName: app.agencyName,
    applicantName: app.applicantName,
    checkTypes,
    providers,
    creditRetentionMonths: settings.creditRetentionMonths,
    validDays: SCREENING_CONSENT_VALID_DAYS,
    text,
    consents,
  }
}

export async function giveConsent(
  deps: ScreeningDeps,
  actor: DemoActor,
  body: Record<string, unknown>,
  meta: { ip: string | null; userAgent: string | null },
) {
  const app = await requireApplication(deps, body.applicationId)
  const { access, userUuid } = await accessFor(deps, actor, app)
  if (access !== 'subject' || !userUuid) {
    throw forbid('Only the applicant can give screening consent')
  }
  if (body.accepted !== true) throw screeningError(400, 'CONSENT_NOT_ACCEPTED', 'Tick the consent box to continue')
  if (body.consentTextVersion !== SCREENING_CONSENT_VERSION) {
    throw screeningError(409, 'CONSENT_VERSION_STALE', 'The consent wording changed. Reload and read it again.')
  }
  const settings = parseScreeningSettings(app.agencySettings)
  const requested = Array.isArray(body.checkTypes) ? body.checkTypes : settings.enabledChecks
  const checkTypes = [...new Set(requested)].filter(isScreeningCheckType)
  if (!checkTypes.length || checkTypes.length !== new Set(requested).size) {
    throw screeningError(400, 'CHECK_TYPES_INVALID', 'Choose at least one valid check type')
  }
  const disabled = checkTypes.filter((t) => !settings.enabledChecks.includes(t))
  if (disabled.length) throw screeningError(400, 'CHECK_TYPE_DISABLED', `Not offered by this agency: ${disabled.join(', ')}`)

  const subjectName = typeof body.subjectName === 'string' && body.subjectName.trim() ? body.subjectName.trim() : app.applicantName
  const typedName = typeof body.typedName === 'string' ? body.typedName.trim() : ''
  if (typedName.length < 2 || normName(typedName) !== normName(subjectName)) {
    throw screeningError(400, 'TYPED_NAME_MISMATCH', 'Type your full name exactly as shown to sign')
  }
  const idNumber = (typeof body.idNumber === 'string' && body.idNumber.trim() ? body.idNumber : app.idNumber ?? '')
    .replace(/\s+/g, '')
  const sealedId = idNumber ? sealText(idNumber, deps.env) : null

  const text = buildConsentText({
    version: SCREENING_CONSENT_VERSION,
    agencyName: app.agencyName,
    checkTypes,
    providers: consentProviders(deps.registry, settings),
    creditRetentionMonths: settings.creditRetentionMonths,
  })
  const now = deps.now()
  const row = await deps.store.tx(async () => {
    const inserted = await deps.store.insertConsent({
      clientId: app.clientId,
      applicationId: app.id,
      subjectUserId: userUuid,
      subjectName,
      subjectIdLast4: idNumber ? idNumber.slice(-4) : null,
      subjectIdEncrypted: sealedId?.ciphertext ?? null,
      subjectIdKeyId: sealedId?.keyId ?? null,
      checkTypes,
      consentTextVersion: SCREENING_CONSENT_VERSION,
      consentTextHash: consentHash(text),
      typedName,
      acceptedAt: now,
      expiresAt: new Date(now.getTime() + SCREENING_CONSENT_VALID_DAYS * DAY_MS),
      ip: meta.ip,
      userAgent: meta.userAgent ? meta.userAgent.slice(0, 500) : null,
      withdrawnAt: null,
    })
    await deps.store.insertAudit({
      clientId: app.clientId,
      consentId: inserted.id,
      action: 'CONSENT_GIVEN',
      actorUserId: userUuid,
      detail: { checkTypes, version: SCREENING_CONSENT_VERSION },
    })
    return inserted
  })
  return { ok: true as const, consent: consentView(row, now) }
}

export async function withdrawConsent(deps: ScreeningDeps, actor: DemoActor, consentId: string) {
  const consent = await deps.store.getConsent(consentId)
  if (!consent) throw screeningError(404, 'CONSENT_NOT_FOUND', 'Consent not found')
  const { userUuid } = await deps.store.resolveActor(actor)
  if (!userUuid || consent.subjectUserId !== userUuid) throw forbid('Only the person who gave consent can withdraw it')
  const now = deps.now()
  await deps.store.tx(async () => {
    if (await deps.store.withdrawConsent(consent.id, now)) {
      await deps.store.insertAudit({
        clientId: consent.clientId,
        consentId: consent.id,
        action: 'CONSENT_WITHDRAWN',
        actorUserId: userUuid,
      })
    }
  })
  return { ok: true as const }
}

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

export async function chargeFor(
  deps: ScreeningDeps,
  check: CheckRow,
  settings: AgencyScreeningSettings,
): Promise<ChargeInsert> {
  const price = await deps.store.getPrice(check.provider, check.checkType)
  const costCents = price?.costCents ?? 0
  const markupBps = price?.markupBps ?? 0
  const now = deps.now()
  return {
    clientId: check.clientId,
    checkId: check.id,
    provider: check.provider,
    checkType: check.checkType,
    costCents,
    markupBps,
    priceCents: priceWithMarkup(costCents, markupBps),
    payer: settings.payer,
    billingMonth: `${now.toISOString().slice(0, 7)}-01`,
  }
}

/** Apply a provider result to a check (inside a tx). Charges and sets retention on billable outcomes. */
async function applyResult(
  deps: ScreeningDeps,
  check: CheckRow,
  res: ProviderResult,
  settings: AgencyScreeningSettings,
  actorUserId: string | null,
  source: 'request' | 'webhook',
): Promise<CheckRow | null> {
  const now = deps.now()
  const patch: Partial<CheckRow> = { status: res.status, resultSummary: res.summary ?? {} }
  if (res.providerRef) patch.providerRef = res.providerRef
  if (TERMINAL.has(res.status)) patch.completedAt = now
  if (BILLABLE.has(res.status)) {
    if (res.result !== undefined) {
      const sealed = sealJson(res.result, deps.env)
      patch.resultEncrypted = sealed.ciphertext
      patch.resultKeyId = sealed.keyId
    }
    const rel = ID_CHECK_TYPES.has(check.checkType)
      ? await deps.store.relationshipEnd(check.applicationId, check.clientId)
      : null
    patch.retainUntil = computeRetainUntil(check.checkType, now, settings, rel)
  }
  const updated = await deps.store.updateCheck(check.id, patch, OPEN)
  if (!updated) return null
  await deps.store.insertAudit({
    clientId: check.clientId,
    checkId: check.id,
    action: source === 'webhook' ? 'WEBHOOK' : 'STATUS_CHANGED',
    actorUserId,
    detail: { from: check.status, to: res.status, provider: check.provider },
  })
  if (BILLABLE.has(res.status)) {
    const charge = await chargeFor(deps, updated, settings)
    const inserted = await deps.store.insertCharge(charge)
    if (inserted) {
      await deps.store.insertAudit({
        clientId: check.clientId,
        checkId: check.id,
        action: 'CHARGED',
        actorUserId,
        detail: { priceCents: charge.priceCents, payer: charge.payer },
      })
    }
  }
  return updated
}

async function subjectIdNumber(deps: ScreeningDeps, consent: ConsentRow, app: ApplicationRow): Promise<string | null> {
  if (consent.subjectIdEncrypted && consent.subjectIdKeyId) {
    return openText(consent.subjectIdEncrypted, consent.subjectIdKeyId, deps.env)
  }
  return app.idNumber?.replace(/\s+/g, '') || null
}

export async function requestCheck(deps: ScreeningDeps, actor: DemoActor, body: Record<string, unknown>) {
  const app = await requireApplication(deps, body.applicationId)
  const { access, userUuid } = await accessFor(deps, actor, app)
  if (access !== 'admin' && access !== 'assigned') {
    throw forbid('Only an agency admin or the assigned agent can request screening checks')
  }
  const checkType = body.checkType
  if (!isScreeningCheckType(checkType)) throw screeningError(400, 'CHECK_TYPE_INVALID', 'Unknown check type')
  const settings = parseScreeningSettings(app.agencySettings)
  if (!settings.enabledChecks.includes(checkType)) {
    throw screeningError(400, 'CHECK_TYPE_DISABLED', 'This check is switched off in agency settings')
  }
  const now = deps.now()
  const consent = await deps.store.findValidConsent(app.id, checkType, now)
  if (!consent) {
    throw screeningError(409, 'CONSENT_REQUIRED', 'The applicant has not given current consent for this check')
  }

  if (body.confirmDuplicate !== true) {
    const recent = await deps.store.findRecentCheck(app.id, checkType, new Date(now.getTime() - DUPLICATE_WINDOW_DAYS * DAY_MS))
    if (recent) {
      await deps.store.insertAudit({
        clientId: app.clientId,
        checkId: recent.id,
        action: 'REUSED',
        actorUserId: userUuid,
        detail: { checkType },
      })
      return {
        ok: true as const,
        reused: true,
        warning: 'DUPLICATE_WITHIN_30_DAYS',
        message: `A ${checkType} check ran in the last ${DUPLICATE_WINDOW_DAYS} days. Showing that result; confirm to run and pay for a new one.`,
        check: summaryView(recent),
      }
    }
  }

  const providers = orderedProviders(deps.registry, settings, checkType)
  if (!providers.length) {
    throw screeningError(503, 'NO_PROVIDER_CONFIGURED', `No configured provider for ${checkType}`)
  }
  const idNumber = await subjectIdNumber(deps, consent, app)
  const subject = { name: consent.subjectName, idNumber }

  let previous: CheckRow | null = null
  let attempt = 0
  for (const provider of providers) {
    attempt += 1
    const check: CheckRow = await deps.store.tx(async () => {
      const inserted = await deps.store.insertCheck({
        clientId: app.clientId,
        applicationId: app.id,
        consentId: consent.id,
        checkType,
        provider: provider.id,
        providerRef: null,
        status: 'REQUESTED',
        resultSummary: {},
        resultEncrypted: null,
        resultKeyId: null,
        retainUntil: null,
        purgedAt: null,
        attempt,
        previousCheckId: previous?.id ?? null,
        requestedBy: userUuid,
        requestedAt: now,
        completedAt: null,
      })
      await deps.store.insertAudit({
        clientId: app.clientId,
        checkId: inserted.id,
        consentId: consent.id,
        action: 'REQUESTED',
        actorUserId: userUuid,
        detail: { checkType, provider: provider.id, attempt },
      })
      return inserted
    })

    let res: ProviderResult
    try {
      res = await provider.request({ checkType, reference: check.id, subject })
    } catch (err) {
      const code = err && typeof err === 'object' && 'code' in err ? String((err as { code: unknown }).code) : 'PROVIDER_ERROR'
      res = { status: 'ERROR', providerRef: null, summary: { error: code } }
    }
    const done = await deps.store.tx(() => applyResult(deps, check, res, settings, userUuid, 'request'))
    previous = done ?? check
    if (res.status !== 'ERROR') {
      return { ok: true as const, reused: false, check: summaryView(previous) }
    }
  }
  return {
    ok: false as const,
    reused: false,
    error: 'ALL_PROVIDERS_FAILED',
    message: 'Every provider returned an error. Nothing was charged.',
    check: previous ? summaryView(previous) : null,
  }
}

export async function listChecks(deps: ScreeningDeps, actor: DemoActor, applicationRef: unknown) {
  const app = await requireApplication(deps, applicationRef)
  const { access } = await accessFor(deps, actor, app)
  if (!access) throw forbid('You cannot see screening checks for this application')
  const rows = await deps.store.listChecks(app.id)
  if (access === 'landlord') return { ok: true as const, view: 'landlord' as const, checks: rows.map(landlordView) }
  const settings = parseScreeningSettings(app.agencySettings)
  if (access === 'subject') {
    return {
      ok: true as const,
      view: 'subject' as const,
      checks: rows.map((r) => ({ ...summaryView(r), summary: { outcome: r.resultSummary?.outcome ?? null } })),
    }
  }
  const now = deps.now()
  const quotes: Partial<Record<ScreeningCheckType, { provider: string; providerName: string; priceCents: number; payer: ScreeningPayer } | null>> = {}
  const consentCovers: Partial<Record<ScreeningCheckType, boolean>> = {}
  for (const type of settings.enabledChecks) {
    const first = orderedProviders(deps.registry, settings, type)[0]
    if (first) {
      const price = await deps.store.getPrice(first.id, type)
      quotes[type] = {
        provider: first.id,
        providerName: providerDisplayName(first.id),
        priceCents: priceWithMarkup(price?.costCents ?? 0, price?.markupBps ?? 0),
        payer: settings.payer,
      }
    } else {
      quotes[type] = null
    }
    consentCovers[type] = (await deps.store.findValidConsent(app.id, type, now)) != null
  }
  return {
    ok: true as const,
    view: 'staff' as const,
    canRequest: access === 'admin' || access === 'assigned',
    canViewFull: access === 'admin' || access === 'assigned',
    enabledChecks: settings.enabledChecks,
    payer: settings.payer,
    quotes,
    consentCovers,
    checks: rows.map(summaryView),
  }
}

async function loadCheckForActor(deps: ScreeningDeps, actor: DemoActor, checkId: string) {
  const check = await deps.store.getCheck(checkId)
  if (!check || !check.applicationId) throw screeningError(404, 'CHECK_NOT_FOUND', 'Check not found')
  const app = await deps.store.loadApplication(check.applicationId)
  if (!app) throw screeningError(404, 'CHECK_NOT_FOUND', 'Check not found')
  const { access, userUuid } = await accessFor(deps, actor, app)
  // Another agency gets 404, not 403: do not confirm the check exists.
  if (!access) throw screeningError(404, 'CHECK_NOT_FOUND', 'Check not found')
  return { check, app, access, userUuid }
}

export async function getCheckSummary(deps: ScreeningDeps, actor: DemoActor, checkId: string) {
  const { check, access } = await loadCheckForActor(deps, actor, checkId)
  if (access === 'landlord') return { ok: true as const, check: landlordView(check) }
  if (access === 'subject') {
    return { ok: true as const, check: { ...summaryView(check), summary: { outcome: check.resultSummary?.outcome ?? null } } }
  }
  return { ok: true as const, check: summaryView(check) }
}

export async function getCheckFull(deps: ScreeningDeps, actor: DemoActor, checkId: string) {
  const { check, access, userUuid } = await loadCheckForActor(deps, actor, checkId)
  if (access !== 'admin' && access !== 'assigned') {
    throw forbid('Only an agency admin or the assigned agent can view full screening results')
  }
  if (check.purgedAt) throw screeningError(410, 'RESULT_PURGED', 'The full result was deleted after its retention period')
  if (!check.resultEncrypted || !check.resultKeyId) {
    throw screeningError(404, 'RESULT_NOT_AVAILABLE', 'No full result is stored for this check')
  }
  const result = openJson(check.resultEncrypted, check.resultKeyId, deps.env)
  await deps.store.insertAudit({
    clientId: check.clientId,
    checkId: check.id,
    action: 'VIEWED_FULL',
    actorUserId: userUuid,
    detail: { role: actor.role },
  })
  return { ok: true as const, check: summaryView(check), result }
}

// ---------------------------------------------------------------------------
// Webhook
// ---------------------------------------------------------------------------

export async function handleProviderWebhook(
  deps: ScreeningDeps,
  providerId: string,
  rawBody: string,
  headers: Record<string, string | undefined>,
): Promise<{ status: 200 | 202 | 400 | 401 | 404 | 501; body: Record<string, unknown> }> {
  const provider = deps.registry.get(providerId)
  if (!provider) return { status: 404, body: { ok: false, error: 'unknown_provider' } }
  if (!provider.verifyWebhook(rawBody, headers)) return { status: 401, body: { ok: false, error: 'invalid_signature' } }
  let parsed: ProviderResult
  try {
    parsed = provider.parseWebhook(JSON.parse(rawBody))
  } catch (err) {
    const status = err && typeof err === 'object' && (err as { status?: number }).status === 501 ? 501 : 400
    return { status, body: { ok: false, error: status === 501 ? 'provider_not_implemented' : 'invalid_payload' } }
  }
  if (!parsed.providerRef) return { status: 400, body: { ok: false, error: 'provider_ref_required' } }
  const check = await deps.store.findCheckByProviderRef(provider.id, parsed.providerRef)
  if (!check) return { status: 404, body: { ok: false, error: 'check_not_found' } }
  if (TERMINAL.has(check.status) || check.status === parsed.status) {
    return { status: 200, body: { ok: true, duplicate: true, status: check.status } }
  }
  const settings = parseScreeningSettings(await deps.store.agencySettings(check.clientId))
  const updated = await deps.store.tx(() => applyResult(deps, check, parsed, settings, null, 'webhook'))
  if (!updated) return { status: 200, body: { ok: true, duplicate: true } }
  return { status: 202, body: { ok: true, duplicate: false, status: updated.status } }
}

// ---------------------------------------------------------------------------
// Purge cron
// ---------------------------------------------------------------------------

export async function runScreeningPurge(deps: ScreeningDeps, limit = 500) {
  const now = deps.now()
  const rows = await deps.store.purgeCandidates(now, limit)
  let purged = 0
  let extended = 0
  for (const row of rows) {
    if (ID_CHECK_TYPES.has(row.checkType)) {
      const rel = await deps.store.relationshipEnd(row.applicationId, row.clientId)
      const settings = parseScreeningSettings(await deps.store.agencySettings(row.clientId))
      const floor = rel === 'ongoing' ? new Date(now) : rel
      if (floor) {
        const until = computeRetainUntil(row.checkType, row.completedAt ?? now, settings, floor)
        if (until > now) {
          await deps.store.updateCheck(row.id, { retainUntil: until })
          extended += 1
          continue
        }
      }
    }
    await deps.store.tx(async () => {
      const done = await deps.store.updateCheck(row.id, { resultEncrypted: null, resultKeyId: null, purgedAt: now })
      if (!done) return
      await deps.store.insertAudit({
        clientId: row.clientId,
        checkId: row.id,
        action: 'PURGED',
        detail: { retainUntil: iso(row.retainUntil) },
      })
      purged += 1
    })
  }
  return { ok: true as const, scanned: rows.length, purged, extended }
}

// ---------------------------------------------------------------------------
// Agency settings
// ---------------------------------------------------------------------------

async function settingsClient(deps: ScreeningDeps, actor: DemoActor, agencyRef: unknown, write: boolean): Promise<string> {
  if (actor.role === 'super_admin') {
    const ref = typeof agencyRef === 'string' ? agencyRef.trim() : ''
    const id = ref ? await deps.store.resolveClient(ref) : null
    if (!id) throw screeningError(400, 'AGENCY_REQUIRED', 'agencyId is required')
    return id
  }
  const allowed = write ? AGENCY_ADMIN_ROLES.has(actor.role) : AGENCY_ADMIN_ROLES.has(actor.role) || AGENT_ROLES.has(actor.role)
  if (!allowed) throw forbid(write ? 'Only an agency admin can change screening settings' : 'Agency staff only')
  const { clientUuid } = await deps.store.resolveActor(actor)
  if (!clientUuid) throw forbid('No agency on this account')
  if (typeof agencyRef === 'string' && agencyRef.trim()) {
    const asked = await deps.store.resolveClient(agencyRef.trim())
    if (asked !== clientUuid) throw forbid('Another agency’s screening settings')
  }
  return clientUuid
}

function providerChoices(registry: ProviderRegistry) {
  return [...registry.values()].map((p) => ({
    id: p.id,
    name: providerDisplayName(p.id),
    supports: p.supports,
    configured: p.configured,
  }))
}

export async function getScreeningSettings(deps: ScreeningDeps, actor: DemoActor, agencyRef: unknown) {
  const clientId = await settingsClient(deps, actor, agencyRef, false)
  const settings = parseScreeningSettings(await deps.store.agencySettings(clientId))
  return { ok: true as const, settings, providers: providerChoices(deps.registry), defaultOrder: DEFAULT_PROVIDER_ORDER }
}

export async function saveScreeningSettings(deps: ScreeningDeps, actor: DemoActor, body: Record<string, unknown>) {
  const clientId = await settingsClient(deps, actor, body.agencyId, true)
  const input = body.settings && typeof body.settings === 'object' ? body.settings : body
  const next = parseScreeningSettings({ screening: input })
  for (const [type, ids] of Object.entries(next.providers) as Array<[ScreeningCheckType, string[]]>) {
    const bad = ids.filter((id) => !deps.registry.get(id)?.supports.includes(type))
    if (bad.length) throw screeningError(400, 'PROVIDER_INVALID', `${bad.join(', ')} cannot run ${type}`)
  }
  await deps.store.saveAgencyScreeningSettings(clientId, next)
  return { ok: true as const, settings: next }
}

// ---------------------------------------------------------------------------
// Usage, pricing and billing (platform)
// ---------------------------------------------------------------------------

export function parseMonth(v: unknown, now: Date): string {
  if (v == null || v === '') return `${now.toISOString().slice(0, 7)}-01`
  if (typeof v !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(v)) {
    throw screeningError(400, 'MONTH_INVALID', 'month must be YYYY-MM')
  }
  return `${v}-01`
}

export async function screeningUsage(deps: ScreeningDeps, actor: DemoActor, query: { month?: unknown; agencyId?: unknown }) {
  const month = parseMonth(query.month, deps.now())
  let clientId: string | null = null
  if (actor.role === 'super_admin') {
    if (typeof query.agencyId === 'string' && query.agencyId.trim()) {
      clientId = await deps.store.resolveClient(query.agencyId.trim())
      if (!clientId) throw screeningError(404, 'AGENCY_NOT_FOUND', 'Agency not found')
    }
  } else if (AGENCY_ADMIN_ROLES.has(actor.role)) {
    clientId = (await deps.store.resolveActor(actor)).clientUuid
    if (!clientId) throw forbid('No agency on this account')
  } else {
    throw forbid('Only platform or agency admins can see screening usage')
  }
  const rows = await deps.store.usage(month, clientId)
  const totals = rows.reduce(
    (acc, r) => ({
      count: acc.count + r.count,
      costCents: acc.costCents + r.costCents,
      priceCents: acc.priceCents + r.priceCents,
      uninvoicedPriceCents: acc.uninvoicedPriceCents + r.uninvoicedPriceCents,
    }),
    { count: 0, costCents: 0, priceCents: 0, uninvoicedPriceCents: 0 },
  )
  // Agencies see their price, not Lekaya's cost.
  const visible = actor.role === 'super_admin' ? rows : rows.map((r) => ({ ...r, costCents: undefined }))
  return {
    ok: true as const,
    month: month.slice(0, 7),
    rows: visible,
    totals: actor.role === 'super_admin' ? totals : { ...totals, costCents: undefined },
  }
}

export async function listPricing(deps: ScreeningDeps, actor: DemoActor) {
  const rows = await deps.store.listPrices()
  const providers = providerChoices(deps.registry)
  const prices = rows.map((r) => ({
    ...r,
    priceCents: priceWithMarkup(r.costCents, r.markupBps),
    ...(actor.role === 'super_admin' ? {} : { costCents: undefined, markupBps: undefined }),
  }))
  return { ok: true as const, providers, prices }
}

export async function setPricing(deps: ScreeningDeps, actor: DemoActor, body: Record<string, unknown>) {
  if (actor.role !== 'super_admin') throw forbid('Only a platform super admin can set screening prices')
  const provider = typeof body.provider === 'string' ? body.provider : ''
  if (!deps.registry.has(provider)) throw screeningError(400, 'PROVIDER_INVALID', 'Unknown provider')
  if (!isScreeningCheckType(body.checkType)) throw screeningError(400, 'CHECK_TYPE_INVALID', 'Unknown check type')
  const costCents = Number(body.costCents)
  const markupBps = Number(body.markupBps)
  if (!Number.isInteger(costCents) || costCents < 0 || !Number.isInteger(markupBps) || markupBps < 0 || markupBps > 100_000) {
    throw screeningError(400, 'PRICE_INVALID', 'costCents and markupBps must be whole numbers ≥ 0')
  }
  const { userUuid } = await deps.store.resolveActor(actor)
  const row = await deps.store.upsertPrice({ provider, checkType: body.checkType, costCents, markupBps }, userUuid)
  return { ok: true as const, price: { ...row, priceCents: priceWithMarkup(row.costCents, row.markupBps) } }
}

export async function billScreeningCharges(deps: ScreeningDeps, actor: DemoActor, body: Record<string, unknown>) {
  if (actor.role !== 'super_admin') throw forbid('Only a platform super admin can bill screening charges')
  const month = parseMonth(body.month, deps.now())
  const agencyRef = typeof body.agencyId === 'string' ? body.agencyId.trim() : ''
  const invoiceRef = typeof body.invoiceId === 'string' ? body.invoiceId.trim() : ''
  if (!agencyRef || !invoiceRef) throw screeningError(400, 'BILL_INPUT_REQUIRED', 'agencyId and invoiceId are required')
  const clientId = await deps.store.resolveClient(agencyRef)
  if (!clientId) throw screeningError(404, 'AGENCY_NOT_FOUND', 'Agency not found')
  const r = await deps.store.tx(() => deps.store.billCharges(clientId, month, invoiceRef))
  return { ok: true as const, month: month.slice(0, 7), ...r }
}

/** Invoice line item for uninvoiced screening charges (client billing cycle + server bill). */
export function screeningLineItem(count: number, priceCents: number, month: string) {
  return {
    label: `Screening checks ${month.slice(0, 7)} (${count})`,
    amount: Math.round(priceCents) / 100,
    kind: 'screening' as const,
  }
}
