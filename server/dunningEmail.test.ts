/**
 * DQ-M4 Mode A: optional Mailtrap dunning email behind ENABLE_EMAIL_DUNNING (default OFF).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ENV_SNAPSHOT = { ...process.env }

describe('isEmailDunningEnabled / sendDunningNoticeEmail', () => {
  beforeEach(() => {
    vi.resetModules()
    for (const k of Object.keys(process.env)) {
      if (!(k in ENV_SNAPSHOT)) delete process.env[k]
    }
    Object.assign(process.env, ENV_SNAPSHOT)
    delete process.env.ENABLE_EMAIL_DUNNING
    delete process.env.DUNNING_EMAIL_ENABLED
    delete process.env.MAILTRAP_API_KEY
    delete process.env.MAILTRAP_SMTP_USER
    delete process.env.MAILTRAP_SMTP_PASS
    delete process.env.MAILTRAP_TRANSPORT
  })

  afterEach(() => {
    for (const k of Object.keys(process.env)) {
      if (!(k in ENV_SNAPSHOT)) delete process.env[k]
    }
    Object.assign(process.env, ENV_SNAPSHOT)
    vi.resetModules()
  })

  it('defaults OFF when unset → no mail (sent:false)', async () => {
    const { isEmailDunningEnabled, sendDunningNoticeEmail } = await import('./mailtrap.js')
    expect(isEmailDunningEnabled()).toBe(false)
    const result = await sendDunningNoticeEmail({
      email: 'tenant@example.com',
      tenantName: 'Thandi',
      title: 'Rent notice · First reminder (Day +3)',
      body: 'Non-production Mode A notice body',
      stage: 'reminder_1',
    })
    expect(result.sent).toBe(false)
    if (!result.sent) {
      expect(result.reason).toMatch(/ENABLE_EMAIL_DUNNING off/i)
    }
  })

  it('defaults OFF when false/0 → no mail', async () => {
    process.env.ENABLE_EMAIL_DUNNING = 'false'
    const { isEmailDunningEnabled, sendDunningNoticeEmail } = await import('./mailtrap.js')
    expect(isEmailDunningEnabled()).toBe(false)
    const result = await sendDunningNoticeEmail({
      email: 'tenant@example.com',
      title: 'Rent notice',
      body: 'body',
      stage: 'reminder_1',
    })
    expect(result.sent).toBe(false)
  })

  it('ON + Mailtrap unconfigured → no-op sent:false (not throw)', async () => {
    process.env.ENABLE_EMAIL_DUNNING = 'true'
    const { isEmailDunningEnabled, sendDunningNoticeEmail, isMailtrapConfigured } =
      await import('./mailtrap.js')
    expect(isEmailDunningEnabled()).toBe(true)
    expect(isMailtrapConfigured()).toBe(false)
    const result = await sendDunningNoticeEmail({
      email: 'tenant@example.com',
      title: 'Rent notice · Final notice (Day +14)',
      body: 'Mode A dunning body',
      stage: 'final',
      propertyTitle: 'Humewood B12',
      amountDisplay: 'R12,500',
      dueDate: '2026-09-01',
    })
    expect(result.sent).toBe(false)
    if (!result.sent) {
      expect(result.reason).toMatch(/MAILTRAP|not set/i)
    }
  })

  it('accepts DUNNING_EMAIL_ENABLED alias', async () => {
    process.env.DUNNING_EMAIL_ENABLED = 'on'
    const { isEmailDunningEnabled } = await import('./mailtrap.js')
    expect(isEmailDunningEnabled()).toBe(true)
  })

  it('source has no Twilio / WhatsApp / SMS carrier strings', () => {
    const here = dirname(fileURLToPath(import.meta.url))
    const mailtrapSrc = readFileSync(join(here, 'mailtrap.ts'), 'utf8')
    // Only the honesty disclaimer may mention WhatsApp/SMS; never Twilio SDK/API
    expect(mailtrapSrc).not.toMatch(/twilio/i)
    expect(mailtrapSrc).not.toMatch(/from ['"]twilio['"]/)
    // Category must be rent-dunning
    expect(mailtrapSrc).toMatch(/rent-dunning/)
    expect(mailtrapSrc).toMatch(/sendDunningNoticeEmail/)
    expect(mailtrapSrc).toMatch(/ENABLE_EMAIL_DUNNING/)
  })
})
