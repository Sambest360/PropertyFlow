import { afterEach, describe, expect, it, vi } from 'vitest'

describe('sendLeaseSignedEmail (CR10 part 8)', () => {
  afterEach(() => {
    delete process.env.ENABLE_EMAIL_LEASE_SIGNED
    vi.resetModules()
  })
  it('is off by default', async () => {
    delete process.env.ENABLE_EMAIL_LEASE_SIGNED
    const { isEmailLeaseSignedEnabled, sendLeaseSignedEmail } = await import('./mailtrap.js')
    expect(isEmailLeaseSignedEnabled()).toBe(false)
    const r = await sendLeaseSignedEmail({ to: 't@x.test', propertyTitle: 'P', leaseLink: '/x' })
    expect(r).toEqual({ sent: false, reason: 'ENABLE_EMAIL_LEASE_SIGNED off (default)' })
  })
  it('copy is plain, with no legal claims', async () => {
    const { readFileSync } = await import('node:fs')
    const src = readFileSync('server/mailtrap.ts', 'utf8')
    expect(src).toContain('has been signed by all parties. You can view it in PropertyFlow:')
    expect(src).toContain("'Your lease has been signed'")
  })
  it('CR10 N8: name, property title and link are HTML-escaped', async () => {
    const { escapeHtml } = await import('./mailtrap.js')
    expect(escapeHtml('<b>"Tom" & \'Co\'</b>')).toBe('&lt;b&gt;&quot;Tom&quot; &amp; &#39;Co&#39;&lt;/b&gt;')
    const src = (await import('node:fs')).readFileSync('server/mailtrap.ts', 'utf8')
    expect(src).toContain('escapeHtml(input.name)')
    expect(src).toContain('escapeHtml(input.propertyTitle)')
  })
})
