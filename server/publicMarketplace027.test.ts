/**
 * Text checks on migration 027's public surface (always run, no database).
 * Angela #110 points 1-8: explicit key lists only, users [], no landlord /
 * agent ids, notes, settings, email, phone or metadata; public_listing_unit_json
 * not callable by anon; grants after the bodies; tvw_mutate lease check;
 * enquiry RPC accepts occupied adverts.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  PUBLIC_BOOTSTRAP_KEYS,
  PUBLIC_BOOTSTRAP_LITE_KEYS,
  PUBLIC_BUILDING_KEYS,
  PUBLIC_CLIENT_KEYS,
  PUBLIC_ID_MAP_KEYS,
  PUBLIC_ROOM_KEYS,
  PUBLIC_SLOT_KEYS,
  PUBLIC_UNIT_KEYS,
} from './publicMarketplaceKeys.js'

const MIGRATION = readFileSync('database/postgres/migrations/027_advertise_while_occupied.sql', 'utf8')
const RPCS = ['get_public_marketplace_bootstrap', 'get_public_marketplace_bootstrap_lite'] as const

/** Full text of `CREATE OR REPLACE FUNCTION <name>(` up to its closing `$$;`. */
function fnBody(name: string): string {
  const start = MIGRATION.indexOf(`CREATE OR REPLACE FUNCTION ${name}(`)
  expect(start, name).toBeGreaterThan(-1)
  const end = MIGRATION.indexOf('$$;', MIGRATION.indexOf('AS $$', start) + 5)
  return MIGRATION.slice(start, end + 3)
}

/** Top-level keys of the final SELECT jsonb_build_object(...) of an RPC. */
function sectionText(body: string, section: string, next: string | null): string {
  const final = body.slice(body.lastIndexOf('SELECT jsonb_build_object('))
  const start = final.indexOf(`'${section}', `)
  expect(start, section).toBeGreaterThan(-1)
  const end = next ? final.indexOf(`'${next}', `, start) : final.length
  return final.slice(start, end)
}

/** Keys written as `'key', <expr>` on their own line inside a section. */
function lineKeys(text: string): string[] {
  return [...text.matchAll(/^\s+'([a-z_]+)',\s/gm)].map((m) => m[1])
}

function topLevelKeys(body: string): string[] {
  const final = body.slice(body.lastIndexOf('SELECT jsonb_build_object('))
  return [...final.matchAll(/^ {4}'([a-z_]+)',\s/gm)].map((m) => m[1])
}

