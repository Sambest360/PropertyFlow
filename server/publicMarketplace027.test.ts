/**
 * Text checks on migration 027's public surface (always run, no database).
 * Angela #110 points 1-8: explicit key lists only, users [], no landlord /
 * agent ids, notes, settings, email, phone or metadata; public_listing_unit_json
 * not callable by anon; grants after the bodies; tvw_mutate lease check;
 * enquiry RPC accepts occupied adverts. Every key of every jsonb_build_object
 * is extracted (not just line-start keys), and the leak rules run on the RPCs,
 * public_listing_unit_json and both internal helpers.
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

/** Strip `--` comments (outside string literals) so prose never counts as SQL. */
function stripComments(sql: string): string {
  let out = ''
  let inStr = false
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i]
    if (inStr) {
      out += ch
      if (ch === "'") {
        if (sql[i + 1] === "'") {
          out += sql[++i]
        } else inStr = false
      }
      continue
    }
    if (ch === "'") {
      inStr = true
      out += ch
      continue
    }
    if (ch === '-' && sql[i + 1] === '-') {
      while (i < sql.length && sql[i] !== '\n') i++
      out += '\n'
      continue
    }
    out += ch
  }
  return out
}

/** Top-level comma-separated arguments of the call whose `(` is at `open`. */
function callArgs(sql: string, open: number): string[] {
  const args: string[] = []
  let depth = 0
  let inStr = false
  let cur = ''
  for (let i = open; i < sql.length; i++) {
    const ch = sql[i]
    if (inStr) {
      cur += ch
      if (ch === "'") {
        if (sql[i + 1] === "'") cur += sql[++i]
        else inStr = false
      }
      continue
    }
    if (ch === "'") {
      inStr = true
      cur += ch
      continue
    }
    if (ch === '(') {
      depth++
      if (depth === 1) continue
    }
    if (ch === ')') {
      depth--
      if (depth === 0) {
        args.push(cur.trim())
        return args
      }
    }
    if (ch === ',' && depth === 1) {
      args.push(cur.trim())
      cur = ''
      continue
    }
    cur += ch
  }
  throw new Error('unbalanced jsonb_build_object(')
}

/**
 * EVERY key of EVERY jsonb_build_object( ... ) in `text`, in order, wherever it
 * sits on the line (Angela: the old line-start regex missed `'id', x, 'phone', y`).
 * A key argument that is not a plain string literal fails loudly.
 */
