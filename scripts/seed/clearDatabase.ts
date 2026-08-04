import type { SupabaseClient } from '@supabase/supabase-js'
import type pg from 'pg'
import {
  deleteAllAuthUsersExcept,
  findAuthUserByEmail,
  upsertEntityMap,
  type SeedEnv,
} from './helpers.js'

export type SuperAdminRefs = {
  authUserId: string
  appUserId: string
  email: string
}

const TRUNCATE_TABLES = [
  'automation_runs',
  'automation_rules',
  'suite_alerts',
  'event_log',
  'invoices',
  'client_subscriptions',
  'billing_plans',
  'messages',
  'message_threads',
  'notifications',
  'media_assets',
  'documents',
  'payments',
  'leads',
  'maintenance_ticket_updates',
  'maintenance_tickets',
  'vendor_category_routes',
  'bookings',
  'viewing_slots',
  'leases',
  'applications',
  'internal_assets',
  'rooms',
  'units',
  'buildings',
  'client_lookup_configs',
  'clients',
  'entity_id_map',
] as const

async function ensurePermissions(pool: pg.Pool) {
  await pool.query(`
    INSERT INTO permissions (id, code, description) VALUES
      ('ab000001-0001-4000-8000-000000000001', 'platform.manage', 'Manage all clients'),
      ('ab000001-0001-4000-8000-000000000002', 'client.manage', 'Manage client settings'),
      ('ab000001-0001-4000-8000-000000000003', 'users.manage', 'Invite and manage users'),
      ('ab000001-0001-4000-8000-000000000004', 'buildings.manage', 'Create/edit buildings'),
      ('ab000001-0001-4000-8000-000000000005', 'units.manage', 'Create/edit units'),
      ('ab000001-0001-4000-8000-000000000006', 'assets.manage', 'Manage internal assets'),
      ('ab000001-0001-4000-8000-000000000007', 'applications.review', 'Review applications'),
      ('ab000001-0001-4000-8000-000000000008', 'bookings.manage', 'Manage viewings'),
      ('ab000001-0001-4000-8000-000000000009', 'leases.manage', 'Manage leases'),
      ('ab000001-0001-4000-8000-000000000010', 'tickets.manage', 'Manage maintenance'),
      ('ab000001-0001-4000-8000-000000000011', 'portal.landlord', 'Landlord portal'),
      ('ab000001-0001-4000-8000-000000000012', 'portal.tenant', 'Tenant / applicant portal')
    ON CONFLICT (code) DO NOTHING
  `)

  await pool.query(`
    INSERT INTO role_permissions (role, permission_id)
    SELECT 'SUPER_ADMIN', id FROM permissions
    ON CONFLICT DO NOTHING
  `)
  await pool.query(`
    INSERT INTO role_permissions (role, permission_id)
    SELECT 'AGENCY_ADMIN', id FROM permissions WHERE code <> 'platform.manage'
    ON CONFLICT DO NOTHING
  `)
  await pool.query(`
    INSERT INTO role_permissions (role, permission_id)
    SELECT 'AGENT_ADMIN', id FROM permissions WHERE code IN (
      'buildings.manage','units.manage','assets.manage','applications.review',
      'bookings.manage','leases.manage','tickets.manage','users.manage'
    )
    ON CONFLICT DO NOTHING
  `)
  await pool.query(`
    INSERT INTO role_permissions (role, permission_id)
    SELECT 'GROUND_AGENT', id FROM permissions WHERE code IN (
      'units.manage','assets.manage','applications.review','bookings.manage','tickets.manage'
    )
    ON CONFLICT DO NOTHING
  `)
  await pool.query(`
    INSERT INTO role_permissions (role, permission_id)
    SELECT 'LANDLORD', id FROM permissions WHERE code IN ('portal.landlord','tickets.manage')
    ON CONFLICT DO NOTHING
  `)
  await pool.query(`
    INSERT INTO role_permissions (role, permission_id)
    SELECT 'END_USER', id FROM permissions WHERE code IN ('portal.tenant','bookings.manage')
    ON CONFLICT DO NOTHING
  `)
  await pool.query(`
    INSERT INTO role_permissions (role, permission_id)
    SELECT 'CONTRACTOR', id FROM permissions WHERE code IN ('tickets.manage')
    ON CONFLICT DO NOTHING
  `)
}

