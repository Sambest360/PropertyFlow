import { Hono, type Context } from 'hono'
import { cors } from 'hono/cors'
import {
  databaseConfigError,
  databaseConfigWarning,
  databaseConfigured,
  pingDatabase,
  pool,
  query,
  withTransaction,
} from './db.js'
import { handleLeaseRemindersCron } from './leaseReminders.js'
import {
  actorRequiredError,
  parseDemoActor,
  ACTOR_AGENCY_HEADER,
  ACTOR_ROLE_HEADER,
  ACTOR_USER_HEADER,
} from './actor.js'
import { isStaffRole, resolveRequestActor } from './requestActor.js'
import { filterBootstrapForGuest } from './guestMarketplace.js'
import {
  changeUserPassword,
  clearSession,
  issueSession,
  loginUser,
  readBearerOrCookie,
  registerUser,
  resolveSessionUser,
  sessionToPublic,
  updateUserVerification,
} from './auth.js'
import {
  agencyFeForClient,
  assertPersistAllowed,
  assertTenancyReadable,
  enrichActor,
  normalizedActorAgency,
} from './scopeGate.js'
import type { PersistBody } from './writes.js'
import { payfastCreate, payfastItn, type LoadedPayment } from './payfastRoutes.js'
import { registerScreeningRoutes, screeningProviderInfo, screeningWebhook } from './screeningRoutes.js'
import { createProviderRegistry } from './screeningChecks.js'
import { pgScreeningStore } from './screeningStore.js'
import {
  esignCreateEnvelope,
  esignProviderInfo,
  esignStatus,
  esignWebhook,
} from './esignRoutes.js'
import {
  authIpKey,
  authIpRateLimit,
  authEmailRateLimit,
  notifyEmailRateLimit,
  authFailureBlocked,
  recordAuthFailure,
  clearAuthFailures,
  tooManyRequests,
  passwordResetRateLimit,
} from './rateLimit.js'
import { resetUserPassword } from './passwordReset.js'
import {
  sendListingEnquiryConfirmation,
  sendListingLeadAlert,
  sendApplicationApproved,
  sendApplicationDeclined,
  sendApplicationReceived,
  sendDunningNoticeEmail,
  sendLeaseEndReminder,
  isEmailLeaseReminderEnabled,
  sendVerificationDecision,
} from './mailtrap.js'
import { registerEmailRoutes } from './emailRoutes.js'
import { registerBillingRoutes } from './billingRoutes.js'
import { ensureUuid, resolveFrontendId, resolveUuid } from './entityMap.js'
import { isAgencyWideRole } from '../src/lib/scope.js'
import type { Role } from '../src/types/domain.js'
import { docIdFromEnvelopeId } from './signiflow.js'
import { runningCommitSha } from './appConfig.js'
import { dbHostFingerprint, serverAuthMode } from './authMode.js'
import { errStatus } from './errStatus.js'
import { reviewError } from './reviewError.js'
import { registerViewingApplyRoutes } from './viewingApplyRoutes.js'
import { captureServerError, initServerSentry } from './sentry.js'
import { registerInspectionRoutes } from './inspectionRoutes.js'

// Self-hosted (PM2 runs this file directly, not api/index.ts): error reporting
// starts here. No-op without SENTRY_DSN; idempotent when api/index.ts ran it.
initServerSentry()

// Log resolved auth mode once at boot (mode only — never env values).
serverAuthMode()

function productionAuthSecretMissing(): boolean {
  return process.env.NODE_ENV === 'production' && !process.env.AUTH_SECRET?.trim()
}

async function loadBootstrapModule() {
  return import('./bootstrap.js')
}

async function loadScopeGateModule() {
  return import('./scopeGate.js')
}

async function loadWritesModule() {
  return import('./writes.js')
}

async function loadUnitsFeedModule() {
  return import('./unitsFeed.js')
}

const app = new Hono()
const PORT = Number(process.env.API_PORT || 8787)

const LOCAL_ORIGINS = [
  'http://127.0.0.1:5173',
  'http://localhost:5173',
  'http://127.0.0.1:5174',
  'http://localhost:5174',
  'http://127.0.0.1:4000',
  'http://localhost:4000',
]

function corsOrigin(origin: string): string | undefined {
  if (!origin) return undefined
  if (LOCAL_ORIGINS.includes(origin)) return origin
  const allowed = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  if (allowed.includes(origin) || allowed.includes('*')) return origin
  return undefined
}

app.use(
  '*',
  cors({
    origin: corsOrigin,
    credentials: true,
    allowHeaders: [
      'Content-Type',
      'Authorization',
      ACTOR_USER_HEADER,
      ACTOR_ROLE_HEADER,
      ACTOR_AGENCY_HEADER,
      'X-User-Id',
      'X-Role',
      'X-Agency-Id',
    ],
    exposeHeaders: ['Content-Type'],
  }),
)


/**
 * D3: while a session user has mustChangePassword (after a staff reset), only
 * /api/auth/me, change-password and logout work (login stays open so a
 * different account can sign in). Everything else: 403 PASSWORD_CHANGE_REQUIRED.
 */
const PASSWORD_CHANGE_ALLOWED_PATHS = new Set([
  '/api/auth/me',
  '/api/auth/confirm-email-change',
  '/api/auth/change-password',
  '/api/auth/logout',
  '/api/auth/login',
])
app.use('/api/*', async (c, next) => {
  if (c.req.method === 'OPTIONS' || PASSWORD_CHANGE_ALLOWED_PATHS.has(c.req.path)) return next()
  if (!readBearerOrCookie(c)) return next()
  let mustChange = false
  try {
    const user = await resolveSessionUser(c)
    mustChange = user?.mustChangePassword === true
  } catch {
    mustChange = false
  }
  if (mustChange) {
    return c.json(
      {
        error: 'PASSWORD_CHANGE_REQUIRED',
        code: 'PASSWORD_CHANGE_REQUIRED',
        message: 'Change your password to continue.',
      },
      403,
    )
  }
  return next()
})

/** Machine-readable policy code on a refused write (e.g. APPLICATION_TRANSITION_FORBIDDEN). */
function errCode(err: unknown): { code?: string } {
  if (err && typeof err === 'object' && 'code' in err && typeof (err as { code: unknown }).code === 'string') {
    const code = (err as { code: string }).code
    if (/^[A-Z][A-Z0-9_]+$/.test(code)) return { code }
  }
  return {}
}

app.onError((err, c) => {
  captureServerError(err, { route: c.req.routePath, method: c.req.method, status: 500 })
  return c.json({ error: 'internal_error', message: 'Internal Server Error' }, 500)
})

app.get('/api/debug-sentry', (c) => {
  if (process.env.SENTRY_DEBUG_ROUTE !== '1') {
    return c.json({ error: 'not_found' }, 404)
  }
  throw new Error('Sentry debug probe')
})

/** Verified actor (session first, see requestActor.ts) or a 401 error. */
async function requireActor(
  c: Parameters<typeof parseDemoActor>[0],
  body?: Record<string, unknown> | null,
) {
  const raw = await resolveRequestActor(c, body ?? null)
  if (!raw) throw actorRequiredError()
  return enrichActor(raw)
}

async function requireActorAndGate(c: Parameters<typeof parseDemoActor>[0], body: PersistBody) {
  const raw = await resolveRequestActor(c, body as unknown as Record<string, unknown>)
  if (!raw) throw actorRequiredError()
  // CR10 B1: refuse unknown actions before the gate (single and batch).
  if (body.action !== 'upsert' && body.action !== 'delete') {
    throw Object.assign(new Error(`Unsupported persist action: ${String(body.action)}`), { status: 400, code: 'PERSIST_ACTION_INVALID' })
  }
  // CR10: request facts for the sign stamp are always set here, never taken
  // from the client body.
  body.requestMeta = {
    ip: (c.req.header('x-forwarded-for') ?? '').split(',')[0]?.trim() || c.req.header('x-real-ip') || null,
    userAgent: c.req.header('user-agent') ?? null,
  }
  const actor = await enrichActor(raw)
  const outcome = await assertPersistAllowed(actor, body)
  return { actor, handled: outcome?.handled ?? null }
}

/** Gate, then the generic upsert unless the gate already did a narrow rewrite. */
async function gatedPersist(c: Parameters<typeof parseDemoActor>[0], body: PersistBody) {
  // CR10 N3 (option a): a tenancy upsert can carry a sign stamp. The gate
  // (stamp + lease_signed row) and the main upsert run in ONE transaction:
  // if the upsert fails nothing commits; the completion email (afterCommit)
  // goes only after this outer COMMIT, i.e. after handlePersist succeeded.
  if (body.resource === 'tenancy' && body.action === 'upsert') {
    const { withTransaction } = await import('./db.js')
    return withTransaction(() => gatedPersistInner(c, body))
  }
  return gatedPersistInner(c, body)
}

async function gatedPersistInner(c: Parameters<typeof parseDemoActor>[0], body: PersistBody) {
  const { actor, handled } = await requireActorAndGate(c, body)
  if (handled) return handled
  const { handlePersist } = await loadWritesModule()
  // A tenant's new fault goes to the property's responsible person: the
  // server writes those notifications (a tenant may only notify themselves).
  const newTenantFault =
    body.resource === 'ticket' && body.action === 'upsert' && actor.role === 'tenant' && !(await resolveUuid('ticket', body.id))
  const result = await handlePersist(body, actor.userId, actor.role)
  if (newTenantFault) {
    try {
      const { notifyFaultReported } = await import('./faultDesk.js')
      await notifyFaultReported(actor, result.uuid, body.id)
    } catch (err) {
      console.error('[fault notify]', err instanceof Error ? err.message : String(err))
    }
  }
  return result
}

/**
 * Daily lease end-date reminders (server crontab, 07:00 SAST).
 * Authorization: Bearer CRON_SECRET only (the crontab sends it). No session/demo actor.
 * CRON_SECRET unset -> 503 and does nothing.
 */
app.get('/api/cron/lease-reminders', async (c) => {
  const deps = {
    query,
    withTransaction,
    resolveFrontendId: (type: 'user' | 'tenancy', id: string) => resolveFrontendId(type, id),
    resolveUuid: (type: 'user', fe: string) => resolveUuid(type, fe),
    sendEmail: sendLeaseEndReminder,
    emailEnabled: isEmailLeaseReminderEnabled,
  }
  const r = await handleLeaseRemindersCron(c.req.header('authorization'), process.env.CRON_SECRET, deps)
  return c.json(r.body, r.status)
})

/** Strip the DB hostname from error text so /api/health never echoes it. */
function redactDbHost(message: string): string {
  try {
    const host = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL).hostname : ''
    return host ? message.split(host).join('[db-host]') : message
  } catch {
    return message
  }
}

