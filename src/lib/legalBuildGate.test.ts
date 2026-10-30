import { afterEach, describe, expect, it, vi } from 'vitest'
import { LEGAL_REQUIRED_FIELDS, legalEntityComplete, legalEntityMissing } from './legalEntity'
import { legalBuildGate } from './legalBuildGate'

// Test-only fixture. These are NOT Lekaya's real details; Samuel supplies those.
const FULL = {
  brand: 'Lekaya Rentals',
  legalName: 'Test Fixture (Pty) Ltd',
  registrationNumber: '0000/000000/00',
  address: '1 Test Street, Testville',
  informationOfficer: 'Test Officer',
  privacyEmail: 'privacy@example.test',
  supportEmail: 'support@example.test',
  effectiveDate: '2026-10-30',
  website: 'https://example.test',
}
const BLANK = { ...FULL, legalName: '', registrationNumber: '', address: '', informationOfficer: '', privacyEmail: '', supportEmail: '' }

describe('T6 legal completeness check', () => {
  it('requires supportEmail (shown on /terms) as well as the five original fields', () => {
    expect([...LEGAL_REQUIRED_FIELDS].sort()).toEqual(
      ['address', 'informationOfficer', 'legalName', 'privacyEmail', 'registrationNumber', 'supportEmail'].sort(),
    )
    expect(legalEntityComplete(FULL)).toBe(true)
    expect(legalEntityComplete({ ...FULL, supportEmail: '' })).toBe(false)
    expect(legalEntityMissing({ ...FULL, supportEmail: '  ' })).toEqual(['supportEmail'])
  })

  it('treats a placeholder value as missing, not as filled in', () => {
    for (const placeholder of ['TBC', 'tbd', 'TODO', '[company name to be confirmed]', '[Company name]', 'to be confirmed', 'placeholder', 'e.g. Lekaya Rentals (Pty) Ltd', 'XXX', 'N/A', 'n/a', 'NA', '-', '—', 'none', 'Pending', 'pending CIPC', 'not applicable']) {
      expect(legalEntityMissing({ ...FULL, legalName: placeholder }), placeholder).toEqual(['legalName'])
    }
  })

  it('treats an email field that is not an email address as missing', () => {
    expect(legalEntityMissing({ ...FULL, privacyEmail: 'privacy at lekaya' })).toEqual(['privacyEmail'])
    expect(legalEntityMissing({ ...FULL, supportEmail: 'support@' })).toEqual(['supportEmail'])
    // Angela #118 v2 (B14): a space anywhere in the address (not only at the ends) makes it invalid.
    expect(legalEntityMissing({ ...FULL, privacyEmail: 'priv acy@lekaya.test' })).toEqual(['privacyEmail'])
    expect(legalEntityMissing({ ...FULL, supportEmail: 'support@lekaya .test' })).toEqual(['supportEmail'])
    expect(legalEntityMissing({ ...FULL, supportEmail: 'sup port@lekaya.test' })).toEqual(['supportEmail'])
    // Angela #118 A07: an address needs a dot in its domain.
    expect(legalEntityMissing({ ...FULL, privacyEmail: 'privacy@lekaya' })).toEqual(['privacyEmail'])
  })

  it('lists every blank field in a stable order', () => {
    expect(legalEntityMissing(BLANK)).toEqual([...LEGAL_REQUIRED_FIELDS])
  })
})

describe('T6 legal build gate matrix (pure function, no build spawned)', () => {
  const live = { PF_LIVE_BUILD: '1' }

  it('incomplete + production + PF_LIVE_BUILD=1 fails the build', () => {
    expect(legalBuildGate({ mode: 'production', env: live, entity: BLANK }).action).toBe('fail')
  })

  it('incomplete + plain production build (every PR runs npm run build) only warns', () => {
    expect(legalBuildGate({ mode: 'production', env: {}, entity: BLANK }).action).toBe('warn')
  })

  it.each(['development', 'test', 'staging'])('incomplete + %s only warns, even with PF_LIVE_BUILD=1', (mode) => {
    expect(legalBuildGate({ mode, env: {}, entity: BLANK }).action).toBe('warn')
    expect(legalBuildGate({ mode, env: live, entity: BLANK }).action).toBe('warn')
  })

  it.each(['true', 'yes', '0', '', ' 1'])('PF_LIVE_BUILD=%j is not the live flag (only the exact string "1" is)', (flag) => {
    expect(legalBuildGate({ mode: 'production', env: { PF_LIVE_BUILD: flag }, entity: BLANK }).action).toBe('warn')
  })

  it('complete details pass in every mode, live or not', () => {
    for (const mode of ['production', 'development', 'test', 'staging']) {
      expect(legalBuildGate({ mode, env: live, entity: FULL }).action).toBe('pass')
      expect(legalBuildGate({ mode, env: {}, entity: FULL }).action).toBe('pass')
    }
  })

  it('a placeholder value still fails the live build', () => {
    expect(legalBuildGate({ mode: 'production', env: live, entity: { ...FULL, informationOfficer: 'TBC' } }).action).toBe('fail')
  })

  it('the failure and warning messages name each missing field', () => {
    const entity = { ...FULL, informationOfficer: '', supportEmail: '' }
    for (const env of [live, {}]) {
      const { message, missing } = legalBuildGate({ mode: 'production', env, entity })
      expect(missing).toEqual(['informationOfficer', 'supportEmail'])
      expect(message).toContain('informationOfficer')
      expect(message).toContain('supportEmail')
      expect(message).toContain('src/lib/legalEntity.ts')
      expect(message).not.toContain('legalName')
    }
  })
})

