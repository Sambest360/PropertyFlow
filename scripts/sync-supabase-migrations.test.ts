import { readFileSync, existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/** Source file → copy applied by `supabase start` / `supabase db reset`. */
const COPIED = [
  ['database/postgres/schema.sql', 'supabase/migrations/20260101000000_schema.sql'],
  ['database/postgres/migrations/001_performance_indexes.sql', 'supabase/migrations/20260101000001_001_performance_indexes.sql'],
  ['database/postgres/migrations/002_supabase_auth.sql', 'supabase/migrations/20260101000002_002_supabase_auth.sql'],
  ['database/postgres/migrations/003_rls_bootstrap.sql', 'supabase/migrations/20260101000003_003_rls_bootstrap.sql'],
  ['database/postgres/migrations/004_ensure_user_profile.sql', 'supabase/migrations/20260101000004_004_ensure_user_profile.sql'],
  ['database/postgres/migrations/005_public_listing_enquiry.sql', 'supabase/migrations/20260101000005_005_public_listing_enquiry.sql'],
  ['database/postgres/migrations/006_public_marketplace_bootstrap.sql', 'supabase/migrations/20260101000006_006_public_marketplace_bootstrap.sql'],
  ['database/postgres/migrations/007_clear_demo_applications.sql', 'supabase/migrations/20260101000007_007_clear_demo_applications.sql'],
  ['database/postgres/migrations/007_public_marketplace_rooms.sql', 'supabase/migrations/20260101000008_007_public_marketplace_rooms.sql'],
  ['database/postgres/migrations/007_trust_banking.sql', 'supabase/migrations/20260101000009_007_trust_banking.sql'],
  ['database/postgres/migrations/008_public_marketplace_lite.sql', 'supabase/migrations/20260101000010_008_public_marketplace_lite.sql'],
  ['database/postgres/migrations/008_realtime_publication.sql', 'supabase/migrations/20260101000011_008_realtime_publication.sql'],
  ['database/postgres/migrations/008_ticket_updates_rls.sql', 'supabase/migrations/20260101000012_008_ticket_updates_rls.sql'],
  ['database/postgres/migrations/009_fix_auth_user_profile_sync.sql', 'supabase/migrations/20260101000013_009_fix_auth_user_profile_sync.sql'],
  ['database/postgres/migrations/010_lead_metadata.sql', 'supabase/migrations/20260101000014_010_lead_metadata.sql'],
  ['database/postgres/migrations/011_tenant_isolation.sql', 'supabase/migrations/20260101000015_011_tenant_isolation.sql'],
  ['database/postgres/migrations/011a_public_rpc_stopgap.sql', 'supabase/migrations/20260101000016_011a_public_rpc_stopgap.sql'],
] as const

describe('supabase migration copies', () => {
  it('matches database/postgres in the documented order', () => {
    for (const [source, copy] of COPIED) {
      expect(readFileSync(copy, 'utf8'), copy).toBe(readFileSync(source, 'utf8'))
    }
  })

  it('does not apply the 011a rollback or the manual verify script', () => {
    expect(existsSync('supabase/migrations/20260101000017_011a_public_rpc_stopgap_rollback.sql')).toBe(false)
    expect(existsSync('supabase/migrations/20260101000018_011a_public_rpc_stopgap_verify.sql')).toBe(false)
    const names = COPIED.map(([, copy]) => copy).join('\n')
    expect(names).not.toMatch(/rollback|verify/)
  })
})
