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
    for (const placeholder of ['TBC', 'tbd', 'TODO', '[company name to be confirmed]', 'to be confirmed', 'placeholder', 'e.g. Lekaya Rentals (Pty) Ltd', 'XXX']) {
      expect(legalEntityMissing({ ...FULL, legalName: placeholder }), placeholder).toEqual(['legalName'])
    }
  })

  it('treats an email field that is not an email address as missing', () => {
    expect(legalEntityMissing({ ...FULL, privacyEmail: 'privacy at lekaya' })).toEqual(['privacyEmail'])
    expect(legalEntityMissing({ ...FULL, supportEmail: 'support@' })).toEqual(['supportEmail'])
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
    vi.resetModules()
  })

  async function loadConfig(entity: Record<string, string>) {
    vi.resetModules()
    vi.doMock('./legalEntity', async (orig) => ({ ...(await orig<typeof import('./legalEntity')>()), LEGAL_ENTITY: entity }))
    const mod = await import('../../vite.config')
    return mod.default as unknown as (env: { mode: string; command: 'build' | 'serve' }) => unknown
  }

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
