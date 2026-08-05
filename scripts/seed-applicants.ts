/**
 * Re-seed demo applicants + applications (does not wipe other data).
 * Applicants are not booked into viewing slots — slots stay empty for marketplace guests.
 *
 * Usage:
 *   set -a && source .env.local && set +a
 *   npm run db:seed:applicants
 */
import { AGENCY_ID } from './seed/data/agency.js'
import { APPLICANTS, APPLICATION_DEFS, APPLICANT_DB_ROLE } from './seed/data/applicants.js'
import { PROPERTIES } from './seed/data/properties.js'
import {
  createAdminClient,
  createPgPool,
  createAuthUser,
  fixedUuid,
  getAppUserIdByAuth,
  loadSeedEnv,
} from './seed/helpers.js'

async function main() {
  const env = loadSeedEnv()
  const admin = createAdminClient(env)
  const pool = createPgPool(env.directUrl)

  try {
    const users = new Map<string, { appUserId: string }>()
    const unitByFe = new Map<string, { unitId: string; agentFeId: string }>()

    for (let i = 0; i < PROPERTIES.length; i++) {
      const p = PROPERTIES[i]
      const unitId = fixedUuid('b4000001', i + 1)
      unitByFe.set(p.feId, { unitId, agentFeId: p.agentFeId })
    }

    console.log(`Creating ${APPLICANTS.length} applicant account(s)…`)
    for (const applicant of APPLICANTS) {
      const authId = await createAuthUser(admin, {
        email: applicant.email,
        firstName: applicant.firstName,
        lastName: applicant.lastName,
        phone: applicant.phone,
        dbRole: APPLICANT_DB_ROLE,
        feId: applicant.feId,
        clientId: AGENCY_ID,
        password: env.demoPassword,
        metadata: { verification: { status: 'not_required' } },
      })
      const appUserId = await getAppUserIdByAuth(admin, authId)
      users.set(applicant.feId, { appUserId })
      console.log(`  ${applicant.email}`)
    }

    console.log(`Creating ${APPLICATION_DEFS.length} application(s)…`)
    for (let i = 0; i < APPLICATION_DEFS.length; i++) {
      const app = APPLICATION_DEFS[i]
      const applicant = users.get(app.applicantFeId)
      const unit = unitByFe.get(app.propertyFeId)
      if (!applicant || !unit) {
        throw new Error(`Missing refs for application ${app.ref}`)
      }

      const { rows: agentRows } = await pool.query<{ agent_id: string | null }>(
        `SELECT agent_id FROM units WHERE id = $1 LIMIT 1`,
        [unit.unitId],
      )

      const { error } = await admin.from('applications').insert({
        id: fixedUuid('b7010001', i + 1),
        client_id: AGENCY_ID,
        unit_id: unit.unitId,
        applicant_id: applicant.appUserId,
        agent_id: agentRows[0]?.agent_id ?? null,
        reference_code: app.ref,
        application_type: app.type,
        status: app.status,
        monthly_income: 52000 + i * 5000,
        employment_summary: 'Seeded applicant — manual test',
        move_in_date: app.type === 'RENTAL' ? '2026-09-01' : null,
        submitted_at: new Date().toISOString(),
      })
      if (error) throw error
      console.log(`  ${app.ref} → ${app.propertyFeId}`)
    }

    console.log('Done (no viewing slot bookings for applicants).')
  } finally {
    await pool.end()
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? (err.stack ?? err.message) : err)
  process.exit(1)
})
