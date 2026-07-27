import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { buildBootstrap } from './bootstrap.js'
import { pool, query } from './db.js'
import { ensureEntityMapTable } from './entityMap.js'
import {
  actorRequiredError,
  parseDemoActor,
  ACTOR_AGENCY_HEADER,
  ACTOR_ROLE_HEADER,
  ACTOR_USER_HEADER,
  type DemoActor,
} from './actor.js'
import {
  actorFromSession,
  clearSession,
  issueSession,
  loginUser,
  registerUser,
  resolveSessionUser,
  sessionToPublic,
  updateUserVerification,
} from './auth.js'
import {
  assertPersistAllowed,
  buildActorPropertyScope,
  enrichActor,
  filterBootstrapForActor,
} from './scopeGate.js'
import {
  approveApplicationTx,
  handlePersist,
  markNotificationsRead,
  type PersistBody,
} from './writes.js'

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

function errStatus(err: unknown): number {
  if (err && typeof err === 'object' && 'status' in err) {
    const s = Number((err as { status: unknown }).status)
    if (s >= 400 && s < 600) return s
  }
  return 500
}

async function resolveRequestActor(
  c: Parameters<typeof parseDemoActor>[0],
  body?: Record<string, unknown> | null,
): Promise<DemoActor | null> {
  const fromHeaders = parseDemoActor(c, body)
  if (fromHeaders) return fromHeaders
  const session = await resolveSessionUser(c)
  return session ? actorFromSession(session) : null
}

async function requireActorAndGate(c: Parameters<typeof parseDemoActor>[0], body: PersistBody) {
  const raw = await resolveRequestActor(c, body as unknown as Record<string, unknown>)
  if (!raw) throw actorRequiredError()
  const actor = await enrichActor(raw)
  await assertPersistAllowed(actor, body)
  return actor
}

app.get('/api/health', async (c) => {
  try {
    await query('SELECT 1 AS ok')
    return c.json({ ok: true, database: 'up', at: new Date().toISOString() })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return c.json({ ok: false, database: 'down', error: message }, 503)
  }
})

app.get('/api/auth/bootstrap-needed', async (c) => {
  try {
    const rows = await query<{ n: string }>('SELECT COUNT(*)::text AS n FROM users')
    return c.json({ needed: Number(rows[0]?.n ?? 0) === 0 })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return c.json({ error: 'bootstrap_check_failed', message }, 500)
  }
})