async function resolveSuperAdmin(
  pool: pg.Pool,
  admin: SupabaseClient,
  email: string,
): Promise<SuperAdminRefs> {
  const authUser = await findAuthUserByEmail(admin, email)
  if (!authUser) {
    throw new Error(`Super admin auth user not found: ${email}. Run npm run db:super-admin first.`)
  }

  const { rows } = await pool.query<{ id: string }>(
    `SELECT id FROM users WHERE auth_user_id = $1 LIMIT 1`,
    [authUser.id],
  )
  let appUserId = rows[0]?.id

  if (!appUserId) {
    const { rows: byEmail } = await pool.query<{ id: string }>(
      `SELECT id FROM users WHERE lower(email) = lower($1) LIMIT 1`,
      [email],
    )
    appUserId = byEmail[0]?.id
  }

  if (!appUserId) {
    console.warn(`Repairing missing public.users row for super admin ${email}`)
    const { rows: inserted } = await pool.query<{ id: string }>(
      `INSERT INTO users (
         id, auth_user_id, client_id, email, first_name, last_name, role, active, metadata, updated_at
       ) VALUES (
         gen_random_uuid(), $1, NULL, lower($2), 'Super', 'Admin', 'SUPER_ADMIN', TRUE,
         '{"frontend_id":"u-super","frontend_role":"super_admin","mustChangePassword":false}'::jsonb,
         NOW()
       )
       RETURNING id`,
      [authUser.id, email],
    )
    appUserId = inserted[0]?.id
  }

  if (!appUserId) {
    throw new Error(`Super admin public.users row not found for ${email}`)
  }

  return { authUserId: authUser.id, appUserId, email }
}

async function ensureSuperAdminRow(
  pool: pg.Pool,
  admin: SupabaseClient,
  refs: SuperAdminRefs,
) {
  await pool.query(
    `UPDATE users SET
       role = 'SUPER_ADMIN',
       client_id = NULL,
       active = TRUE,
       first_name = COALESCE(NULLIF(first_name, ''), 'Super'),
       last_name = COALESCE(NULLIF(last_name, ''), 'Admin'),
       auth_user_id = $2,
       metadata = jsonb_build_object(
         'frontend_id', 'u-super',
         'frontend_role', 'super_admin',
         'mustChangePassword', false
       ),
       updated_at = NOW()
     WHERE id = $1`,
    [refs.appUserId, refs.authUserId],
  )

  await upsertEntityMap(admin, 'user', 'u-super', refs.appUserId)
}

export async function clearDatabase(
  pool: pg.Pool,
  admin: SupabaseClient,
  env: SeedEnv,
): Promise<SuperAdminRefs> {
  const refs = await resolveSuperAdmin(pool, admin, env.superAdminEmail)
  console.log(`Keeping super admin: ${refs.email} (${refs.authUserId})`)

  const deletedAuth = await deleteAllAuthUsersExcept(admin, refs.authUserId)
  console.log(`Deleted ${deletedAuth} auth user(s)`)

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    for (const table of TRUNCATE_TABLES) {
      await client.query(`TRUNCATE TABLE ${table} RESTART IDENTITY CASCADE`)
    }
    await client.query(`DELETE FROM users WHERE id != $1`, [refs.appUserId])
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }

  await ensureSuperAdminRow(pool, admin, refs)
  await ensurePermissions(pool)

  console.log('Database cleared (super admin preserved)')
  return refs
}
