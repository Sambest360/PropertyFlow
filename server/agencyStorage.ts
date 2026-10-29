/**
 * Per-agency storage allowance (super admin).
 *
 * Usage per agency = database rows the agency owns (every public table with a
 * client_id column, measured with pg_column_size) + files in the
 * listing-photos Storage bucket that belong to it (uploaded under
 * agency/<client uuid>/, or referenced from its buildings / units photos).
 *
 * The allowance lives in clients.settings.storage:
 *   { quotaMb: number | null, warnPct: number, lastAlertLevel, lastAlertAt }
 * When an agency crosses its warning level or goes over its allowance, every
 * super admin gets a notification (once per level, repeated daily while over).
 */
import { query } from './db.js'

export type StorageLevel = 'ok' | 'warning' | 'exceeded' | 'unlimited'

export type AgencyStorageRow = {
  clientId: string
  agencyId: string
  name: string
  dbBytes: number
  fileBytes: number
  usedBytes: number
  quotaMb: number | null
  warnPct: number
  level: StorageLevel
  percent: number | null
}

export const DEFAULT_WARN_PCT = 80
const MB = 1024 * 1024
const DAY_MS = 24 * 60 * 60 * 1000

type StorageSettings = {
  quotaMb?: number | null
  warnPct?: number
  lastAlertLevel?: StorageLevel
  lastAlertAt?: string
}

function readSettings(raw: unknown): StorageSettings {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const s = (raw as { storage?: unknown }).storage
  return s && typeof s === 'object' && !Array.isArray(s) ? (s as StorageSettings) : {}
}

export function storageLevel(usedBytes: number, quotaMb: number | null | undefined, warnPct: number): StorageLevel {
  if (quotaMb == null || !(quotaMb > 0)) return 'unlimited'
  const pct = (usedBytes / (quotaMb * MB)) * 100
  if (pct >= 100) return 'exceeded'
  if (pct >= warnPct) return 'warning'
  return 'ok'
}

const IDENT_RE = /^[a-z_][a-z0-9_]*$/

/** Bytes of database rows per client uuid. Tables that fail to read are skipped. */
async function dbBytesByClient(): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  const tables = await query<{ table_name: string }>(
    `SELECT c.table_name FROM information_schema.columns c
       JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name
      WHERE c.table_schema = 'public' AND c.column_name = 'client_id' AND t.table_type = 'BASE TABLE'`,
  )
  for (const { table_name } of tables) {
    if (!IDENT_RE.test(table_name)) continue
    try {
      const rows = await query<{ client_id: string; bytes: string }>(
        `SELECT client_id::text AS client_id, COALESCE(SUM(pg_column_size(t.*)), 0)::text AS bytes
           FROM ${table_name} t WHERE client_id IS NOT NULL GROUP BY client_id`,
      )
      for (const r of rows) out.set(r.client_id, (out.get(r.client_id) ?? 0) + Number(r.bytes))
    } catch {
      /* table without readable client_id rows — skip */
    }
  }
  return out
}

/** Bytes of photos on the server's own disk (self-hosted), per client uuid. */
async function localFileBytesByClient(): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  const { listLocalFiles } = await import('./photoStorage.js')
  const files = await listLocalFiles().catch(() => [])
  if (!files.length) return out
  const owners = await query<{ client_id: string; images: string }>(
    `SELECT client_id::text AS client_id, images::text AS images FROM units WHERE images::text LIKE '%/api/files/%'
     UNION ALL
     SELECT client_id::text, images::text FROM buildings WHERE images::text LIKE '%/api/files/%'`,
  ).catch(() => [])
  for (const f of files) {
    const m = /^agency\/([0-9a-f-]{36})\//i.exec(f.path)
    const client = m?.[1] ?? owners.find((o) => o.images.includes(f.path))?.client_id
    if (client) out.set(client, (out.get(client) ?? 0) + f.size)
  }
  return out
}

export async function listAgencyStorage(): Promise<AgencyStorageRow[]> {
  const clients = await query<{ id: string; fe: string; name: string; settings: unknown }>(
    `SELECT id::text AS id, COALESCE(settings->>'frontend_id', id::text) AS fe, company_name AS name, settings
       FROM clients WHERE status <> 'cancelled' ORDER BY company_name`,
  )
  const [db, local] = await Promise.all([dbBytesByClient(), localFileBytesByClient()])
  return clients.map((c) => {
    const s = readSettings(c.settings)
    const dbBytes = db.get(c.id) ?? 0
    const fileBytes = local.get(c.id) ?? 0
    const usedBytes = dbBytes + fileBytes
    const quotaMb = typeof s.quotaMb === 'number' && s.quotaMb > 0 ? s.quotaMb : null
    const warnPct = typeof s.warnPct === 'number' && s.warnPct > 0 && s.warnPct <= 100 ? s.warnPct : DEFAULT_WARN_PCT
    return {
      clientId: c.id,
      agencyId: c.fe,
      name: c.name,
      dbBytes,
      fileBytes,
      usedBytes,
      quotaMb,
      warnPct,
      level: storageLevel(usedBytes, quotaMb, warnPct),
      percent: quotaMb ? Math.round((usedBytes / (quotaMb * MB)) * 1000) / 10 : null,
    }
  })
}