app.post('/api/auth/register', async (c) => {
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

app.patch('/api/admin/users/:userId/verification', async (c) => {
  try {
    const session = await resolveSessionUser(c)
    if (!session || session.role !== 'super_admin') {
      return c.json({ error: 'forbidden', message: 'Super admin required' }, 403)
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
      reviewerFrontendId: session.frontendId,
    })
    return c.json({ ok: true, user: sessionToPublic(user) })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return c.json({ error: 'verification_update_failed', message }, errStatus(err))
  }
})

app.post('/api/auth/login', async (c) => {
  try {
    const body = (await c.req.json()) as { email?: string; password?: string }
    const user = await loginUser(String(body.email ?? ''), String(body.password ?? ''))
    const token = issueSession(c, user)
    return c.json({ ok: true, token, user: sessionToPublic(user) })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return c.json({ error: 'login_failed', message }, errStatus(err))
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

app.get('/api/bootstrap', async (c) => {
  try {
    await ensureEntityMapTable()
    const data = await buildBootstrap()
    const rawActor = await resolveRequestActor(c, null)
    if (!rawActor) {
      return c.json({ ...data, scoped: false, actor: null })
    }
    const actor = await enrichActor(rawActor)
    const scope = await buildActorPropertyScope(actor)
    const filtered = filterBootstrapForActor(
      data as Parameters<typeof filterBootstrapForActor>[0],
      actor,
      scope,
    )
    return c.json(filtered)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[api/bootstrap]', message)
    return c.json({ error: 'bootstrap_failed', message }, 500)
  }
})

app.get('/api/counts', async (c) => {
  try {
    const rows = await query<{
      leads: string
      payments: string
      documents: string
      notifications: string
      threads: string
      messages: string
      clients: string
      units: string
    }>(`
      SELECT
        (SELECT COUNT(*)::text FROM leads) AS leads,
        (SELECT COUNT(*)::text FROM payments) AS payments,
        (SELECT COUNT(*)::text FROM documents) AS documents,
        (SELECT COUNT(*)::text FROM notifications) AS notifications,
        (SELECT COUNT(*)::text FROM message_threads) AS threads,
        (SELECT COUNT(*)::text FROM messages) AS messages,
        (SELECT COUNT(*)::text FROM clients) AS clients,
        (SELECT COUNT(*)::text FROM units) AS units
    `)
    return c.json(rows[0] ?? {})
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return c.json({ error: message }, 500)
  }
})

/** Generic domain persist (RPC). AppStore fire-and-forgets here. */
app.post('/api/persist', async (c) => {
  try {
    const body = (await c.req.json()) as PersistBody
    await requireActorAndGate(c, body)
    const result = await handlePersist(body)
    return c.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[api/persist]', message)
    return c.json({ error: 'persist_failed', message }, errStatus(err))
  }
})

/** Batch persist for multi-entity ops (e.g. thread + first message). */
app.post('/api/persist/batch', async (c) => {
  try {
    const body = (await c.req.json()) as { ops?: PersistBody[] }
    const ops = Array.isArray(body.ops) ? body.ops : []
    const results = []
    for (const op of ops) {
      await requireActorAndGate(c, op)
      results.push(await handlePersist(op))
    }
    return c.json({ ok: true, results })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[api/persist/batch]', message)
    return c.json({ error: 'persist_batch_failed', message }, errStatus(err))
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
      await requireActorAndGate(c, body)
      const result = await handlePersist(body)
      return c.json(result, 201)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return c.json({ error: 'create_failed', message }, errStatus(err))
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
      await requireActorAndGate(c, body)
      const result = await handlePersist(body)
      return c.json(result)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return c.json({ error: 'update_failed', message }, errStatus(err))
    }
  })

  app.delete(`/api/${plural}/:id`, async (c) => {
    try {
      const id = c.req.param('id')
      const body: PersistBody = { resource, action: 'delete', id }
      await requireActorAndGate(c, body)
      const result = await handlePersist(body)
      return c.json(result)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return c.json({ error: 'delete_failed', message }, errStatus(err))
    }
  })
}

app.post('/api/applications/:id/approve', async (c) => {
  try {
    const applicationId = c.req.param('id')
    const body = (await c.req.json().catch(() => ({}))) as {
      actorUserId?: string
      tenancy?: Record<string, unknown>
    }
    await requireActorAndGate(c, {
      resource: 'application',
      action: 'upsert',
      id: applicationId,
      data: { id: applicationId, stage: 'Approved' },
    })
    const result = await approveApplicationTx({
      applicationId,
      actorUserId: body.actorUserId,
      tenancy: body.tenancy,
    })
    return c.json({ ok: true, ...result })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return c.json({ error: 'approve_failed', message }, errStatus(err))
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
    // Only mark own notifications unless agency-wide / super_admin
    if (
      body.userId &&
      body.userId !== actor.userId &&
      actor.role !== 'super_admin' &&
      actor.role !== 'client_admin' &&
      actor.role !== 'agent_admin'
    ) {
      return c.json({ error: 'forbidden', message: 'Cannot mark another user notifications' }, 403)
    }
    const result = await markNotificationsRead(body)
    return c.json({ ok: true, ...result })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return c.json({ error: 'mark_read_failed', message }, errStatus(err))
  }
})

void ensureEntityMapTable()
  .then(() => console.log('[propertyflow-api] entity_id_map ready'))
  .catch((err) => console.warn('[propertyflow-api] entity_id_map init failed', err))

const shouldListen =
  !process.env.VERCEL && process.env.PF_SKIP_SERVE !== '1'

if (shouldListen) {
  console.log(`[propertyflow-api] listening on http://127.0.0.1:${PORT}`)
  console.log(`[propertyflow-api] DATABASE_URL host from env or default local trust auth`)
  serve({ fetch: app.fetch, port: PORT, hostname: '127.0.0.1' })

  process.on('SIGINT', async () => {
    await pool.end()
    process.exit(0)
  })
}

export default app