app.get('/api/health', async (c) => {
  if (!databaseConfigured) {
    return c.json(
      {
        ok: false,
        database: 'unconfigured',
        error: databaseConfigError || 'DATABASE_URL is not set',
        authMode: serverAuthMode(),
      dbHost: dbHostFingerprint(process.env.DATABASE_URL),
      commit: runningCommitSha(),
        at: new Date().toISOString(),
      },
      503,
    )
  }
  const skipDb = c.req.query('db') === '0'
  if (skipDb) {
    return c.json({
      ok: true,
      database: 'configured',
      warning: databaseConfigWarning,
      pool: Boolean(pool),
      authMode: serverAuthMode(),
      dbHost: dbHostFingerprint(process.env.DATABASE_URL),
      commit: runningCommitSha(),
      at: new Date().toISOString(),
    })
  }
  try {
    await pingDatabase(4_000)
    return c.json({
      ok: true,
      database: 'up',
      warning: databaseConfigWarning,
      pool: Boolean(pool),
      authMode: serverAuthMode(),
      dbHost: dbHostFingerprint(process.env.DATABASE_URL),
      commit: runningCommitSha(),
      at: new Date().toISOString(),
    })
  } catch (err) {
    const message = redactDbHost(err instanceof Error ? err.message : String(err))
    return c.json(
      {
        ok: false,
        database: 'down',
        error: message,
        warning: databaseConfigWarning,
        hint: 'Check DATABASE_URL in the server .env and that Postgres is running, then restart the API.',
        authMode: serverAuthMode(),
      dbHost: dbHostFingerprint(process.env.DATABASE_URL),
      commit: runningCommitSha(),
        at: new Date().toISOString(),
      },
      503,
    )
  }
})

app.get('/api/auth/bootstrap-needed', async (c) => {
  if (!databaseConfigured) {
    return c.json({ needed: false, database: 'unconfigured' })
  }
  try {
    const rows = await query<{ n: string }>('SELECT COUNT(*)::text AS n FROM users')
    return c.json({ needed: Number(rows[0]?.n ?? 0) === 0 })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return c.json({ error: 'bootstrap_check_failed', message }, 500)
  }
})

