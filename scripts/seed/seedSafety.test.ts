import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { findSeedSafetyViolations, scanSeedFiles, seedSafetyFiles } from './seedSafety.ts'

describe('seed file safety', () => {
  it('fails when a seed file has a non-example.test email or a hard-coded password', () => {
    const sample = [
      "email: 'person@gmail.com'",
      "password: 'secret'",
      "const demoPassword = process.env.SEED_DEMO_PASSWORD ?? 'secret'",
      "crypt('LocalDev-Password-1', gen_salt('bf', 10))",
      "'$2b$10$JX.s61pusUiz2t3Qd74Bge4x0lcrELBAHU4SczXEKjsMaFX2sC3o6'",
    ].join('\n')
    const hits = findSeedSafetyViolations('sample.sql', sample)
    expect(hits.map((hit) => hit.detail).join('\n')).toMatch(/gmail\.com/)
    expect(hits.map((hit) => hit.detail).join('\n')).toMatch(/hard-coded password/)
    expect(hits.map((hit) => hit.detail).join('\n')).toMatch(/password fallback/)
    expect(hits.map((hit) => hit.detail).join('\n')).toMatch(/crypt\(\)/)
    expect(hits.map((hit) => hit.detail).join('\n')).toMatch(/bcrypt/)
  })

  it('allows @example.test addresses and blank password placeholders', () => {
    const sample = [
      "email: 'sam.platform@example.test'",
      'password_hash = NULL',
      "encrypted_password = ''",
      'const demoPassword = resolveSeedPassword()',
    ].join('\n')
    expect(findSeedSafetyViolations('sample.sql', sample)).toEqual([])
  })

  it('scans the repo seed files', () => {
    const files = seedSafetyFiles()
    expect(files).toContain('database/postgres/seed.sql')
    expect(files).toContain('supabase/seed.sql')
    expect(files).toContain('scripts/seed/helpers.ts')
    expect(files).toContain('scripts/create-super-admin.ts')
    expect(files).toContain('database/fixtures/localDevSeed.ts')
    expect(files.some((file) => file.endsWith('.test.ts'))).toBe(false)
    expect(scanSeedFiles()).toEqual([])
  })

  it('does not disable TLS verification in seed helpers', () => {
    const helpers = readFileSync('scripts/seed/helpers.ts', 'utf8')
    expect(helpers).not.toMatch(/rejectUnauthorized:\s*false/)
  })
})