describe('027 public marketplace RPCs: explicit keys only', () => {
  for (const fn of RPCS) {
    const body = fnBody(fn)
    const lite = fn.endsWith('_lite')
    const order = lite ? [...PUBLIC_BOOTSTRAP_LITE_KEYS] : [...PUBLIC_BOOTSTRAP_KEYS]
    const next = (s: string) => order[order.indexOf(s as never) + 1] ?? null

    it(`${fn}: top-level keys are exactly the public payload`, () => {
      expect(topLevelKeys(body)).toEqual(order)
    })

    it(`${fn}: users is always [] (no landlord rows)`, () => {
      expect(body).toContain(`'users', '[]'::jsonb`)
      expect(body).not.toMatch(/FROM users/i)
      expect(body).not.toMatch(/unit_landlords/)
      expect(body).not.toMatch(/entity_type = 'user'/)
    })

    it(`${fn}: clients, buildings, slots, id map have exact keys`, () => {
      expect(lineKeys(sectionText(body, 'clients', next('clients')))).toEqual([...PUBLIC_CLIENT_KEYS])
      expect(lineKeys(sectionText(body, 'buildings', next('buildings')))).toEqual([...PUBLIC_BUILDING_KEYS])
      expect(lineKeys(sectionText(body, 'viewing_slots', next('viewing_slots')))).toEqual([...PUBLIC_SLOT_KEYS])
      expect(lineKeys(sectionText(body, 'entity_id_map', null))).toEqual([...PUBLIC_ID_MAP_KEYS])
      if (!lite) {
        expect(lineKeys(sectionText(body, 'rooms', next('rooms')))).toEqual([...PUBLIC_ROOM_KEYS])
      }
    })

    it(`${fn}: units are public_listing_unit_json || limit snapshot only`, () => {
      const units = sectionText(body, 'units', next('units'))
      expect(units).toContain('public_listing_unit_json(u.id) || unit_listing_limit_snapshot(u.id)')
      // Lite only swaps the image list for one cover image.
      expect(lineKeys(units)).toEqual([])
    })

    it(`${fn}: no whole-row serialisation and no PII / internal columns`, () => {
      expect(body).not.toMatch(/to_jsonb\s*\(/i)
      expect(body).not.toMatch(/row_to_json/i)
      for (const word of ['email', 'phone', 'metadata', 'agent_id', 'notes', 'password_hash', 'auth_user_id']) {
        expect(body.includes(word), `${fn} mentions ${word}`).toBe(false)
      }
      // landlord_id is only passed to the verification gate, never selected.
      expect(body.match(/landlord_id/g)).toEqual(['landlord_id'])
      expect(body).toContain('public_listing_landlord_ok(b.landlord_id)')
      // settings is read only for the agency frontend id and the global-config filter.
      const settingsUses = [...body.matchAll(/settings[^,\n]*/g)].map((m) => m[0])
      for (const use of settingsUses) {
        expect(use).toMatch(/^settings->>'(frontend_id|isGlobalConfigClient)'/)
      }
    })

    it(`${fn}: EXECUTE granted to anon and authenticated after the new body`, () => {
      const bodyEnd = MIGRATION.indexOf(body) + body.length
      const revoke = MIGRATION.indexOf(`REVOKE ALL ON FUNCTION ${fn}(boolean) FROM PUBLIC;`)
      const grant = MIGRATION.indexOf(`GRANT EXECUTE ON FUNCTION ${fn}(boolean) TO anon, authenticated;`)
      expect(revoke).toBeGreaterThan(bodyEnd)
      expect(grant).toBeGreaterThan(revoke)
    })
  }
})

describe('027 public_listing_unit_json', () => {
  const body = fnBody('public_listing_unit_json')

  it('has exactly the public unit keys (no agent_id)', () => {
    expect(lineKeys(body)).toEqual([...PUBLIC_UNIT_KEYS])
    expect(body).not.toContain('agent_id')
  })

  it('is SECURITY INVOKER and anon / authenticated cannot EXECUTE it', () => {
    expect(body).toMatch(/SECURITY INVOKER/)
    expect(body).not.toMatch(/SECURITY DEFINER/)
    expect(MIGRATION).toContain('REVOKE ALL ON FUNCTION public_listing_unit_json(UUID) FROM PUBLIC, anon, authenticated;')
    expect(MIGRATION).not.toMatch(/GRANT[^;]*public_listing_unit_json/i)
  })

  it('landlord verification lives in an internal helper nobody public can call', () => {
    const helper = fnBody('public_listing_landlord_ok')
    expect(helper).toMatch(/SECURITY INVOKER/)
    expect(MIGRATION).toContain('REVOKE ALL ON FUNCTION public_listing_landlord_ok(UUID) FROM PUBLIC, anon, authenticated;')
    expect(MIGRATION).not.toMatch(/GRANT[^;]*public_listing_landlord_ok/i)
    for (const fn of RPCS) expect(fnBody(fn)).toContain('public_listing_landlord_ok(b.landlord_id)')
  })
})

describe('027 tenant_viewing_windows_mutate (point 7)', () => {
  it('staff WITH CHECK requires the lease to be on that unit and in their agency', () => {
    const start = MIGRATION.indexOf('CREATE POLICY tenant_viewing_windows_mutate')
    const policy = MIGRATION.slice(start, MIGRATION.indexOf(';', start))
    const check = policy.slice(policy.indexOf('WITH CHECK'))
    expect(check).toMatch(
      /AND EXISTS \(\s*SELECT 1 FROM leases l\s*WHERE l\.id = tenant_viewing_windows\.lease_id\s*AND l\.unit_id = tenant_viewing_windows\.unit_id\s*AND l\.client_id = current_app_client_id\(\)\s*\)/,
    )
  })
})

describe('027 submit_public_listing_enquiry (occupied adverts)', () => {
  const body = fnBody('submit_public_listing_enquiry')
  const SIG = 'TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT'

  it('keeps the exact 024 signature, SECURITY DEFINER and grants', () => {
    expect(body).toMatch(
      /submit_public_listing_enquiry\(\s*p_property_fe_id\s+TEXT,\s*p_action\s+TEXT,\s*p_first_name\s+TEXT,\s*p_last_name\s+TEXT,\s*p_email\s+TEXT,\s*p_phone\s+TEXT DEFAULT NULL,\s*p_notes\s+TEXT DEFAULT NULL,\s*p_slot_fe_id\s+TEXT DEFAULT NULL,\s*p_monthly_income\s+NUMERIC DEFAULT NULL,\s*p_id_number\s+TEXT DEFAULT NULL,\s*p_interest_type\s+TEXT DEFAULT 'RENT'\s*\)\s*RETURNS JSONB/,
    )
    expect(body).toMatch(/SECURITY DEFINER/)
    const flat = MIGRATION.replace(/\s+/g, ' ')
    expect(flat).toContain(`REVOKE ALL ON FUNCTION submit_public_listing_enquiry( ${SIG} ) FROM PUBLIC;`)
    expect(flat).toContain(`GRANT EXECUTE ON FUNCTION submit_public_listing_enquiry( ${SIG} ) TO anon, authenticated;`)
  })

  it('lets an advertised occupied rental past property_not_public', () => {
    expect(body).toMatch(/IF NOT COALESCE\(v_occupied, false\)\s+AND v_status_key NOT IN/)
    expect(body.replace(/\s+/g, ' ')).toContain(
      "(u.advertise_while_occupied = true AND u.available_from IS NOT NULL AND upper(u.status_config_key) = 'OCCUPIED' AND lower(coalesce(u.listing_type, 'rent')) IN ('rent', 'both'))",
    )
  })

  it('enforces notice and the tenant windows, then asks the tenant (same as the API path)', () => {
    expect(body).toContain("RAISE EXCEPTION 'notice_too_short'")
    expect(body).toContain("RAISE EXCEPTION 'outside_viewing_window'")
    expect(body).toContain('GREATEST(24, COALESCE(u.occupied_viewing_notice_hours, 24))')
    expect(body).toContain("CASE WHEN COALESCE(v_occupied, false) THEN 'PENDING' ELSE 'NOT_REQUIRED' END")
    expect(body).toContain("'viewing_tenant_notified'")
    expect(body).toContain("'Viewing requested'")
  })
})

describe('027 public bodies block', () => {
  it('is one contiguous marked block at the end of the migration', () => {
    const begin = MIGRATION.indexOf('-- BEGIN 027-public-bodies')
    const end = MIGRATION.indexOf('-- END 027-public-bodies')
    expect(begin).toBeGreaterThan(-1)
    expect(end).toBeGreaterThan(begin)
    expect(MIGRATION.slice(end).trim()).toBe('-- END 027-public-bodies')
    const block = MIGRATION.slice(begin, end)
    for (const name of [
      'CREATE POLICY tenant_viewing_windows_select',
      'CREATE POLICY tenant_viewing_windows_mutate',
      'FUNCTION public_listing_unit_json(',
      'FUNCTION get_public_marketplace_bootstrap(',
      'FUNCTION get_public_marketplace_bootstrap_lite(',
      'FUNCTION submit_public_listing_enquiry(',
    ]) {
      expect(block).toContain(name)
      expect(MIGRATION.slice(0, begin)).not.toContain(name)
    }
  })
})