function objectKeys(text: string): string[] {
  const sql = stripComments(text)
  const keys: string[] = []
  for (const m of sql.matchAll(/jsonb_build_object\s*\(/gi)) {
    const args = callArgs(sql, m.index! + m[0].length - 1)
    if (args.length === 1 && args[0] === '') continue
    expect(args.length % 2, `odd jsonb_build_object arity near ${m.index}`).toBe(0)
    for (let i = 0; i < args.length; i += 2) {
      const key = /^'([A-Za-z_]+)'$/.exec(args[i])
      expect(key, `non-literal jsonb key: ${args[i]}`).not.toBeNull()
      keys.push(key![1])
    }
  }
  return keys
}

/** Keys of the objects inside a section (nested jsonb_build_object calls only). */
function lineKeys(text: string): string[] {
  return objectKeys(text)
}

/** Whole-row / record serialisation of any kind. */
const RECORD_SERIALISERS: RegExp[] = [
  /\bto_jsonb?\s*\(/i,
  /\brow_to_json\s*\(/i,
  /\bjsonb?_populate_record\w*\s*\(/i,
  /\bjsonb?_object_agg\s*\(/i,
  /\bjsonb?_agg\s*\(\s*[a-z_]+\s*(\)|ORDER\b)/i,
  /\bjson_agg\s*\(/i,
  /\bhstore\s*\(/i,
  /\bROW\s*\(/i,
  /\b[a-z_]+\.\*/i,
]

/** Columns / keys that must never reach anon output. */
const PII_WORDS = ['email', 'phone', 'password_hash', 'auth_user_id', 'notes', 'id_number', 'documents', 'dataUrl'] as const
const FORBIDDEN_KEYS = [...PII_WORDS, 'metadata', 'settings', 'agent_id', 'landlord_id', 'tenant_id', 'lease_id'] as const

/**
 * The leak rules every anon-reachable body must pass (RPCs, unit_json and
 * both internal helpers). Returns the problems found, [] when clean.
 */
function leakProblems(name: string, rawBody: string): string[] {
  const body = stripComments(rawBody)
  const problems: string[] = []
  for (const re of RECORD_SERIALISERS) if (re.test(body)) problems.push(`${name}: record serialiser ${re}`)
  for (const key of objectKeys(body)) {
    if ((FORBIDDEN_KEYS as readonly string[]).includes(key)) problems.push(`${name}: output key ${key}`)
  }
  for (const word of PII_WORDS) if (body.includes(word)) problems.push(`${name}: mentions ${word}`)
  // metadata only for the landlord verification flag.
  for (const m of body.match(/[\w.]*metadata[^\s,)]*/g) ?? []) {
    if (m !== "ll.metadata->'verification'->>'status'") problems.push(`${name}: metadata use ${m}`)
  }
  // settings only for the agency frontend id and the global-config filter.
  for (const m of body.match(/[\w.]*settings[^,\n)]*/g) ?? []) {
    if (!/^(c\.)?settings->>'(frontend_id|isGlobalConfigClient)'/.test(m)) problems.push(`${name}: settings use ${m}`)
  }
  // agent_id only as the display-name helper's argument (or its parameter).
  for (const m of body.matchAll(/[\w.(]*agent_id\b/g)) {
    if (!['public_listing_agent_name(u.agent_id', 'public_listing_agent_name(p_agent_id', 'p_agent_id'].includes(m[0])) {
      problems.push(`${name}: agent_id use ${m[0]}`)
    }
  }
  return problems
}

const LEAK_CHECKED = [
  ...RPCS,
  'public_listing_unit_json',
  'public_listing_landlord_ok',
  'public_listing_agent_name',
] as const

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
      // Full: no extra keys. Lite only overrides 'images' with one cover image.
      expect(lineKeys(units)).toEqual(lite ? ['images'] : [])
    })

    it(`${fn}: no whole-row serialisation and no PII / internal columns`, () => {
      expect(leakProblems(fn, body)).toEqual([])
      // landlord_id is only passed to the verification gate, never selected.
      expect(stripComments(body).match(/landlord_id/g)).toEqual(['landlord_id'])
      expect(body).toContain('public_listing_landlord_ok(b.landlord_id)')
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

describe('027 leak rules cover unit_json and the helpers (Angela: hole in :43 / :86-100)', () => {
  for (const name of LEAK_CHECKED) {
    it(`${name}: no record serialisers, PII words or forbidden keys`, () => {
      expect(leakProblems(name, fnBody(name))).toEqual([])
    })
  }

  it('the checker catches a same-line extra key and row_to_json(users) inside unit_json', () => {
    const body = fnBody('public_listing_unit_json')
    const sameLinePhone = body.replace("'id', u.id,", "'id', u.id, 'phone', u.id,")
    expect(sameLinePhone).not.toBe(body)
    expect(lineKeys(sameLinePhone)).toContain('phone')
    expect(leakProblems('mutant', sameLinePhone)).toContain('mutant: output key phone')
    const wholeRow = body.replace(
      "'id', u.id,",
      "'id', u.id, 'owner', (SELECT row_to_json(x) FROM users x LIMIT 1),",
    )
    expect(leakProblems('mutant', wholeRow).some((p) => p.includes('row_to_json'))).toBe(true)
  })

  it('a non-literal (computed) key fails extraction', () => {
    expect(() => objectKeys("jsonb_build_object('id', u.id, u.key_col, u.val)")).toThrow()
  })
})

describe('027 public_listing_unit_json', () => {
  const body = fnBody('public_listing_unit_json')

  it('has exactly the public unit keys, incl. listed_by (no agent_id key)', () => {
    expect(objectKeys(body)).toEqual([...PUBLIC_UNIT_KEYS])
    expect(objectKeys(body)).toContain('listed_by')
    expect(objectKeys(body)).not.toContain('agent_id')
    // agent_id is read only as the display-name helper's argument.
    expect(stripComments(body).match(/agent_id/g)).toEqual(['agent_id'])
    expect(body).toContain("'listed_by', public_listing_agent_name(u.agent_id),")
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

  it('listed_by helper returns the display name only (first + last, trimmed) and is not callable', () => {
    const helper = stripComments(fnBody('public_listing_agent_name'))
    expect(helper).toMatch(/SECURITY INVOKER/)
    expect(helper).toMatch(/RETURNS text/)
    expect(helper.replace(/\s+/g, ' ')).toContain(
      "SELECT nullif(trim(coalesce(a.first_name, '') || ' ' || coalesce(a.last_name, '')), '') FROM users a WHERE a.id = p_agent_id;",
    )
    expect(MIGRATION).toContain('REVOKE ALL ON FUNCTION public_listing_agent_name(UUID) FROM PUBLIC, anon, authenticated;')
    expect(MIGRATION).not.toMatch(/GRANT[^;]*public_listing_agent_name/i)
  })
})

describe('027 024 DEFINER helpers are not anon-callable (Michael c)', () => {
  const block = MIGRATION.slice(MIGRATION.indexOf('-- BEGIN 027-public-bodies'))
  const GATE = 'listing_capacity_gate(UUID, TEXT, BOOLEAN, TEXT, TEXT, TEXT)'
  const SNAP = 'unit_listing_limit_snapshot(UUID)'
  const lastBody = block.lastIndexOf('$$;')

  it('revokes both from PUBLIC, anon and authenticated after every body', () => {
    for (const fn of [GATE, SNAP]) {
      const at = block.indexOf(`REVOKE ALL ON FUNCTION ${fn} FROM PUBLIC, anon, authenticated;`)
      expect(at, fn).toBeGreaterThan(lastBody)
    }
  })

  it('grants the snapshot back to authenticated only (staff ListingLimitsPanel); never the gate', () => {
    const grant = block.indexOf(`GRANT EXECUTE ON FUNCTION ${SNAP} TO authenticated;`)
    expect(grant).toBeGreaterThan(block.indexOf(`REVOKE ALL ON FUNCTION ${SNAP}`))
    expect(MIGRATION).not.toMatch(/GRANT[^;]*unit_listing_limit_snapshot[^;]*anon/i)
    const after = block.slice(block.indexOf(`REVOKE ALL ON FUNCTION ${GATE}`))
    expect(after).not.toMatch(/GRANT[^;]*listing_capacity_gate/i)
  })
})

describe('027 viewing_waitlist RLS: own-agency staff only (fix.sql a2)', () => {
  for (const name of ['viewing_waitlist_select', 'viewing_waitlist_mutate']) {
    it(`${name} has no landlord / tenant / contractor clause`, () => {
      const start = MIGRATION.indexOf(`CREATE POLICY ${name} ON viewing_waitlist`)
      expect(start).toBeGreaterThan(MIGRATION.indexOf('-- BEGIN 027-public-bodies'))
      expect(MIGRATION.slice(start - 200, start)).toContain(`DROP POLICY IF EXISTS ${name} ON viewing_waitlist;`)
      const policy = MIGRATION.slice(start, MIGRATION.indexOf(';', start))
      expect(policy).toContain('TO authenticated')
      expect(policy).toContain("current_app_user_role() IN ('AGENCY_ADMIN', 'AGENT_ADMIN', 'GROUND_AGENT')")
      expect(policy).toContain('client_id = current_app_client_id()')
      expect(policy).not.toMatch(/LANDLORD|END_USER|CONTRACTOR|TENANT/)
      if (name.endsWith('_mutate')) expect(policy).toContain('WITH CHECK')
    })
  }
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

  it('rejects NOT_LISTED units with property_not_public, whatever the status or flag', () => {
    const flat = body.replace(/\s+/g, ' ')
    expect(flat).toContain("IF lower(coalesce(v_listing_type, 'rent')) = 'not_listed' THEN RAISE EXCEPTION 'property_not_public'; END IF;")
    expect(body.indexOf("= 'not_listed'")).toBeLessThan(body.indexOf('IF NOT COALESCE(v_occupied, false)'))
  })

  it('tags the lead for staff and returns available_from (same text as server/publicEnquiry.ts)', () => {
    const flat = body.replace(/\s+/g, ' ')
    expect(flat).toContain(
      "v_extra_notes := 'Interested, available from ' || to_char(v_available, 'FMDD Mon YYYY') || coalesce(E'\\n' || v_extra_notes, '');",
    )
    expect(flat).toContain("'available_from', CASE WHEN COALESCE(v_occupied, false) THEN v_available END")
    const ret = body.slice(body.lastIndexOf('RETURN jsonb_build_object('))
    expect(objectKeys(ret)).toEqual(['ok', 'lead_id', 'booking_id', 'stage', 'available_from'])
  })

  it('24h notice compares a real Africa/Johannesburg timestamptz with now() (Michael d)', () => {
    const flat = body.replace(/\s+/g, ' ')
    expect(flat).toContain(
      "v_starts_at := (v_slot_date::text || ' ' || left(v_slot_time, 5) || ':00')::timestamp AT TIME ZONE 'Africa/Johannesburg';",
    )
    expect(body).not.toMatch(/\|\| ':00'\)::timestamptz/)
    expect(body).toMatch(/IF v_starts_at < NOW\(\) \+ make_interval\(hours => v_notice_hours\)/)
    for (const fn of RPCS) {
      expect(fnBody(fn)).toContain("vs.slot_date >= (now() AT TIME ZONE 'Africa/Johannesburg')::date")
      expect(fnBody(fn)).not.toContain('CURRENT_DATE')
    }
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
      'CREATE POLICY viewing_waitlist_select',
      'CREATE POLICY viewing_waitlist_mutate',
      'FUNCTION public_listing_agent_name(',
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