function fmt(bytes: number): string {
  if (bytes >= 1024 * MB) return `${(bytes / (1024 * MB)).toFixed(2)} GB`
  return `${(bytes / MB).toFixed(1)} MB`
}

/**
 * Notify super admins about agencies at or over their warning level. A level
 * is announced once when reached; "exceeded" repeats at most once a day.
 * Returns how many agencies triggered an alert.
 */
export async function sendStorageAlerts(rows: AgencyStorageRow[], now = new Date()): Promise<number> {
  const settingsRows = await query<{ id: string; settings: unknown }>(
    `SELECT id::text AS id, settings FROM clients WHERE id = ANY($1::uuid[])`,
    [rows.map((r) => r.clientId)],
  )
  const settingsById = new Map(settingsRows.map((r) => [r.id, readSettings(r.settings)]))
  let admins: { id: string }[] | null = null
  let sent = 0
  for (const row of rows) {
    const prev = settingsById.get(row.clientId) ?? {}
    const alertable = row.level === 'warning' || row.level === 'exceeded'
    if (!alertable) {
      if (prev.lastAlertLevel && prev.lastAlertLevel !== row.level) {
        await query(
          `UPDATE clients SET settings = jsonb_set(COALESCE(settings, '{}'::jsonb), '{storage,lastAlertLevel}', to_jsonb($2::text), true) WHERE id = $1::uuid`,
          [row.clientId, row.level],
        )
      }
      continue
    }
    const last = prev.lastAlertAt ? Date.parse(prev.lastAlertAt) : 0
    const sameLevel = prev.lastAlertLevel === row.level
    const due = !sameLevel || (row.level === 'exceeded' && now.getTime() - last >= DAY_MS)
    if (!due) continue
    admins ??= await query<{ id: string }>(`SELECT id::text AS id FROM users WHERE role = 'SUPER_ADMIN' AND active`)
    const quota = row.quotaMb ? fmt(row.quotaMb * MB) : 'unlimited'
    const title =
      row.level === 'exceeded'
        ? `${row.name} is over its storage allowance`
        : `${row.name} has used ${Math.floor(row.percent ?? 0)}% of its storage`
    const body = `${row.name} is using ${fmt(row.usedBytes)} of ${quota}. Review it on the Storage page to increase the allowance or ask the agency to clean up.`
    for (const a of admins) {
      await query(
        `INSERT INTO notifications (client_id, user_id, title, body, link_path, resource_type, action_type)
         VALUES (NULL, $1::uuid, $2, $3, '/workspace/admin/storage', 'storage', 'alert')`,
        [a.id, title.slice(0, 200), body],
      )
    }
    await query(
      `UPDATE clients SET settings = COALESCE(settings, '{}'::jsonb) ||
         jsonb_build_object('storage', COALESCE(settings->'storage', '{}'::jsonb) ||
           jsonb_build_object('lastAlertLevel', $2::text, 'lastAlertAt', $3::text))
       WHERE id = $1::uuid`,
      [row.clientId, row.level, now.toISOString()],
    )
    sent++
  }
  return sent
}

/** Set an agency's allowance (MB, null = unlimited) and warning percentage. */
export async function setAgencyStorageQuota(
  agencyId: string,
  input: { quotaMb?: unknown; warnPct?: unknown },
): Promise<void> {
  const quota =
    input.quotaMb === null || input.quotaMb === '' || input.quotaMb === undefined ? null : Number(input.quotaMb)
  if (quota !== null && (!Number.isFinite(quota) || quota <= 0 || quota > 10_000_000)) {
    throw Object.assign(new Error('Allowance must be a positive number of MB, or empty for unlimited'), { status: 400 })
  }
  const warn = input.warnPct === undefined ? DEFAULT_WARN_PCT : Number(input.warnPct)
  if (!Number.isFinite(warn) || warn < 1 || warn > 100) {
    throw Object.assign(new Error('Warning level must be between 1 and 100%'), { status: 400 })
  }
  const rows = await query<{ id: string }>(
    `UPDATE clients SET settings = COALESCE(settings, '{}'::jsonb) ||
       jsonb_build_object('storage', COALESCE(settings->'storage', '{}'::jsonb) ||
         jsonb_build_object('quotaMb', $2::numeric, 'warnPct', $3::numeric)),
       updated_at = NOW()
     WHERE id::text = $1 OR settings->>'frontend_id' = $1
     RETURNING id::text AS id`,
    [agencyId, quota === null ? null : Math.round(quota), Math.round(warn)],
  )
  if (!rows.length) throw Object.assign(new Error('Agency not found'), { status: 404 })
}

/** Client uuid for an agency frontend id (or uuid), used for upload folders. */
export async function clientUuidForAgency(agencyId: string | null | undefined): Promise<string | null> {
  if (!agencyId) return null
  const rows = await query<{ id: string }>(
    `SELECT id::text AS id FROM clients WHERE id::text = $1 OR settings->>'frontend_id' = $1 LIMIT 1`,
    [agencyId],
  )
  return rows[0]?.id ?? null
}