app.post('/api/auth/register', async (c) => {
  if (!databaseConfigured) {
    return c.json(
      {
        error: 'database_unconfigured',
        message: databaseConfigError || 'DATABASE_URL is not set',
      },
      503,
    )
  }
  if (productionAuthSecretMissing()) {
    return c.json(
      {
        error: 'auth_secret_missing',
        message: 'Set AUTH_SECRET in the server .env, then restart the API (pm2 restart propertyflow-api).',
      },
      503,
    )
  }
  const ip = authIpKey(c.req.raw.headers)
  const ipGate = authIpRateLimit(ip)
  if (!ipGate.ok) {
    const rl = tooManyRequests(ipGate.retryAfterSec)
    return c.json(rl.body, rl.status, rl.headers)
  }
  try {
    const body = (await c.req.json()) as {
      email?: string
      password?: string
      name?: string
      firstName?: string
      lastName?: string
      phone?: string
      role?: string
      profile?: Record<string, unknown>
      documents?: Array<{
        key: string
        label: string
        name: string
        mimeType: string
        dataUrl: string
        uploadedAt: string
      }>
    }
    const emailGate = authEmailRateLimit(String(body.email ?? ''))
    if (!emailGate.ok) {
      const rl = tooManyRequests(emailGate.retryAfterSec)
      return c.json(rl.body, rl.status, rl.headers)
    }
    const result = await registerUser({
      email: String(body.email ?? ''),
      password: String(body.password ?? ''),
      name: body.name,
      firstName: body.firstName,
      lastName: body.lastName,
      phone: body.phone,
      role: body.role,
      profile: body.profile,
      documents: body.documents,
    })
    const token = issueSession(c, result.user)
    // Welcome email + confirm-your-email link; registration never waits on email.
    void import('./accountEmails.js')
      .then(({ sendSignupEmails }) => sendSignupEmails(result.user.id))
      .catch((err) => console.warn('[signup emails] failed:', err instanceof Error ? err.message : err))
    return c.json(
      {
        ok: true,
        token,
        bootstrap: result.bootstrap,
        user: sessionToPublic(result.user),
      },
      201,
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return c.json({ error: 'register_failed', message }, errStatus(err))
  }
})

app.patch('/api/admin/users/:userId/verification', async (c) => {
  try {
    let reviewerFeId: string | null = null
    let reviewerRole: string | null = null
    let reviewerAgencyId: string | null = null
    const session = await resolveSessionUser(c)
    const staffRoles = new Set(['super_admin', 'client_admin', 'agent_admin'])
    if (session && staffRoles.has(session.role)) {
      reviewerFeId = session.frontendId
      reviewerRole = session.role
      reviewerAgencyId = session.agencyId
    } else {
      return c.json({ error: 'unauthorized', message: 'Sign in required' }, 401)
    }

    // Landlord / contractor documents are approved by the platform team only.
    if (reviewerRole !== 'super_admin') {
      return c.json({ error: 'forbidden', message: 'Only the platform team approves landlord and contractor documents' }, 403)
    }
    const userId = c.req.param('userId')
    const body = (await c.req.json()) as { status?: string; rejectNote?: string }
    const status = body.status === 'rejected' ? 'rejected' : body.status === 'approved' ? 'approved' : null
    if (!status) {
      return c.json({ error: 'invalid_status', message: 'status must be approved or rejected' }, 400)
    }
    const user = await updateUserVerification({
      frontendUserId: userId,
      status,
      rejectNote: body.rejectNote,
      reviewerFrontendId: reviewerFeId,
      reviewerRole,
      reviewerAgencyId,
    })
    // Decision email + in-app notification — additive, never blocks the response.
    void (async () => {
      try {
        await sendVerificationDecision({
          email: user.email,
          firstName: user.name.split(/\s+/)[0],
          role: user.role,
          approved: status === 'approved',
          rejectNote: status === 'rejected' ? body.rejectNote : undefined,
        })
      } catch (emailErr) {
        console.error('[verification] decision email failed:', emailErr instanceof Error ? emailErr.message : emailErr)
      }
      try {
        const notifFe = `NTF-verif-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
        const clientUuid = user.agencyId
          ? await resolveUuid('agency', user.agencyId).catch(() => null)
          : null
        await query(
          `INSERT INTO notifications (
             id, client_id, user_id, title, body, link_path, resource_type, action_type, read_at
           ) VALUES (
             $1::uuid, $2::uuid, $3::uuid, $4, $5, $6, 'document', 'updated', NULL
           )`,
          [
            await ensureUuid('notification', notifFe),
            clientUuid,
            user.id,
            status === 'approved' ? 'Account approved' : 'Verification declined',
            status === 'approved'
              ? 'Your account has been approved — sign in to get started.'
              : `Your verification was declined.${body.rejectNote?.trim() ? ` Note: ${body.rejectNote.trim()}` : ''}`,
            user.role === 'contractor' ? '/workspace/maintenance' : '/workspace/properties',
          ],
        )
      } catch (notifErr) {
        console.error('[verification] notification insert failed:', notifErr instanceof Error ? notifErr.message : notifErr)
      }
    })()
    return c.json({ ok: true, user: sessionToPublic(user) })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return c.json({ error: 'verification_update_failed', message }, errStatus(err))
  }
})

app.post('/api/auth/login', async (c) => {
  if (!databaseConfigured) {
    return c.json(
      {
        error: 'database_unconfigured',
        message: databaseConfigError || 'DATABASE_URL is not set',
      },
      503,
    )
  }
  if (productionAuthSecretMissing()) {
    return c.json(
      {
        error: 'auth_secret_missing',
        message: 'Set AUTH_SECRET in the server .env, then restart the API (pm2 restart propertyflow-api).',
      },
      503,
    )
  }
  const ip = authIpKey(c.req.raw.headers)
  const ipGate = authIpRateLimit(ip)
  if (!ipGate.ok) {
    const rl = tooManyRequests(ipGate.retryAfterSec)
    return c.json(rl.body, rl.status, rl.headers)
  }
  let email = ''
  try {
    const body = (await c.req.json()) as { email?: string; password?: string }
    email = String(body.email ?? '')
    // Per-(IP + email) lockout on repeated failures — blunts password grinding
    // even when the attacker rotates IPs.
    const accountGate = authFailureBlocked(ip, email)
    if (!accountGate.ok) {
      const rl = tooManyRequests(accountGate.retryAfterSec)
      return c.json(rl.body, rl.status, rl.headers)
    }
    const user = await loginUser(email, String(body.password ?? ''))
    clearAuthFailures(ip, email)
    const token = issueSession(c, user)
    return c.json({ ok: true, token, user: sessionToPublic(user) })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const status = errStatus(err)
    // Count credential failures (not DB outages) toward the account lockout.
    if (email && (status === 401 || status === 400)) {
      const failGate = recordAuthFailure(ip, email)
      if (!failGate.ok) {
        const rl = tooManyRequests(failGate.retryAfterSec)
        return c.json(rl.body, rl.status, rl.headers)
      }
    }
    return c.json({ error: 'login_failed', message }, status)
  }
})

app.post('/api/auth/logout', async (c) => {
  clearSession(c)
  return c.json({ ok: true })
})

app.get('/api/auth/me', async (c) => {
  try {
    const user = await resolveSessionUser(c)
    if (!user) return c.json({ error: 'unauthorized', message: 'Not signed in' }, 401)
    return c.json({ ok: true, user: sessionToPublic(user) })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return c.json({ error: 'me_failed', message }, errStatus(err))
  }
})

/**
 * Self-service password change: the signed-in user (session cookie / bearer)
 * must send their current password. Clears mustChangePassword. The generic
 * persist route strips passwordHash / password / tempPassword from every
 * non-super user write, so this is the password-change path.
 */
app.post('/api/auth/change-password', async (c) => {
  if (!databaseConfigured) {
    return c.json(
      { error: 'database_unconfigured', message: databaseConfigError || 'DATABASE_URL is not set' },
      503,
    )
  }
  const ip = authIpKey(c.req.raw.headers)
  const ipGate = authIpRateLimit(ip)
  if (!ipGate.ok) {
    const rl = tooManyRequests(ipGate.retryAfterSec)
    return c.json(rl.body, rl.status, rl.headers)
  }
  let email = ''
  try {
    const user = await resolveSessionUser(c)
    if (!user) return c.json({ error: 'unauthorized', message: 'Not signed in' }, 401)
    email = user.email ?? ''
    const accountGate = authFailureBlocked(ip, email)
    if (!accountGate.ok) {
      const rl = tooManyRequests(accountGate.retryAfterSec)
      return c.json(rl.body, rl.status, rl.headers)
    }
    const body = (await c.req.json().catch(() => ({}))) as {
      currentPassword?: string
      newPassword?: string
    }
    const updated = await changeUserPassword({
      userUuid: user.id,
      currentPassword: String(body.currentPassword ?? ''),
      newPassword: String(body.newPassword ?? ''),
    })
    clearAuthFailures(ip, email)
    void import('./accountEmails.js').then(({ sendPasswordChangedEmail }) => sendPasswordChangedEmail(updated.id)).catch(() => {})
    // passwordChangedAt now revokes every older token, this one included:
    // reissue the caller's own session.
    const token = issueSession(c, updated)
    return c.json({ ok: true, token, user: sessionToPublic(updated) })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const status = errStatus(err)
    if (email && status === 401) recordAuthFailure(ip, email)
    return c.json({ error: 'change_password_failed', message }, status)
  }
})

/**
 * D3 staff password reset. Who may reset whom: server/passwordReset.ts.
 * The temp password is in this response only (Cache-Control: no-store) and is
 * never logged.
 */
app.post('/api/auth/reset-password', async (c) => {
  c.header('Cache-Control', 'no-store')
  c.header('Pragma', 'no-cache')
  if (!databaseConfigured) {
    return c.json(
      { error: 'database_unconfigured', message: databaseConfigError || 'DATABASE_URL is not set' },
      503,
    )
  }
  try {
    const actor = await resolveSessionUser(c)
    if (!actor) return c.json({ error: 'unauthorized', message: 'Not signed in' }, 401)
    const body = (await c.req.json().catch(() => ({}))) as { userId?: unknown; password?: unknown }
    const userId = typeof body.userId === 'string' ? body.userId.trim() : ''
    if (!userId) return c.json({ error: 'bad_request', message: 'userId is required' }, 400)
    // Optional: the admin's own choice of temporary password (else generated).
    const newPassword = typeof body.password === 'string' && body.password !== '' ? body.password : null
    const gate = passwordResetRateLimit(actor.id, userId)
    if (!gate.ok) {
      const rl = tooManyRequests(gate.retryAfterSec)
      return c.json(rl.body, rl.status, { ...rl.headers, 'Cache-Control': 'no-store' })
    }
    // A super admin impersonating someone still acts as themselves; the
    // audit row records the real actor plus impersonating: true.
    let impersonatedUserId: string | null = null
    if (actor.role === 'super_admin') {
      const imp = parseDemoActor(c, null)
      if (imp && imp.userId !== actor.frontendId) impersonatedUserId = imp.userId
    }
    const result = await resetUserPassword(actor, userId, { impersonatedUserId, newPassword })
    // Email the person the temporary password; they must change it at sign-in.
    void import('./accountEmails.js')
      .then(({ sendStaffResetEmail }) => sendStaffResetEmail(result.target.uuid, actor.name, result.tempPassword))
      .catch(() => {})
    return c.json({ ok: true, userId: result.target.id, tempPassword: result.tempPassword })
  } catch (err) {
    const status = errStatus(err)
    // Message only, never the request body (it can hold the chosen password).
    const message = status >= 500 ? 'Password reset failed' : err instanceof Error ? err.message : String(err)
    if (status >= 500) console.error('[reset-password] failed:', err instanceof Error ? err.message : 'unknown')
    return c.json({ error: 'reset_password_failed', message }, status)
  }
})

/**
 * Staff change a user's sign-in email (server/emailChange.ts). Nothing changes
 * until the person confirms from the new address.
 */
app.post('/api/admin/users/email', async (c) => {
  c.header('Cache-Control', 'no-store')
  try {
    const actor = await resolveSessionUser(c)
    if (!actor) return c.json({ error: 'unauthorized', message: 'Not signed in' }, 401)
    const body = (await c.req.json().catch(() => ({}))) as { userId?: unknown; email?: unknown }
    const userId = typeof body.userId === 'string' ? body.userId.trim() : ''
    if (!userId) return c.json({ error: 'bad_request', message: 'userId is required' }, 400)
    const gate = passwordResetRateLimit(actor.id, userId)
    if (!gate.ok) {
      const rl = tooManyRequests(gate.retryAfterSec)
      return c.json(rl.body, rl.status, { ...rl.headers, 'Cache-Control': 'no-store' })
    }
    const { requestEmailChange } = await import('./emailChange.js')
    return c.json({ ok: true, ...(await requestEmailChange(actor, userId, body.email)) })
  } catch (err) {
    const status = errStatus(err)
    const message = status >= 500 ? 'The email could not be changed' : err instanceof Error ? err.message : String(err)
    if (status >= 500) console.error('[email-change] failed:', err instanceof Error ? err.message : 'unknown')
    return c.json({ error: 'email_change_failed', message, ...errCode(err) }, status)
  }
})

/** The link from the email-change message: switch the account to the new address. */
app.post('/api/auth/confirm-email-change', async (c) => {
  c.header('Cache-Control', 'no-store')
  try {
    const body = (await c.req.json().catch(() => ({}))) as { token?: unknown }
    const { confirmEmailChange } = await import('./emailChange.js')
    return c.json({ ok: true, ...(await confirmEmailChange(body.token)) })
  } catch (err) {
    const status = errStatus(err)
    const message = status >= 500 ? 'The email could not be confirmed' : err instanceof Error ? err.message : String(err)
    return c.json({ error: 'email_change_confirm_failed', message, ...errCode(err) }, status)
  }
})

/** Super admin deletes (or, when records point at the user, anonymises) a user: server/userDelete.ts. */
app.post('/api/admin/users/delete', async (c) => {
  try {
    const actor = await resolveSessionUser(c)
    if (!actor) return c.json({ error: 'unauthorized', message: 'Not signed in' }, 401)
    const body = (await c.req.json().catch(() => ({}))) as { userId?: unknown }
    const userId = typeof body.userId === 'string' ? body.userId.trim() : ''
    if (!userId) return c.json({ error: 'bad_request', message: 'userId is required' }, 400)
    const { deleteUser } = await import('./userDelete.js')
    return c.json({ ok: true, ...(await deleteUser(actor, userId)) })
  } catch (err) {
    const status = errStatus(err)
    const message = status >= 500 ? 'The user could not be deleted' : err instanceof Error ? err.message : String(err)
    if (status >= 500) console.error('[user-delete] failed:', err instanceof Error ? err.message : 'unknown')
    return c.json({ error: 'user_delete_failed', message, ...errCode(err) }, status)
  }
})

registerEmailRoutes(app)
registerBillingRoutes(app)

app.get('/api/bootstrap', async (c) => {
  if (!databaseConfigured) {
    return c.json(
      {
        error: 'database_unconfigured',
        message: databaseConfigError || 'DATABASE_URL is not set',
      },
      503,
    )
  }
  try {
    // Identity first: no verified actor → 401 before any table is read.
    const rawActor = await resolveRequestActor(c, null)
    if (!rawActor) {
      return c.json(
        { error: 'unauthorized', message: 'Sign in required (use /api/public/marketplace for listings)' },
        401,
      )
    }
    const lite = c.req.query('lite') === '1' || c.req.query('lite') === 'true'
    const rowLimit = lite
      ? 60
      : Math.min(Math.max(Number(c.req.query('limit') || 250), 1), 500)
    const actor = await enrichActor(rawActor)
    const { agencyFeId, buildActorPropertyScope, filterBootstrapForActor, actorIdAliases, resolveActorUsersManage } =
      await loadScopeGateModule()
    const { buildBootstrap } = await loadBootstrapModule()
    const bootstrapStarted = Date.now()
    const aliases = await actorIdAliases(actor)
    const data = await buildBootstrap({
      lite,
      notificationsFor:
        actor.role === 'super_admin'
          ? undefined
          : {
              userUuids: [...aliases],
              clientUuid:
                isAgencyWideRole(actor.role as Role) && actor.agencyId
                  ? await resolveUuid('agency', actor.agencyId)
                  : null,
            },
      refundAgencyFe:
        actor.role === 'super_admin' ? undefined : actor.agencyId ? await agencyFeId(actor.agencyId) : null,
      limits: {
        units: rowLimit,
        messages: rowLimit,
        notifications: rowLimit,
        leads: rowLimit,
        applications: rowLimit,
        tickets: rowLimit,
        payments: rowLimit,
        documents: rowLimit,
      },
    })
    // actor already enriched above (D2 refundAgencyFe); main's CR7 adds resolveActorUsersManage.
    const scope = await buildActorPropertyScope(actor)
    // CR7: agency desk tickets only when users.manage is effective (agency pack applied).
    const usersManage =
      actor.role === 'client_admin' || actor.role === 'agent_admin'
        ? await resolveActorUsersManage(actor)
        : undefined
    const filtered = filterBootstrapForActor(
      data as Parameters<typeof filterBootstrapForActor>[0],
      actor,
      scope,
      aliases,
      { usersManage },
    )
    const bootstrapMs = Date.now() - bootstrapStarted
    c.header('Server-Timing', `bootstrap;dur=${bootstrapMs}`)
    if (lite && bootstrapMs > 2000) {
      console.info(`[api/bootstrap] lite bootstrap ${bootstrapMs}ms actor=${actor.role}`)
    }
    return c.json(filtered)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[api/bootstrap]', message)
    return c.json({ error: 'bootstrap_failed', message }, 500)
  }
})

/**
 * Signed-out marketplace: published listings only (see server/guestMarketplace.ts).
 * Replaces the old unauthenticated full /api/bootstrap payload for guests.
 */
app.get('/api/public/marketplace', async (c) => {
  if (!databaseConfigured) {
    return c.json(
      {
        error: 'database_unconfigured',
        message: databaseConfigError || 'DATABASE_URL is not set',
      },
      503,
    )
  }
  try {
    const lite = c.req.query('lite') !== '0' && c.req.query('lite') !== 'false'
    // P3a: ?id=<propertyId> returns that one listing with all its photos.
    const listingId = c.req.query('id')
    const rowLimit = lite ? 60 : 250
    const { buildBootstrap } = await loadBootstrapModule()
    if (listingId !== undefined) {
      const { publicListingById } = await import('./publicListing.js')
      const { resolveLiveListing } = await import('./listingResolve.js')
      const out = await publicListingById(listingId, {
        resolveUnitId: async (id) => (await resolveLiveListing(id)).unitId || null,
        build: async (unitIds) =>
          (await buildBootstrap({
            lite: true,
            unitIds,
            limits: { messages: 1, notifications: 1, leads: 1, applications: 1, tickets: 1, payments: 1, documents: 1 },
          })) as unknown as Record<string, unknown>,
      })
      return c.json(out.body, out.status)
    }
    const data = await buildBootstrap({
      lite,
      limits: {
        units: rowLimit,
        messages: 1,
        notifications: 1,
        leads: 1,
        applications: 1,
        tickets: 1,
        payments: 1,
        documents: 1,
      },
    })
    return c.json(filterBootstrapForGuest(data as unknown as Record<string, unknown>))
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[api/public/marketplace]', message)
    // Generic body only: never echo database / driver text to signed-out visitors.
    return c.json({ error: 'marketplace_failed', message: 'Listings are unavailable right now.' }, 500)
  }
})

/**
 * sitemap.xml (named in public/robots.txt): public pages plus every published
 * listing, built from the same guest marketplace rows as /api/public/marketplace.
 */
app.get('/api/sitemap.xml', async (c) => {
  const { buildSitemapXml, sitemapListings } = await import('./sitemap.js')
  const { appUrl } = await import('./email/layout.js')
  let listings: Array<{ id: string; lastmod?: string }> = []
  if (databaseConfigured) {
    try {
      const { buildBootstrap } = await loadBootstrapModule()
      const data = await buildBootstrap({
        lite: true,
        limits: { units: 500, messages: 1, notifications: 1, leads: 1, applications: 1, tickets: 1, payments: 1, documents: 1 },
      })
      listings = sitemapListings(filterBootstrapForGuest(data as unknown as Record<string, unknown>))
    } catch (err) {
      // Still serve the static pages; search engines retry later.
      console.error('[api/sitemap.xml]', err instanceof Error ? err.message : String(err))
    }
  }
  return c.body(buildSitemapXml(appUrl(), listings), 200, {
    'Content-Type': 'application/xml; charset=utf-8',
    'Cache-Control': 'public, max-age=3600',
  })
})

app.get('/api/v1/units', async (c) => {
  if (!databaseConfigured) {
    return c.json(
      {
        error: 'database_unconfigured',
        message: databaseConfigError || 'DATABASE_URL is not set',
      },
      503,
    )
  }
  try {
    const limit = Math.min(Math.max(Number(c.req.query('limit') || 24), 1), 100)
    const cursor = c.req.query('cursor') ?? null
    const clientId = c.req.query('client_id') ?? null
    const { fetchUnitsPage } = await loadUnitsFeedModule()
    const page = await fetchUnitsPage({ limit, cursor, clientId })
    return c.json({
      items: page.items,
      next_cursor: page.nextCursor,
      has_more: page.hasMore,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[api/v1/units]', message)
    // Signed-out route: never echo database / driver text.
    return c.json({ error: 'units_feed_failed', message: 'Listings are unavailable right now.' }, 500)
  }
})

/**
 * Inventory counts. Signed-in only.
 * - super_admin: platform-wide counts (as before).
 * - client_admin / agent_admin: the same keys counted for their own agency
 *   (client_id = their agency); clients is 1.
 * - Everyone else (ground agents, tenants, landlords, contractors): 403 —
 *   these are agency-wide totals, outside a property-locked scope.
 */
app.get('/api/counts', async (c) => {
  try {
    const actor = await requireActor(c, null)
    const COUNT_TABLES: Array<[string, string]> = [
      ['leads', 'leads'],
      ['payments', 'payments'],
      ['documents', 'documents'],
      ['notifications', 'notifications'],
      ['threads', 'message_threads'],
      ['messages', 'messages'],
      ['clients', 'clients'],
      ['units', 'units'],
    ]
    if (actor.role === 'super_admin') {
      const rows = await query<Record<string, string>>(
        `SELECT ${COUNT_TABLES.map(([k, t]) => `(SELECT COUNT(*)::text FROM ${t}) AS ${k}`).join(', ')}`,
      )
      return c.json({ scope: 'platform', ...(rows[0] ?? {}) })
    }
    if (actor.role !== 'client_admin' && actor.role !== 'agent_admin') {
      return c.json({ error: 'forbidden', message: 'Counts are for agency admins' }, 403)
    }
    const agencyFe = await normalizedActorAgency(actor)
    const clientUuid = agencyFe ? await resolveUuid('agency', agencyFe) : null
    if (!clientUuid) {
      return c.json({ error: 'forbidden', message: 'No agency on this account' }, 403)
    }
    const rows = await query<Record<string, string>>(
      `SELECT ${COUNT_TABLES.map(([k, t]) =>
        t === 'clients'
          ? `(SELECT COUNT(*)::text FROM clients WHERE id = $1::uuid) AS ${k}`
          : `(SELECT COUNT(*)::text FROM ${t} WHERE client_id = $1::uuid) AS ${k}`,
      ).join(', ')}`,
      [clientUuid],
    )
    return c.json({ scope: 'agency', agencyId: agencyFe, ...(rows[0] ?? {}) })
  } catch (err) {
    const status = errStatus(err)
    if (status === 401) return c.json({ error: 'unauthorized', message: 'Sign in required' }, 401)
    const message = err instanceof Error ? err.message : String(err)
    return c.json({ error: message }, status)
  }
})

/**
 * Payout dual control (approve / submit). The only path past `proposed`;
 * generic persist only ever creates proposals. See server/payoutRoutes.ts.
 */
for (const step of ['approve', 'submit'] as const) {
  app.post(`/api/trust/payouts/:id/${step}`, async (c) => {
    if (!databaseConfigured) {
      return c.json(
        { error: 'database_unconfigured', message: databaseConfigError || 'DATABASE_URL is not set' },
        503,
      )
    }
    try {
      const raw = await resolveRequestActor(c, null)
      if (!raw) throw actorRequiredError()
      const actor = await enrichActor(raw)
      const { approvePayout, submitPayout } = await import('./payoutRoutes.js')
      const id = c.req.param('id')
      const result = step === 'approve' ? await approvePayout(actor, id) : await submitPayout(actor, id)
      return c.json(result)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return c.json({ error: `payout_${step}_failed`, message }, errStatus(err))
    }
  })
}

/**
 * Deposit release dual control: held -> release_proposed -> release_approved,
 * two different agency admins (server/depositRoutes.ts). Generic persist never
 * moves a deposit's status.
 */
for (const step of ['propose-release', 'approve-release', 'reject-release', 'cancel-release', 'refund'] as const) {
  app.post(`/api/trust/deposits/:id/${step}`, async (c) => {
    if (!databaseConfigured) {
      return c.json(
        { error: 'database_unconfigured', message: databaseConfigError || 'DATABASE_URL is not set' },
        503,
      )
    }
    try {
      const raw = await resolveRequestActor(c, null)
      if (!raw) throw actorRequiredError()
      const actor = await enrichActor(raw)
      const routes = await import('./depositRoutes.js')
      const id = c.req.param('id')
      const body = ((await c.req.json().catch(() => ({}))) ?? {}) as Record<string, unknown>
      const result =
        step === 'propose-release'
          ? await routes.proposeDepositRelease(actor, id)
          : step === 'approve-release'
            ? await routes.approveDepositRelease(actor, id)
            : step === 'reject-release'
              ? await routes.rejectDepositRelease(actor, id, body)
              : step === 'cancel-release'
                ? await routes.cancelDepositRelease(actor, id, body)
                : await routes.recordDepositRefund(actor, id, body)
      return c.json(result)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return c.json({ error: `deposit_${step.replace(/-/g, '_')}_failed`, message }, errStatus(err))
    }
  })
}

/**
 * Deductions approved on a move-out inspection (POST /api/leases/:id/deductions),
 * read back to prefill the refund split for this deposit.
 */
app.get('/api/trust/deposits/:id/inspection-deductions', async (c) => {
  try {
    const actor = await requireActor(c)
    const { getInspectionDeductions } = await import('./depositRoutes.js')
    return c.json(await getInspectionDeductions(actor, c.req.param('id')))
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return c.json({ error: 'deposit_inspection_deductions_failed', message }, errStatus(err))
  }
})

/**
 * Listing / ticket photos → this server's disk (server/photoStorage.ts). Any
 * signed-in user may upload one compressed photo and gets its public URL; 503
 * STORAGE_NOT_CONFIGURED tells the client to keep the photo inline for now.
 */
app.post('/api/photos', async (c) => {
  try {
    const actor = await requireActor(c)
    const body = (await c.req.json().catch(() => ({}))) as { dataUrl?: unknown }
    if (typeof body.dataUrl !== 'string') return c.json({ error: 'bad_request', message: 'dataUrl is required' }, 400)
    const { uploadPhotoDataUrl } = await import('./photoStorage.js')
    // Files go under agency/<client uuid>/ so the storage page can count them per agency.
    const { clientUuidForAgency } = await import('./agencyStorage.js')
    const clientUuid = await clientUuidForAgency(actor.agencyId).catch(() => null)
    const folder = clientUuid ? `agency/${clientUuid}/listings` : 'listings'
    return c.json({ url: await uploadPhotoDataUrl(body.dataUrl, folder) })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const code = (err as { code?: string }).code ?? 'photo_upload_failed'
    return c.json({ error: code, message }, errStatus(err))
  }
})

/** Photos stored on this server's disk (self-hosted, see server/photoStorage.ts). Public, cached. */
app.get('/api/files/*', async (c) => {
  const { localFilePath } = await import('./photoStorage.js')
  const rel = decodeURIComponent(c.req.path.replace(/^\/api\/files\//, ''))
  const full = localFilePath(rel)
  if (!full) return c.json({ error: 'not_found' }, 404)
  try {
    const { readFile } = await import('node:fs/promises')
    const data = await readFile(full)
    const ext = rel.split('.').pop()?.toLowerCase()
    const type = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : ext === 'gif' ? 'image/gif' : 'image/jpeg'
    return new Response(data, { headers: { 'Content-Type': type, 'Cache-Control': 'public, max-age=31536000, immutable' } })
  } catch {
    return c.json({ error: 'not_found' }, 404)
  }
})

/** Super admin: storage used per agency, with allowances (server/agencyStorage.ts). */
app.get('/api/admin/storage', async (c) => {
  try {
    const actor = await requireActor(c)
    if (actor.role !== 'super_admin') return c.json({ error: 'forbidden', message: 'Super admin only' }, 403)
    const { listAgencyStorage, sendStorageAlerts } = await import('./agencyStorage.js')
    const agencies = await listAgencyStorage()
    await sendStorageAlerts(agencies).catch((err) =>
      console.error('[storage alerts]', err instanceof Error ? err.message : String(err)),
    )
    return c.json({ agencies })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return c.json({ error: 'storage_usage_failed', message }, errStatus(err))
  }
})

/** Super admin: set an agency's storage allowance (MB, null = unlimited) and warning %. */
app.put('/api/admin/storage/:agencyId', async (c) => {
  try {
    const actor = await requireActor(c)
    if (actor.role !== 'super_admin') return c.json({ error: 'forbidden', message: 'Super admin only' }, 403)
    const body = (await c.req.json().catch(() => ({}))) as { quotaMb?: unknown; warnPct?: unknown }
    const { setAgencyStorageQuota } = await import('./agencyStorage.js')
    await setAgencyStorageQuota(c.req.param('agencyId'), body)
    return c.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return c.json({ error: 'storage_quota_failed', message }, errStatus(err))
  }
})

/** Daily storage check: notify super admins about agencies near or over their allowance. */
app.get('/api/cron/storage-alerts', async (c) => {
  const secret = process.env.CRON_SECRET
  if (!secret) return c.json({ error: 'cron_disabled' }, 503)
  if (c.req.header('authorization') !== `Bearer ${secret}`) return c.json({ error: 'unauthorized' }, 401)
  try {
    const { listAgencyStorage, sendStorageAlerts } = await import('./agencyStorage.js')
    return c.json({ alerts: await sendStorageAlerts(await listAgencyStorage()) })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return c.json({ error: 'storage_alerts_failed', message }, 500)
  }
})

/** Escalations: overdue faults / help-desk tickets and yearly rent increases (server/escalations.ts). */
app.get('/api/escalations', async (c) => {
  try {
    const actor = await requireActor(c)
    const { listEscalations } = await import('./escalations.js')
    return c.json(await listEscalations(actor))
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return c.json({ error: 'escalations_failed', message }, errStatus(err))
  }
})

app.post('/api/escalations', async (c) => {
  try {
    const actor = await requireActor(c)
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
    const { escalateManually } = await import('./escalations.js')
    return c.json(await escalateManually(actor, body), 201)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return c.json({ error: 'escalate_failed', message }, errStatus(err))
  }
})

app.get('/api/escalations/settings', async (c) => {
  try {
    const actor = await requireActor(c)
    const { getEscalationSettings } = await import('./escalations.js')
    return c.json({ settings: await getEscalationSettings(actor, c.req.query('agencyId') ?? null) })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return c.json({ error: 'escalation_settings_failed', message }, errStatus(err))
  }
})

app.put('/api/escalations/settings', async (c) => {
  try {
    const actor = await requireActor(c)
    const body = (await c.req.json().catch(() => ({}))) as { agencyId?: string | null; settings?: unknown }
    const { saveEscalationSettings } = await import('./escalations.js')
    return c.json({ settings: await saveEscalationSettings(actor, body.agencyId ?? null, body.settings) })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return c.json({ error: 'escalation_settings_failed', message }, errStatus(err))
  }
})

app.post('/api/escalations/:id/actions', async (c) => {
  try {
    const actor = await requireActor(c)
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
    const { actOnEscalation } = await import('./escalations.js')
    return c.json({ escalation: await actOnEscalation(actor, c.req.param('id'), body) })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return c.json({ error: 'escalation_action_failed', message }, errStatus(err))
  }
})

/** Hourly: escalate overdue faults and tickets, send rent-increase notices, apply due increases. */
app.get('/api/cron/escalations', async (c) => {
  const secret = process.env.CRON_SECRET
  if (!secret) return c.json({ error: 'cron_disabled' }, 503)
  if (c.req.header('authorization') !== `Bearer ${secret}`) return c.json({ error: 'unauthorized' }, 401)
  const { runEscalations } = await import('./escalations.js')
  return c.json(await runEscalations())
})

/** Reviews (server/reviews.ts). Reading is public; writing needs a signed-in user. */

app.get('/api/reviews', async (c) => {
  try {
    const raw = await resolveRequestActor(c, null).catch(() => null)
    const actor = raw ? await enrichActor(raw) : null
    const { listReviews } = await import('./reviews.js')
    return c.json(
      await listReviews(actor, c.req.query('listingId') ?? '', { sort: c.req.query('sort'), target: c.req.query('target') }),
    )
  } catch (err) {
    return reviewError(c, 'reviews_failed', err)
  }
})

app.post('/api/reviews', async (c) => {
  try {
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
    const actor = await requireActor(c)
    const { upsertReview } = await import('./reviews.js')
    return c.json({ review: await upsertReview(actor, body) }, 201)
  } catch (err) {
    return reviewError(c, 'review_failed', err)
  }
})

app.post('/api/reviews/:id/actions', async (c) => {
  try {
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
    const actor = await requireActor(c)
    const { actOnReview } = await import('./reviews.js')
    return c.json(await actOnReview(actor, c.req.param('id'), body))
  } catch (err) {
    return reviewError(c, 'review_action_failed', err)
  }
})

app.get('/api/admin/reviews', async (c) => {
  try {
    const actor = await requireActor(c)
    const { moderationQueue } = await import('./reviews.js')
    return c.json({ reviews: await moderationQueue(actor) })
  } catch (err) {
    return reviewError(c, 'review_queue_failed', err)
  }
})

/** Complaints, warnings and public profiles (server/conduct.ts). */
app.get('/api/conduct/complaints', async (c) => {
  try {
    const actor = await requireActor(c)
    const { listComplaints } = await import('./conduct.js')
    return c.json(await listComplaints(actor))
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return c.json({ error: 'conduct_failed', message }, errStatus(err))
  }
})

app.post('/api/conduct/complaints', async (c) => {
  try {
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
    const actor = await requireActor(c)
    const { fileComplaint } = await import('./conduct.js')
    return c.json(await fileComplaint(actor, body))
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return c.json({ error: 'conduct_failed', message }, errStatus(err))
  }
})

app.post('/api/conduct/complaints/:id', async (c) => {
  try {
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
    const actor = await requireActor(c)
    const { handleComplaint } = await import('./conduct.js')
    return c.json(await handleComplaint(actor, c.req.param('id'), body))
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return c.json({ error: 'conduct_failed', message }, errStatus(err))
  }
})

app.get('/api/conduct/warnings', async (c) => {
  try {
    const actor = await requireActor(c)
    const { listWarnings } = await import('./conduct.js')
    return c.json(await listWarnings(actor))
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return c.json({ error: 'conduct_failed', message }, errStatus(err))
  }
})

app.post('/api/conduct/warnings', async (c) => {
  try {
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
    const actor = await requireActor(c)
    const { issueWarning } = await import('./conduct.js')
    return c.json(await issueWarning(actor, body))
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return c.json({ error: 'conduct_failed', message }, errStatus(err))
  }
})

app.post('/api/conduct/warnings/:id', async (c) => {
  try {
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
    const actor = await requireActor(c)
    const { actOnWarning } = await import('./conduct.js')
    return c.json(await actOnWarning(actor, c.req.param('id'), String(body.action ?? '')))
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return c.json({ error: 'conduct_failed', message }, errStatus(err))
  }
})

app.get('/api/profiles/:id', async (c) => {
  try {
    const raw = await resolveRequestActor(c, null).catch(() => null)
    const actor = raw ? await enrichActor(raw) : null
    const { publicProfile } = await import('./conduct.js')
    return c.json(await publicProfile(actor, c.req.param('id')))
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return c.json({ error: 'profile_failed', message }, errStatus(err))
  }
})

/** Contractor bookings (server/contractorBookings.ts). */
app.get('/api/contractor-bookings', async (c) => {
  try {
    const actor = await requireActor(c)
    const { listBookings } = await import('./contractorBookings.js')
    return c.json(await listBookings(actor))
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return c.json({ error: 'booking_failed', message }, errStatus(err))
  }
})

app.post('/api/contractor-bookings', async (c) => {
  try {
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
    const actor = await requireActor(c)
    const { createBooking } = await import('./contractorBookings.js')
    return c.json(await createBooking(actor, body))
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return c.json({ error: 'booking_failed', message }, errStatus(err))
  }
})

app.post('/api/contractor-bookings/:id', async (c) => {
  try {
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
    const actor = await requireActor(c)
    const { actOnBooking } = await import('./contractorBookings.js')
    return c.json(await actOnBooking(actor, c.req.param('id'), body))
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return c.json({ error: 'booking_failed', message }, errStatus(err))
  }
})

/** Lease inventory, move-in / move-out inspections and deposit deductions. */
registerInspectionRoutes(app)

/** Help desk: system tickets to the super admins (server/supportDesk.ts). */
app.post('/api/support-tickets', async (c) => {
  try {
    const actor = await requireActor(c)
    const { createSupportTicket } = await import('./supportDesk.js')
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
    return c.json({ ok: true, ticket: await createSupportTicket(actor, body, c.req.header('user-agent') ?? null) }, 201)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return c.json({ error: 'support_ticket_failed', message, ...errCode(err) }, errStatus(err))
  }
})

app.post('/api/support-tickets/:id/actions', async (c) => {
  try {
    const actor = await requireActor(c)
    const { actOnSupportTicket } = await import('./supportDesk.js')
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
    return c.json({ ok: true, ticket: await actOnSupportTicket(actor, c.req.param('id'), body) })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return c.json({ error: 'support_ticket_failed', message, ...errCode(err) }, errStatus(err))
  }
})

/** Tenant faults: conversation, confirm fixed, reopen (server/faultDesk.ts). */
app.get('/api/tickets/:id/thread', async (c) => {
  try {
    const actor = await requireActor(c)
    const { getFaultThread } = await import('./faultDesk.js')
    return c.json({ ok: true, ...(await getFaultThread(actor, c.req.param('id'))) })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return c.json({ error: 'fault_thread_failed', message, ...errCode(err) }, errStatus(err))
  }
})

app.post('/api/tickets/:id/thread', async (c) => {
  try {
    const actor = await requireActor(c)
    const { postFaultThread } = await import('./faultDesk.js')
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
    return c.json({ ok: true, ...(await postFaultThread(actor, c.req.param('id'), body)) })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return c.json({ error: 'fault_thread_failed', message, ...errCode(err) }, errStatus(err))
  }
})

/** Generic domain persist (RPC). AppStore fire-and-forgets here. */
app.post('/api/persist', async (c) => {
  if (!databaseConfigured) {
    return c.json(
      {
        error: 'database_unconfigured',
        message: databaseConfigError || 'DATABASE_URL is not set',
      },
      503,
    )
  }
  try {
    const body = (await c.req.json()) as PersistBody
    const result = await gatedPersist(c, body)
    // A generated temp password is in this response only: never cache it.
    if (result && typeof result === 'object' && 'tempPassword' in result) c.header('Cache-Control', 'no-store')
    return c.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[api/persist]', message)
    return c.json({ error: 'persist_failed', message, ...errCode(err) }, errStatus(err))
  }
})

/** Batch persist for multi-entity ops (e.g. thread + first message). */
app.post('/api/persist/batch', async (c) => {
  if (!databaseConfigured) {
    return c.json(
      {
        error: 'database_unconfigured',
        message: databaseConfigError || 'DATABASE_URL is not set',
      },
      503,
    )
  }
  try {
    const body = (await c.req.json()) as { ops?: PersistBody[] }
    const ops = Array.isArray(body.ops) ? body.ops : []
    const results = []
    for (const op of ops) {
      results.push(await gatedPersist(c, op))
    }
    if (results.some((r) => r && typeof r === 'object' && 'tempPassword' in r)) c.header('Cache-Control', 'no-store')
    return c.json({ ok: true, results })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[api/persist/batch]', message)
    return c.json({ error: 'persist_batch_failed', message, ...errCode(err) }, errStatus(err))
  }
})

// Convenience REST aliases (same handlers)
const restResources = [
  'agencies',
  'users',
  'buildings',
  'properties',
  'units',
  'rooms',
  'assets',
  'leads',
  'applications',
  'tenancies',
  'viewings',
  'viewing-slots',
  'payments',
  'tickets',
  'documents',
  'notifications',
  'threads',
  'messages',
  'lookups',
  'suite-alerts',
  'activities',
  'property-events',
  'invoices',
] as const

const resourceMap: Record<(typeof restResources)[number], PersistBody['resource']> = {
  agencies: 'agency',
  users: 'user',
  buildings: 'building',
  properties: 'property',
  units: 'unit',
  rooms: 'room',
  assets: 'asset',
  leads: 'lead',
  applications: 'application',
  tenancies: 'tenancy',
  viewings: 'viewing',
  'viewing-slots': 'viewing_slot',
  payments: 'payment',
  tickets: 'ticket',
  documents: 'document',
  notifications: 'notification',
  threads: 'thread',
  messages: 'message',
  lookups: 'lookup',
  'suite-alerts': 'suite_alert',
  activities: 'activity',
  'property-events': 'property_event',
  invoices: 'invoice',
}

for (const plural of restResources) {
  const resource = resourceMap[plural]

  app.post(`/api/${plural}`, async (c) => {
    try {
      const data = (await c.req.json()) as Record<string, unknown>
      const id = String(data.id ?? '')
      if (!id) return c.json({ error: 'id_required' }, 400)
      const body: PersistBody = { resource, action: 'upsert', id, data }
      const result = await gatedPersist(c, body)
      // A generated temp password is in this response only: never cache it.
      if (result && typeof result === 'object' && 'tempPassword' in result) c.header('Cache-Control', 'no-store')
      return c.json(result, 201)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return c.json({ error: 'create_failed', message, ...errCode(err) }, errStatus(err))
    }
  })

  app.patch(`/api/${plural}/:id`, async (c) => {
    try {
      const id = c.req.param('id')
      const data = (await c.req.json()) as Record<string, unknown>
      const body: PersistBody = {
        resource,
        action: 'upsert',
        id,
        data: { ...data, id },
      }
      const result = await gatedPersist(c, body)
      if (result && typeof result === 'object' && 'tempPassword' in result) c.header('Cache-Control', 'no-store')
      return c.json(result)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return c.json({ error: 'update_failed', message, ...errCode(err) }, errStatus(err))
    }
  })

  app.delete(`/api/${plural}/:id`, async (c) => {
    try {
      const id = c.req.param('id')
      const body: PersistBody = { resource, action: 'delete', id }
      const result = await gatedPersist(c, body)
      return c.json(result)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return c.json({ error: 'delete_failed', message, ...errCode(err) }, errStatus(err))
    }
  })
}

app.post('/api/public/listing-enquiry', async (c) => {
  try {
    const body = (await c.req.json()) as Record<string, unknown>
    const { submitPublicListingEnquiry } = await import('./publicEnquiry.js')
    const result = await submitPublicListingEnquiry({
      propertyId: String(body.propertyId ?? ''),
      action: body.action === 'viewing' ? 'viewing' : 'lead',
      firstName: String(body.firstName ?? ''),
      lastName: String(body.lastName ?? ''),
      email: String(body.email ?? ''),
      phone: body.phone ? String(body.phone) : undefined,
      notes: body.notes ? String(body.notes) : undefined,
      slotId: body.slotId ? String(body.slotId) : null,
      monthlyIncome: body.monthlyIncome != null ? Number(body.monthlyIncome) : null,
      idNumber: body.idNumber ? String(body.idNumber) : null,
      interestType: body.interestType === 'Buy' ? 'Buy' : 'Rent',
    })
    // Confirmation email — never blocks or fails the enquiry itself.
    void sendListingEnquiryConfirmation({
      email: String(body.email ?? ''),
      firstName: String(body.firstName ?? '').trim(),
      action: body.action === 'viewing' ? 'viewing' : 'lead',
    })
    // Agent (+ landlord when resolvable) alert — same fire-and-forget contract.
    void (async () => {
      try {
        const staff = await query<{
          agent_email: string | null
          agent_first: string | null
          landlord_email: string | null
          unit_title: string | null
        }>(
          `SELECT
             ag.email AS agent_email,
             ag.first_name AS agent_first,
             ld.email AS landlord_email,
             un.title AS unit_title
           FROM units un
           LEFT JOIN users ag ON ag.id = un.agent_id
           LEFT JOIN users ld ON ld.id = un.landlord_id
           WHERE un.id = $1::uuid
           LIMIT 1`,
          [result.unitId ?? null],
        )
        const s = staff[0]
        if (s?.agent_email) {
          void sendListingLeadAlert({
            agentEmail: s.agent_email,
            agentName: s.agent_first ?? undefined,
            landlordEmail: s.landlord_email ?? undefined,
            propertyTitle: s.unit_title ?? undefined,
            leadName: `${String(body.firstName ?? '').trim()} ${String(body.lastName ?? '').trim()}`.trim(),
            leadEmail: String(body.email ?? '').trim(),
            leadPhone: body.phone ? String(body.phone).trim() : undefined,
            action: body.action === 'viewing' ? 'viewing' : 'lead',
          })
        }
      } catch (alertErr) {
        console.error('[listing-enquiry] agent alert failed:', alertErr instanceof Error ? alertErr.message : alertErr)
      }
    })()
    return c.json(result, 201)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const waitlist =
      err && typeof err === 'object' && 'waitlist' in err ? Boolean((err as { waitlist: unknown }).waitlist) : undefined
    console.error('[api/public/listing-enquiry]', message)
    const error = message === 'LISTING_FULL' ? 'LISTING_FULL' : 'enquiry_failed'
    return c.json({ error, message, ...errCode(err), ...(waitlist != null ? { waitlist } : {}) }, errStatus(err))
  }
})

app.get('/api/units/:id/listing-limits', async (c) => {
  try {
    const actor = await requireActor(c)
    const { getListingLimits } = await import('./listingLimits.js')
    return c.json(await getListingLimits(actor, c.req.param('id')))
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return c.json({ error: 'listing_limits_failed', message, ...errCode(err) }, errStatus(err))
  }
})

app.patch('/api/units/:id/listing-limits', async (c) => {
  try {
    const actor = await requireActor(c)
    const body = (await c.req.json()) as Record<string, unknown>
    const { patchListingLimits } = await import('./listingLimits.js')
    return c.json(await patchListingLimits(actor, c.req.param('id'), body))
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return c.json({ error: 'listing_limits_failed', message, ...errCode(err) }, errStatus(err))
  }
})

app.post('/api/units/:id/listing-limits/reset', async (c) => {
  try {
    const actor = await requireActor(c)
    const { resetListingLimits } = await import('./listingLimits.js')
    return c.json(await resetListingLimits(actor, c.req.param('id')))
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return c.json({ error: 'listing_limits_failed', message, ...errCode(err) }, errStatus(err))
  }
})

/** Maintenance responsibility rules (migration 029): server/maintenanceRuleRoutes.ts. */
function maintenanceRulesError(c: Context, err: unknown) {
  const message = err instanceof Error ? err.message : String(err)
  return c.json({ error: 'maintenance_rules_failed', message, ...errCode(err) }, errStatus(err))
}

app.get('/api/units/:id/maintenance-categories', async (c) => {
  try {
    const actor = await requireActor(c)
    const { getUnitMaintenanceCategories } = await import('./maintenanceRuleRoutes.js')
    return c.json(await getUnitMaintenanceCategories(actor, c.req.param('id')))
  } catch (err) {
    return maintenanceRulesError(c, err)
  }
})

app.get('/api/maintenance-rule-sets', async (c) => {
  try {
    const actor = await requireActor(c)
    const { listRuleSets } = await import('./maintenanceRuleRoutes.js')
    return c.json(await listRuleSets(actor, { unitId: c.req.query('unitId') ?? null }))
  } catch (err) {
    return maintenanceRulesError(c, err)
  }
})

app.get('/api/maintenance-rule-sets/:id', async (c) => {
  try {
    const actor = await requireActor(c)
    const { getRuleSet } = await import('./maintenanceRuleRoutes.js')
    return c.json(await getRuleSet(actor, c.req.param('id')))
  } catch (err) {
    return maintenanceRulesError(c, err)
  }
})

app.post('/api/maintenance-rule-sets', async (c) => {
  try {
    const actor = await requireActor(c)
    const body = ((await c.req.json().catch(() => ({}))) ?? {}) as Record<string, unknown>
    const { createRuleSet } = await import('./maintenanceRuleRoutes.js')
    return c.json(await createRuleSet(actor, body), 201)
  } catch (err) {
    return maintenanceRulesError(c, err)
  }
})

app.patch('/api/maintenance-rule-sets/:id', async (c) => {
  try {
    const actor = await requireActor(c)
    const body = ((await c.req.json().catch(() => ({}))) ?? {}) as Record<string, unknown>
    const { updateRuleSet } = await import('./maintenanceRuleRoutes.js')
    return c.json(await updateRuleSet(actor, c.req.param('id'), body))
  } catch (err) {
    return maintenanceRulesError(c, err)
  }
})

app.delete('/api/maintenance-rule-sets/:id', async (c) => {
  try {
    const actor = await requireActor(c)
    const { deactivateRuleSet } = await import('./maintenanceRuleRoutes.js')
    return c.json(await deactivateRuleSet(actor, c.req.param('id')))
  } catch (err) {
    return maintenanceRulesError(c, err)
  }
})

app.patch('/api/tickets/:id/responsibility', async (c) => {
  try {
    const actor = await requireActor(c)
    const body = ((await c.req.json().catch(() => ({}))) ?? {}) as Record<string, unknown>
    const { patchTicketResponsibility } = await import('./maintenanceRuleRoutes.js')
    return c.json(await patchTicketResponsibility(actor, c.req.param('id'), body))
  } catch (err) {
    return maintenanceRulesError(c, err)
  }
})

app.post('/api/tickets/:id/forward-body-corporate', async (c) => {
  try {
    const actor = await requireActor(c)
    const { forwardToBodyCorporate } = await import('./maintenanceRuleRoutes.js')
    return c.json(await forwardToBodyCorporate(actor, c.req.param('id')))
  } catch (err) {
    return maintenanceRulesError(c, err)
  }
})

app.post('/api/units/:id/waitlist', async (c) => {
  try {
    const body = (await c.req.json()) as Record<string, unknown>
    const { joinViewingWaitlist } = await import('./listingLimits.js')
    const result = await joinViewingWaitlist({
      unitRef: c.req.param('id'),
      name: String(body.name ?? ''),
      email: String(body.email ?? ''),
      phone: body.phone ? String(body.phone) : undefined,
      kind: body.kind === 'enquiry' ? 'enquiry' : 'viewing',
    })
    return c.json(result, 201)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return c.json({ error: 'waitlist_failed', message, ...errCode(err) }, errStatus(err))
  }
})

app.post('/api/waitlist/:id/promote', async (c) => {
  try {
    const actor = await requireActor(c)
    const { promoteWaitlist } = await import('./listingLimits.js')
    return c.json(await promoteWaitlist(actor, c.req.param('id')))
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return c.json({ error: message === 'LISTING_FULL' ? 'LISTING_FULL' : 'waitlist_promote_failed', message, ...errCode(err) }, errStatus(err))
  }
})

app.post('/api/leads/:id/promote-waitlist', async (c) => {
  try {
    const actor = await requireActor(c)
    const { promoteWaitlistedLead } = await import('./listingLimits.js')
    return c.json(await promoteWaitlistedLead(actor, c.req.param('id')))
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return c.json({ error: message === 'LISTING_FULL' ? 'LISTING_FULL' : 'waitlist_promote_failed', message, ...errCode(err) }, errStatus(err))
  }
})

registerViewingApplyRoutes(app)
app.patch('/api/units/:id/advertise-while-occupied', async (c) => {
  try {
    const actor = await requireActor(c, null)
    const body = (await c.req.json().catch(() => ({}))) as {
      enabled?: boolean
      expectedAvailableFrom?: string | null
      reason?: string | null
      photoMode?: 'CURRENT' | 'PRE_OCCUPATION' | null
    }
    const { patchAdvertiseWhileOccupied } = await import('./occupiedListing.js')
    const result = await patchAdvertiseWhileOccupied(actor, c.req.param('id'), body)
    return c.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return c.json({ error: 'advertise_failed', message, ...errCode(err) }, errStatus(err))
  }
})

app.post('/api/leases/:id/notice', async (c) => {
  try {
    const actor = await requireActor(c, null)
    const body = (await c.req.json().catch(() => ({}))) as { givenBy?: string; givenAt?: string }
    const { postLeaseNotice } = await import('./occupiedListing.js')
    const result = await postLeaseNotice(actor, c.req.param('id'), body)
    return c.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return c.json({ error: 'notice_failed', message, ...errCode(err) }, errStatus(err))
  }
})

app.get('/api/leases/:id/viewing-windows', async (c) => {
  try {
    const actor = await requireActor(c, null)
    const { getViewingWindows } = await import('./occupiedListing.js')
    const windows = await getViewingWindows(actor, c.req.param('id'))
    return c.json({ windows })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return c.json({ error: 'windows_failed', message, ...errCode(err) }, errStatus(err))
  }
})

app.put('/api/leases/:id/viewing-windows', async (c) => {
  try {
    const actor = await requireActor(c, null)
    const body = (await c.req.json().catch(() => ({}))) as {
      windows?: Array<{ weekday: number | null; windowDate: string | null; startTime: string; endTime: string }>
    }
    const { putViewingWindows } = await import('./occupiedListing.js')
    const windows = await putViewingWindows(actor, c.req.param('id'), body.windows ?? [])
    return c.json({ windows })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return c.json({ error: 'windows_failed', message, ...errCode(err) }, errStatus(err))
  }
})

app.get('/api/leases/:id/viewing-requests', async (c) => {
  try {
    const actor = await requireActor(c, null)
    const { listTenantViewingRequests } = await import('./occupiedListing.js')
    const requests = await listTenantViewingRequests(actor, c.req.param('id'))
    return c.json({ requests })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return c.json({ error: 'viewing_requests_failed', message, ...errCode(err) }, errStatus(err))
  }
})

app.patch('/api/bookings/:id/tenant-response', async (c) => {
  try {
    const actor = await requireActor(c, null)
    const body = (await c.req.json().catch(() => ({}))) as { status?: string; proposedStartsAt?: string | null }
    const { patchTenantBookingResponse } = await import('./occupiedListing.js')
    const result = await patchTenantBookingResponse(actor, c.req.param('id'), body)
    return c.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return c.json({ error: 'tenant_response_failed', message, ...errCode(err) }, errStatus(err))
  }
})

app.post('/api/applications/:id/approve', async (c) => {
  try {
    const applicationId = c.req.param('id')
    const body = (await c.req.json().catch(() => ({}))) as {
      /** Ignored for audit — the verified actor is logged instead. */
      actorUserId?: string
      tenancy?: Record<string, unknown>
    }
    const { actor } = await requireActorAndGate(c, {
      resource: 'application',
      action: 'upsert',
      id: applicationId,
      data: { id: applicationId, stage: 'Approved' },
    })
    // Staff only. Applicants (tenant / contractor) never approve, their own
    // application included, and the gate above already refuses them with
    // APPLICATION_TRANSITION_FORBIDDEN. Landlords do not approve here either:
    // their review decision is the narrow /api/persist write (landlord_review
    // -> conditionally_approved | rejected), and this route creates the lease
    // and payments. The gate refuses a landlord's { stage: 'Approved' } too;
    // the explicit check keeps that true if the gate changes.
    if (actor.role === 'tenant' || actor.role === 'contractor' || actor.role === 'landlord') {
      return c.json(
        { error: 'forbidden', message: `Forbidden: ${actor.role} cannot approve applications` },
        403,
      )
    }
    const { approveApplicationTx } = await loadWritesModule()
    const result = await approveApplicationTx({
      applicationId,
      // Audit the verified actor, never the body's claim (body.actorUserId ignored).
      actorUserId: actor.userId,
      tenancy: body.tenancy,
    })
    // Approval email — additive lookup, never blocks or fails the approval.
    void (async () => {
      try {
        const rows = await query<{
          email: string
          first_name: string
          unit_title: string | null
        }>(
          `SELECT u.email, u.first_name, un.title AS unit_title
           FROM applications a
           JOIN users u ON u.id = a.applicant_id
           LEFT JOIN units un ON un.id = a.unit_id
           WHERE a.id = $1::uuid LIMIT 1`,
          [result.applicationUuid],
        )
        const applicant = rows[0]
        if (applicant?.email) {
          await sendApplicationApproved({
            email: applicant.email,
            applicantName: applicant.first_name,
            propertyTitle: applicant.unit_title ?? undefined,
          })
        }
      } catch (emailErr) {
        console.error('[approve] applicant email lookup failed:', emailErr instanceof Error ? emailErr.message : emailErr)
      }
    })()
    return c.json({ ok: true, ...result })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return c.json({ error: 'approve_failed', message, ...errCode(err) }, errStatus(err))
  }
})

/**
 * Email notify endpoint for client-side store flows: when
 * an application is created the store calls this once, fire-and-forget from the
 * user flow. Rate-limited per email; never returns the send outcome.
 */
app.post('/api/notify/application-received', async (c) => {
  try {
    const body = (await c.req.json()) as {
      email?: string
      applicantName?: string
      propertyTitle?: string
      referenceCode?: string
    }
    const actor = await resolveRequestActor(c, body as unknown as Record<string, unknown>)
    if (!actor) {
      return c.json({ error: 'actor_required', message: 'Sign in to confirm application email' }, 401)
    }
    if (actor.role !== 'tenant') {
      return c.json({ error: 'forbidden', message: 'Only the applicant can request this email' }, 403)
    }
    const ref = String(body.referenceCode ?? '').trim()
    if (!ref) {
      return c.json({ error: 'reference_required' }, 400)
    }
    if (!databaseConfigured()) {
      return c.json({ ok: true, emailed: false, reason: 'no_database' }, 202)
    }
    const rows = await query<{
      applicant_id: string | null
      db_email: string | null
    }>(
      `SELECT a.applicant_id::text AS applicant_id,
              COALESCE(u.email, a.metadata->>'applicant_email') AS db_email
         FROM applications a
         LEFT JOIN users u ON u.id = a.applicant_id
        WHERE a.reference_code = $1 OR a.metadata->>'frontend_id' = $1
        LIMIT 1`,
      [ref],
    )
    const row = rows[0]
    if (!row) {
      return c.json({ error: 'not_found' }, 404)
    }
    const actorUuid = await resolveUuid('user', actor.userId)
    if (!actorUuid || !row.applicant_id || actorUuid !== row.applicant_id) {
      return c.json({ error: 'forbidden', message: 'Application does not belong to this user' }, 403)
    }
    const email = String(body.email ?? '').trim()
    const dbEmail = String(row.db_email ?? '').trim().toLowerCase()
    if (email && dbEmail && email.toLowerCase() !== dbEmail) {
      return c.json({ error: 'forbidden', message: 'Email does not match application' }, 403)
    }
    const sendTo = email || dbEmail
    if (sendTo) {
      const gate = notifyEmailRateLimit(sendTo)
      if (!gate.ok) {
        const rl = tooManyRequests(gate.retryAfterSec)
        return c.json(rl.body, rl.status, rl.headers)
      }
      void sendApplicationReceived({
        email: sendTo,
        applicantName: body.applicantName ? String(body.applicantName).trim() : undefined,
        propertyTitle: body.propertyTitle ? String(body.propertyTitle).trim() : undefined,
        referenceCode: ref,
      })
    }
    return c.json({ ok: true }, 202)
  } catch {
    return c.json({ ok: true }, 202)
  }
})

app.post('/api/notify/application-declined', async (c) => {
  try {
    const body = (await c.req.json()) as {
      applicationId?: string
      email?: string
      applicantName?: string
      propertyTitle?: string
      reason?: string
    }
    const actor = await resolveRequestActor(c, body as unknown as Record<string, unknown>)
    if (!actor || !isStaffRole(actor.role)) {
      return c.json({ error: 'forbidden', message: 'Staff actor required' }, actor ? 403 : 401)
    }
    const email = String(body.email ?? '').trim()
    if (!email) return c.json({ ok: true, emailed: false }, 202)
    const gate = notifyEmailRateLimit(email)
    if (!gate.ok) {
      const rl = tooManyRequests(gate.retryAfterSec)
      return c.json(rl.body, rl.status, rl.headers)
    }
    void sendApplicationDeclined({
      email,
      applicantName: body.applicantName?.trim(),
      propertyTitle: body.propertyTitle?.trim(),
      reason: body.reason?.trim(),
    })
    return c.json({ ok: true }, 202)
  } catch {
    return c.json({ ok: true }, 202)
  }
})

app.post('/api/notify/application-approved', async (c) => {
  try {
    const body = (await c.req.json()) as {
      applicationId?: string
      email?: string
      applicantName?: string
      propertyTitle?: string
    }
    const actor = await resolveRequestActor(c, body as unknown as Record<string, unknown>)
    if (!actor || !isStaffRole(actor.role)) {
      return c.json({ error: 'forbidden', message: 'Staff actor required' }, actor ? 403 : 401)
    }
    const email = String(body.email ?? '').trim()
    if (!email) return c.json({ ok: true, emailed: false }, 202)
    const gate = notifyEmailRateLimit(email)
    if (!gate.ok) {
      const rl = tooManyRequests(gate.retryAfterSec)
      return c.json(rl.body, rl.status, rl.headers)
    }
    void sendApplicationApproved({
      email,
      applicantName: body.applicantName?.trim(),
      propertyTitle: body.propertyTitle?.trim(),
    })
    return c.json({ ok: true }, 202)
  } catch {
    return c.json({ ok: true }, 202)
  }
})


/**
 * DQ-M4 Mode A: optional Mailtrap rent-dunning email after staff in-app notice.
 * Auth + rate-limit (same notify bucket as application-received). Flag default OFF —
 * ENABLE_EMAIL_DUNNING must be truthy and Mailtrap configured or this is a no-op.
 * Fire-and-forget: never returns send outcome; fail ≠ fail UI.
 */
app.post('/api/notify/dunning-notice', async (c) => {
  try {
    const body = (await c.req.json()) as {
      email?: string
      tenantName?: string
      title?: string
      body?: string
      stage?: string
      propertyTitle?: string
      amountDisplay?: string
      dueDate?: string
      paymentId?: string
    }
    const actor = await resolveRequestActor(c, body as unknown as Record<string, unknown>)
    if (!actor) {
      return c.json({ error: 'actor_required', message: 'Staff actor required to send dunning email' }, 401)
    }
    if (!isStaffRole(actor.role)) {
      return c.json({ error: 'forbidden', message: 'Only agency staff can send dunning email' }, 403)
    }
    const email = String(body.email ?? '').trim()
    if (!email) {
      return c.json({ ok: true, emailed: false, reason: 'no_email' }, 202)
    }
    const gate = notifyEmailRateLimit(email)
    if (!gate.ok) {
      const rl = tooManyRequests(gate.retryAfterSec)
      return c.json(rl.body, rl.status, rl.headers)
    }
    void sendDunningNoticeEmail({
      email,
      tenantName: body.tenantName ? String(body.tenantName).trim() : undefined,
      title: String(body.title ?? 'Rent notice').trim() || 'Rent notice',
      body: String(body.body ?? '').trim() || 'Rent arrears notice (Mode A).',
      stage: String(body.stage ?? 'reminder_1').trim() || 'reminder_1',
      propertyTitle: body.propertyTitle ? String(body.propertyTitle).trim() : undefined,
      amountDisplay: body.amountDisplay ? String(body.amountDisplay).trim() : undefined,
      dueDate: body.dueDate ? String(body.dueDate).trim() : undefined,
    })
    return c.json({ ok: true }, 202)
  } catch {
    return c.json({ ok: true }, 202)
  }
})

/**
 * Checkout: signed-in only. The payer must be the session user (payment
 * party), or a staff role in the payment's agency (super admin: any).
 */
app.post('/api/payfast/create', async (c) => {
  let actor: Awaited<ReturnType<typeof requireActor>>
  try {
    actor = await requireActor(c, null)
  } catch (err) {
    return c.json({ ok: false, error: 'actor_required' }, errStatus(err))
  }
  return payfastCreate(c, async (payment: LoadedPayment) => {
    if (actor.role === 'super_admin') return null
    if (payment.partyUserId) {
      const actorUuid = await resolveUuid('user', actor.userId)
      if (actorUuid && actorUuid === payment.partyUserId) return null
    }
    if (isStaffRole(actor.role)) {
      const actorAgency = await normalizedActorAgency(actor)
      const paymentAgency = await agencyFeForClient(payment.clientUuid)
      if (actorAgency && paymentAgency && actorAgency === paymentAgency) return null
    }
    return { status: 403, error: 'payment_not_yours' }
  })
})

// ITN stays unauthenticated: PayFast calls it server-to-server and it is
// verified by source, signature and ledger amount inside payfastItn.


app.post('/api/payfast/itn', (c) => payfastItn(c))
app.get('/api/screening/provider', (c) => screeningProviderInfo(c))
app.post('/api/screening/webhook', (c) => screeningWebhook(c))
registerScreeningRoutes(app, {
  store: pgScreeningStore,
  registry: createProviderRegistry(process.env),
  env: process.env,
  now: () => new Date(),
  requireActor: (c) => requireActor(c),
})

app.get('/api/esign/provider', (c) => esignProviderInfo(c))
/**
 * E-sign create / status: signed-in only, and the lease (tenancyId) must be
 * readable by the actor (assertTenancyReadable). Status is also bound to the
 * envelope stored on that lease, so a lease in scope cannot be used to poll
 * someone else's document.
 */
app.post('/api/esign/create-envelope', async (c) => {
  try {
    const actor = await requireActor(c, null)
    const body = (await c.req.json().catch(() => ({}))) as { tenancyId?: unknown }
    const tenancyId = typeof body.tenancyId === 'string' ? body.tenancyId.trim() : ''
    if (!tenancyId) return c.json({ ok: false, error: 'tenancyId is required' }, 400)
    await assertTenancyReadable(actor, tenancyId)
  } catch (err) {
    const status = errStatus(err)
    return c.json(
      { ok: false, error: status === 401 ? 'actor_required' : status === 404 ? 'lease_not_found' : 'forbidden' },
      status,
    )
  }
  return esignCreateEnvelope(c)
})

app.post('/api/esign/status', async (c) => {
  try {
    const actor = await requireActor(c, null)
    const body = (await c.req.json().catch(() => ({}))) as {
      tenancyId?: unknown
      envelopeId?: unknown
      docId?: unknown
    }
    const tenancyId = typeof body.tenancyId === 'string' ? body.tenancyId.trim() : ''
    if (!tenancyId) return c.json({ ok: false, error: 'tenancyId is required' }, 400)
    const lease = await assertTenancyReadable(actor, tenancyId)
    const storedEnvelope =
      typeof lease.eSign?.envelopeId === 'string' ? (lease.eSign.envelopeId as string) : ''
    const requestedDoc =
      (typeof body.docId === 'string' && body.docId.trim()) ||
      (typeof body.envelopeId === 'string' && body.envelopeId.trim()
        ? docIdFromEnvelopeId(body.envelopeId.trim())
        : '')
    const storedDoc = storedEnvelope ? docIdFromEnvelopeId(storedEnvelope) : ''
    if (!storedDoc || !requestedDoc || requestedDoc !== storedDoc) {
      return c.json({ ok: false, error: 'envelope_not_on_lease' }, 403)
    }
  } catch (err) {
    const status = errStatus(err)
    return c.json(
      { ok: false, error: status === 401 ? 'actor_required' : status === 404 ? 'lease_not_found' : 'forbidden' },
      status,
    )
  }
  return esignStatus(c)
})
app.post('/api/esign/webhook', (c) => esignWebhook(c))

/** Notifications the app raises for other people (server/notificationDispatch.ts). */
app.post('/api/notifications/dispatch', async (c) => {
  try {
    const body = (await c.req.json().catch(() => ({}))) as { items?: unknown }
    const actor = await resolveRequestActor(c, body as Record<string, unknown>)
    if (!actor) throw actorRequiredError()
    const items = Array.isArray(body.items) ? (body.items as Record<string, unknown>[]) : []
    const { notificationDispatchRateLimit } = await import('./rateLimit.js')
    const gate = notificationDispatchRateLimit(actor.userId, items.length)
    if (!gate.ok) {
      const rl = tooManyRequests(gate.retryAfterSec)
      return c.json(rl.body, rl.status, rl.headers)
    }
    const { dispatchNotifications } = await import('./notificationDispatch.js')
    return c.json({ ok: true, ...(await dispatchNotifications(actor, items)) })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return c.json({ error: 'dispatch_failed', message }, errStatus(err))
  }
})

app.post('/api/notifications/mark-read', async (c) => {
  try {
    const body = (await c.req.json()) as {
      ids?: string[]
      userId?: string
      all?: boolean
    }
    const actor = await resolveRequestActor(c, body as unknown as Record<string, unknown>)
    if (!actor) throw actorRequiredError()
    // Own notifications only, for every role (an impersonating super admin
    // acts as the impersonated user). Ownership is also enforced in SQL.
    if (body.userId && body.userId !== actor.userId) {
      return c.json({ error: 'forbidden', message: 'Cannot mark another user notifications' }, 403)
    }
    const { markNotificationsRead } = await loadWritesModule()
    const result = await markNotificationsRead({
      ids: Array.isArray(body.ids) ? body.ids : undefined,
      all: Boolean(body.all),
      ownerUserId: actor.userId,
    })
    return c.json({ ok: true, ...result })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return c.json({ error: 'mark_read_failed', message }, errStatus(err))
  }
})

const shouldListen = process.env.PF_SKIP_SERVE !== '1'

if (shouldListen) {
  void import('@hono/node-server').then(({ serve }) => {
    console.log(`[propertyflow-api] listening on http://127.0.0.1:${PORT}`)
    console.log(`[propertyflow-api] DATABASE_URL host from env or default local trust auth`)
    serve({ fetch: app.fetch, port: PORT, hostname: '127.0.0.1' })
    // Email new notifications every minute (people can switch this off in Settings).
    void import('./notificationMailer.js').then(({ startNotificationMailer }) => startNotificationMailer())
    // Copy any inline or old-bucket listing photos onto this server's disk.
    void import('./photoStorage.js').then(({ moveOldPhotosToDisk }) => moveOldPhotosToDisk())
  })

  process.on('SIGINT', async () => {
    await pool?.end()
    process.exit(0)
  })
}

export default app