describe('T6 gate wiring in vite.config.ts', () => {
  const saved = process.env.PF_LIVE_BUILD
  afterEach(() => {
    if (saved === undefined) delete process.env.PF_LIVE_BUILD
    else process.env.PF_LIVE_BUILD = saved
    vi.restoreAllMocks()
    vi.doUnmock('./legalEntity')
    vi.doUnmock('vite')
    vi.resetModules()
  })

  async function loadConfig(entity: Record<string, string>, dotEnv?: Record<string, string>) {
    vi.resetModules()
    vi.doMock('./legalEntity', async (orig) => ({ ...(await orig<typeof import('./legalEntity')>()), LEGAL_ENTITY: entity }))
    if (dotEnv) {
      // Stand-in for .env / .env.production contents: what loadEnv would return from files.
      vi.doMock('vite', async (orig) => ({ ...(await orig<typeof import('vite')>()), loadEnv: () => ({ ...dotEnv }) }))
    } else {
      vi.doUnmock('vite')
    }
    const mod = await import('../../vite.config')
    return mod.default as unknown as (env: { mode: string; command: 'build' | 'serve' }) => unknown
  }

  it('Angela #118 A09: PF_LIVE_BUILD=1 in a .env file (loadEnv) does not make a live build', async () => {
    delete process.env.PF_LIVE_BUILD
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const config = await loadConfig(BLANK, { PF_LIVE_BUILD: '1' })
    expect(() => config({ mode: 'production', command: 'build' })).not.toThrow()
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('PF_LIVE_BUILD is not "1"'))
  })

  it('a live production build with blank details throws, naming the fields', async () => {
    process.env.PF_LIVE_BUILD = '1'
    const config = await loadConfig(BLANK)
    expect(() => config({ mode: 'production', command: 'build' })).toThrow(/legalName.*supportEmail/s)
  })

  it('a plain production build with blank details warns and still returns a config', async () => {
    delete process.env.PF_LIVE_BUILD
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const config = await loadConfig(BLANK)
    expect(config({ mode: 'production', command: 'build' })).toBeTruthy()
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('supportEmail'))
  })

  it('a live production build with complete details neither throws nor warns', async () => {
    process.env.PF_LIVE_BUILD = '1'
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const config = await loadConfig(FULL)
    expect(config({ mode: 'production', command: 'build' })).toBeTruthy()
    expect(warn).not.toHaveBeenCalledWith(expect.stringContaining('legal'))
  })
})

describe('T6 (Jim #118 C8): the warning says why the build is not live, accurately', () => {
  it('development with PF_LIVE_BUILD=1 does not claim the flag is unset', () => {
    const { action, message } = legalBuildGate({ mode: 'development', env: { PF_LIVE_BUILD: '1' }, entity: {} })
    expect(action).toBe('warn')
    expect(message).not.toContain('PF_LIVE_BUILD!=1')
    expect(message).toContain('mode is "development", not production')
    expect(message).toContain('PF_LIVE_BUILD=1 only stops a production build')
  })

  it('production without the flag says the flag is not 1', () => {
    const { action, message } = legalBuildGate({ mode: 'production', env: {}, entity: {} })
    expect(action).toBe('warn')
    expect(message).toContain('PF_LIVE_BUILD is not "1"')
    expect(message).not.toContain('not production')
  })

  it('staging without the flag names only the mode', () => {
    const { message } = legalBuildGate({ mode: 'staging', env: {}, entity: {} })
    expect(message).toContain('mode is "staging", not production')
    expect(message).not.toContain('PF_LIVE_BUILD=1 only stops')
  })
})

describe('T6 (Jim #118 C10): a sole proprietor can complete the details', () => {
  it('registrationNumber "not applicable" passes legalEntityComplete when every other field is filled', () => {
    for (const value of ['not applicable', 'Not applicable']) {
      expect(legalEntityMissing({ ...FULL, registrationNumber: value }), value).toEqual([])
      expect(legalEntityComplete({ ...FULL, registrationNumber: value }), value).toBe(true)
    }
    expect(legalEntityComplete({ ...FULL, registrationNumber: 'not applicable', supportEmail: '' })).toBe(false)
  })
})

describe('Angela #118 C4/C5: N/A and the live gate; "not applicable" only for registrationNumber', () => {
  it('N/A, -, none and pending stop a live build in any required field', () => {
    for (const field of LEGAL_REQUIRED_FIELDS) {
      for (const value of ['N/A', '-', 'none', 'pending']) {
        const r = legalBuildGate({ mode: 'production', env: { PF_LIVE_BUILD: '1' }, entity: { ...FULL, [field]: value } })
        expect(r.action, `${field}=${value}`).toBe('fail')
        expect(r.missing, `${field}=${value}`).toEqual([field])
      }
    }
  })

  it('"not applicable" is accepted for registrationNumber only; "N/A" is not', () => {
    expect(legalEntityMissing({ ...FULL, registrationNumber: 'not applicable' })).toEqual([])
    expect(legalEntityMissing({ ...FULL, registrationNumber: 'N/A' })).toEqual(['registrationNumber'])
    expect(legalEntityMissing({ ...FULL, informationOfficer: 'not applicable' })).toEqual(['informationOfficer'])
  })
})

