import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { Hono } from 'hono'
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
import { supabaseSessionMiddleware } from './supabase/middleware.js'
import type { PersistBody } from './writes.js'
import { payfastCreate, payfastItn, type LoadedPayment } from './payfastRoutes.js'
import { screeningProviderInfo, screeningWebhook } from './screeningRoutes.js'
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
  sendApplicationReceived,
  sendDunningNoticeEmail,
  sendLeaseEndReminder,
  isEmailLeaseReminderEnabled,
  sendVerificationDecision,
  sendWelcomeEmail,
} from './mailtrap.js'
import { ensureUuid, resolveFrontendId, resolveUuid } from './entityMap.js'
import { docIdFromEnvelopeId } from './signiflow.js'
import { registerSupabaseUserDirect } from './supabase/registerUser.js'
import { runningCommitSha } from './appConfig.js'

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
  if (/^https:\/\/([\w-]+\.)?vercel\.app$/i.test(origin)) return origin
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

app.use('*', supabaseSessionMiddleware)

/**
 * D3: while a session user has mustChangePassword (after a staff reset), only
 * /api/auth/me, change-password and logout work (login stays open so a
 * different account can sign in). Everything else: 403 PASSWORD_CHANGE_REQUIRED.
 */
const PASSWORD_CHANGE_ALLOWED_PATHS = new Set([
  '/api/auth/me',
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

function errStatus(err: unknown): ContentfulStatusCode {
  if (err && typeof err === 'object' && 'status' in err) {
    const s = Number((err as { status: unknown }).status)
    if (s >= 400 && s < 600) return s as ContentfulStatusCode
  }
  return 500
}

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
  return handlePersist(body, actor.userId)
}

/**
 * Daily lease end-date reminders (vercel.json cron "0 5 * * *" = 07:00 SAST).
 * Authorization: Bearer CRON_SECRET only (Vercel adds it). No session/demo actor.
 * CRON_SECRET unset -> 503 and does nothing.
 */
app.get('/api/cron/lease-reminders', async (c) => {
  const r = await handleLeaseRemindersCron(c.req.header('authorization'), process.env.CRON_SECRET, {
    query,
    withTransaction,
    resolveFrontendId: (type, id) => resolveFrontendId(type, id),
    resolveUuid: (type, fe) => resolveUuid(type, fe),
    sendEmail: sendLeaseEndReminder,
    emailEnabled: isEmailLeaseReminderEnabled,
  })
  return c.json(r.body, r.status)
})

app.get('/api/health', async (c) => {
  if (!databaseConfigured) {
    return c.json(
      {
        ok: false,
        database: 'unconfigured',
        error: databaseConfigError || 'DATABASE_URL is not set',
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
      commit: runningCommitSha(),
      at: new Date().toISOString(),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return c.json(
      {
        ok: false,
        database: 'down',
        error: message,
        warning: databaseConfigWarning,
        hint: 'Use the Supabase Transaction pooler URI (port 6543) and redeploy after setting DATABASE_URL.',
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
        message: 'Set AUTH_SECRET in Vercel environment variables, then redeploy.',
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

/**
 * Supabase-mode registration: creates the auth user directly (pre-confirmed)
 * instead of calling GoTrue /auth/v1/signup, whose confirmation-email quota
 * (429 over_email_send_rate_limit) and email validator (400
 * email_address_invalid on plus-addresses) were locking new users out.
 * The client then signs in on the normal password-grant path.
 */
app.post('/api/auth/register-supabase', async (c) => {
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
  try {
    const body = (await c.req.json()) as {
      email?: string
      password?: string
      firstName?: string
      lastName?: string
      phone?: string
      role?: string
      profile?: Record<string, unknown>
      documents?: unknown[]
    }
    // Per-mailbox guard (bot loops on one address), checked after parsing the body.
    const emailGate = authEmailRateLimit(String(body.email ?? ''))
    if (!emailGate.ok) {
      const rl = tooManyRequests(emailGate.retryAfterSec)
      return c.json(rl.body, rl.status, rl.headers)
    }
    const result = await registerSupabaseUserDirect({
      email: String(body.email ?? ''),
      password: String(body.password ?? ''),
      firstName: String(body.firstName ?? ''),
      lastName: String(body.lastName ?? ''),
      phone: body.phone ? String(body.phone) : undefined,
      role: body.role ? String(body.role) : undefined,
      profile: body.profile,
      documents: body.documents,
    })
    // Fire-and-forget welcome email — registration must never depend on it.
    void sendWelcomeEmail({
      email: result.email,
      firstName: String(body.firstName ?? '').trim() || 'there',
      role: result.roleFe,
    })
    return c.json({ ok: true, authUserId: result.authUserId, bootstrap: result.bootstrap }, 201)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return c.json({ error: 'register_failed', message }, errStatus(err))
  }
})

app.patch('/api/admin/users/:userId/verification', async (c) => {
  try {
    // 1) API-mode session (HMAC cookie/bearer). 2) Supabase-mode session:
    //    the browser keeps its session in localStorage, so it passes the
    //    supabase JWT as a Bearer header — validate it with GoTrue, then load
    //    the local profile and require super admin.
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
      const authHeader = c.req.header('authorization') ?? ''
      const token = authHeader.toLowerCase().startsWith('bearer ')
        ? authHeader.slice(7).trim()
        : ''
      if (!token) {
        return c.json({ error: 'unauthorized', message: 'Sign in required' }, 401)
      }
      const { resolveSupabasePublishableKeyForGoTrue, resolveSupabaseUrlForGoTrue } =
        await import('./supabase/env.js')
      const sbBase = resolveSupabaseUrlForGoTrue()
      const sbKey = resolveSupabasePublishableKeyForGoTrue()
      if (!sbBase || !sbKey) {
        return c.json({ error: 'forbidden', message: 'Super admin required' }, 403)
      }
      const goTrue = await fetch(`${sbBase}/auth/v1/user`, {
        headers: { apikey: sbKey, Authorization: `Bearer ${token}` },
      }).catch(() => null)
      if (!goTrue || !goTrue.ok) {
        return c.json({ error: 'forbidden', message: 'Invalid or expired session' }, 403)
      }
      const goTrueUser = (await goTrue.json().catch(() => ({}))) as { id?: string }
      if (!goTrueUser.id) {
        return c.json({ error: 'forbidden', message: 'Super admin required' }, 403)
      }
      const profRows = await query<{
        id: string
        role: string
        metadata: Record<string, unknown> | null
      }>('SELECT id, role, metadata FROM users WHERE auth_user_id = $1::uuid LIMIT 1', [
        goTrueUser.id,
      ])
      const profile = profRows[0]
      const feRole = String(profile?.metadata?.frontend_role ?? '')
      const dbRole = String(profile?.role ?? '')
      const allowedBearer =
        profile &&
        (dbRole === 'SUPER_ADMIN' ||
          feRole === 'super_admin' ||
          dbRole === 'AGENCY_ADMIN' ||
          feRole === 'client_admin' ||
          dbRole === 'AGENT_ADMIN' ||
          feRole === 'agent_admin')
      if (!allowedBearer) {
        return c.json({ error: 'forbidden', message: 'Staff access required' }, 403)
      }
      reviewerFeId =
        typeof profile.metadata?.frontend_id === 'string'
          ? (profile.metadata.frontend_id as string)
          : profile.id
      reviewerRole =
        feRole ||
        (dbRole === 'SUPER_ADMIN'
          ? 'super_admin'
          : dbRole === 'AGENCY_ADMIN'
            ? 'client_admin'
            : dbRole === 'AGENT_ADMIN'
              ? 'agent_admin'
              : null)
      const clientRows = await query<{ agency_fe: string | null }>(
        `SELECT COALESCE(c.settings->>'frontend_id', c.id::text) AS agency_fe
         FROM users u LEFT JOIN clients c ON c.id = u.client_id
         WHERE u.id = $1::uuid LIMIT 1`,
        [profile.id],
      )
      reviewerAgencyId = clientRows[0]?.agency_fe ?? null
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
        message: 'Set AUTH_SECRET in Vercel environment variables, then redeploy.',
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
    const body = (await c.req.json().catch(() => ({}))) as { userId?: unknown }
    const userId = typeof body.userId === 'string' ? body.userId.trim() : ''
    if (!userId) return c.json({ error: 'bad_request', message: 'userId is required' }, 400)
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
    const result = await resetUserPassword(actor, userId, { impersonatedUserId })
    return c.json({ ok: true, userId: result.target.id, tempPassword: result.tempPassword })
  } catch (err) {
    const status = errStatus(err)
    // Message only (never the request body, which cannot hold a password here anyway).
    const message = status >= 500 ? 'Password reset failed' : err instanceof Error ? err.message : String(err)
    if (status >= 500) console.error('[reset-password] failed:', err instanceof Error ? err.message : 'unknown')
    return c.json({ error: 'reset_password_failed', message }, status)
  }
})

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
    const { agencyFeId } = await loadScopeGateModule()
    const { buildBootstrap } = await loadBootstrapModule()
    const bootstrapStarted = Date.now()
    const data = await buildBootstrap({
      lite,
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
    const { buildActorPropertyScope, filterBootstrapForActor, actorIdAliases, resolveActorUsersManage } =
      await loadScopeGateModule()
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
      await actorIdAliases(actor),
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
    return c.json({ error: 'units_feed_failed', message }, 500)
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
    console.error('[api/public/listing-enquiry]', message)
    return c.json({ error: 'enquiry_failed', message }, errStatus(err))
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
    return c.json({ error: 'approve_failed', message }, errStatus(err))
  }
})

/**
 * Email notify endpoint for client-side persistence paths (Supabase mode): when
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
    const email = String(body.email ?? '').trim()
    if (email) {
      const gate = notifyEmailRateLimit(email)
      if (!gate.ok) {
        const rl = tooManyRequests(gate.retryAfterSec)
        return c.json(rl.body, rl.status, rl.headers)
      }
      void sendApplicationReceived({
        email,
        applicantName: body.applicantName ? String(body.applicantName).trim() : undefined,
        propertyTitle: body.propertyTitle ? String(body.propertyTitle).trim() : undefined,
        referenceCode: body.referenceCode ? String(body.referenceCode).trim() : undefined,
      })
    }
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

const shouldListen =
  !process.env.VERCEL && process.env.PF_SKIP_SERVE !== '1'

if (shouldListen) {
  void import('@hono/node-server').then(({ serve }) => {
    console.log(`[propertyflow-api] listening on http://127.0.0.1:${PORT}`)
    console.log(`[propertyflow-api] DATABASE_URL host from env or default local trust auth`)
    serve({ fetch: app.fetch, port: PORT, hostname: '127.0.0.1' })
  })

  process.on('SIGINT', async () => {
    await pool?.end()
    process.exit(0)
  })
}

export default app
