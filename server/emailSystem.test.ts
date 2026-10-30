import { beforeEach, describe, expect, it, vi } from 'vitest'

const queries: Array<{ sql: string; params: unknown[] }> = []
let handler: (sql: string, params: unknown[]) => unknown[] = () => []
vi.mock('./db.js', () => ({
  query: async (sql: string, params: unknown[] = []) => {
    queries.push({ sql, params })
    return handler(sql, params)
  },
}))

beforeEach(() => {
  queries.length = 0
  handler = () => []
  for (const k of ['EMAIL_PROVIDER', 'BREVO_API_KEY', 'SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'MAILTRAP_API_KEY', 'MAILTRAP_SMTP_USER', 'MAILTRAP_SMTP_PASS', 'EMAIL_FROM']) delete process.env[k]
  vi.unstubAllGlobals()
})

describe('email templates', () => {
  it('render every catalog template in the branded layout; only staff-set temp passwords are ever emailed', async () => {
    const { TEMPLATE_CATALOG, renderTemplate } = await import('./email/templates.js')
    // A new account and a staff reset email the temporary password (it must be
    // changed at the next sign-in); no other template may carry a password,
    // and no subject line ever does (subjects are what the email log keeps).
    const CARRY_TEMP = new Set(['account_setup', 'password_reset_by_staff'])
    for (const t of TEMPLATE_CATALOG) {
      const r = renderTemplate(t.id, t.sample as never)
      expect(r.subject.length, t.id).toBeGreaterThan(3)
      expect(r.html, t.id).toContain('lekaya-logo-1024.png')
      expect(r.html, t.id).toContain('no-reply')
      expect(r.text.length, t.id).toBeGreaterThan(10)
      const temp = (t.sample as { tempPassword?: string }).tempPassword
      if (CARRY_TEMP.has(t.id)) {
        expect(temp, t.id).toBeTruthy()
        expect(r.html, t.id).toContain(temp)
        expect(r.subject, t.id).not.toContain(temp)
      } else {
        expect(temp, t.id).toBeUndefined()
        expect(r.html, t.id).not.toMatch(/temporary password|your password is/i)
      }
    }
  })

  it('escapes notification text', async () => {
    const { renderTemplate } = await import('./email/templates.js')
    const r = renderTemplate('notification', { to: 'a@b.co', title: 'Hi', body: '<script>x</script>' })
    expect(r.html).not.toContain('<script>x')
    expect(r.html).toContain('&lt;script&gt;')
  })

  it('makes links absolute', async () => {
    const { renderTemplate } = await import('./email/templates.js')
    const r = renderTemplate('password_reset', { to: 'a@b.co', link: '/reset-password?token=abc' })
    expect(r.html).toContain('https://lekayarentals.site/reset-password?token=abc')
    expect(r.text).toContain('https://lekayarentals.site/reset-password?token=abc')
  })
})

describe('deliverEmail', () => {
  it('records but does not send when no provider is set', async () => {
    const { deliverEmail, emailProvider } = await import('./email/send.js')
    expect(emailProvider()).toBe('log')
    const r = await deliverEmail({ to: 'person@example.com', subject: 'S', text: 'T', category: 'test' })
    expect(r.sent).toBe(false)
    expect(queries.some((q) => q.sql.includes('INSERT INTO email_log') && q.params.includes('logged'))).toBe(true)
  })

  it('sends through the Brevo API with the no-reply sender', async () => {
    process.env.BREVO_API_KEY = 'xkeysib-test'
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ messageId: 'm-1' }), { status: 201 }))
    vi.stubGlobal('fetch', fetchMock)
    const { deliverEmail } = await import('./email/send.js')
    const r = await deliverEmail({ to: 'person@example.com', subject: 'Hello', text: 'T', html: '<p>T</p>', category: 'welcome' })
    expect(r).toEqual({ sent: true, messageId: 'm-1' })
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.brevo.com/v3/smtp/email')
    expect((init.headers as Record<string, string>)['api-key']).toBe('xkeysib-test')
    const body = JSON.parse(String(init.body))
    expect(body.sender).toEqual({ email: 'info@lekayarentals.site', name: 'Lekaya Rentals' })
    expect(body.tags).toEqual(['welcome'])
  })

  it('captures instead of sending inside captureEmails', async () => {
    const { captureEmails, deliverEmail } = await import('./email/send.js')
    const mails = await captureEmails(() => deliverEmail({ to: 'x@y.co', subject: 'S', text: 'T' }))
    expect(mails).toHaveLength(1)
    expect(queries).toHaveLength(0)
  })
})

describe('notification categories', () => {
  it('maps resources to topics', async () => {
    const { categoryForResource, showsInApp } = await import('../src/lib/notificationCategories.js')
    expect(categoryForResource('application')).toBe('applications')
    expect(categoryForResource('payment')).toBe('payments')
    expect(categoryForResource('ticket')).toBe('maintenance')
    expect(categoryForResource(null)).toBe('other')
    expect(showsInApp({ inApp: true, email: true, muted: ['payments'] }, 'payment')).toBe(false)
    expect(showsInApp({ inApp: false, email: true, muted: [] }, 'application')).toBe(false)
    expect(showsInApp({ inApp: true, email: true, muted: [] }, 'application')).toBe(true)
  })
})

describe('one-time links', () => {
  it('store only a hash and work once', async () => {
    const tokens: Array<{ hash: string; used: boolean }> = []
    handler = (sql, params) => {
      if (sql.startsWith('INSERT INTO auth_tokens')) tokens.push({ hash: String(params[2]), used: false })
      if (sql.startsWith('UPDATE auth_tokens SET used_at = NOW()\n      WHERE token_hash')) {
        const t = tokens.find((x) => x.hash === params[0] && !x.used)
        if (!t) return []
        t.used = true
        return [{ user_id: 'u-1', purpose: 'reset_password' }]
      }
      return []
    }
    const { issueToken, consumeToken } = await import('./accountEmails.js')
    const raw = await issueToken('11111111-1111-1111-1111-111111111111', 'reset_password')
    expect(tokens[0]!.hash).not.toBe(raw)
    expect(tokens[0]!.hash).toMatch(/^[0-9a-f]{64}$/)
    await expect(consumeToken(raw, ['reset_password'])).resolves.toEqual({ userId: 'u-1', purpose: 'reset_password' })
    await expect(consumeToken(raw, ['reset_password'])).rejects.toMatchObject({ status: 400 })
  })
})

describe('notification mailer', () => {
  it('emails one notification, sends a summary for several, and respects switched-off settings', async () => {
    process.env.BREVO_API_KEY = 'xkeysib-test'
    const sent: Array<{ subject: string; to: string }> = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_u: string, init: RequestInit) => {
        const b = JSON.parse(String(init.body))
        sent.push({ subject: b.subject, to: b.to[0].email })
        return new Response(JSON.stringify({ messageId: 'x' }), { status: 201 })
      }),
    )
    const marked: Array<{ ids: string[]; status: string }> = []
    handler = (sql, params) => {
      if (sql.includes('information_schema.columns')) return [{ n: '1' }]
      if (sql.includes('FROM notifications n JOIN users u')) {
        return [
          { id: 'n1', user_id: 'a', title: 'One', body: 'b', link_path: null, resource_type: 'application', email: 'a@x.co', first_name: 'A', active: true, metadata: {} },
          { id: 'n2', user_id: 'b', title: 'Two', body: 'b', link_path: null, resource_type: 'payment', email: 'b@x.co', first_name: 'B', active: true, metadata: {} },
          { id: 'n3', user_id: 'b', title: 'Three', body: 'b', link_path: null, resource_type: 'ticket', email: 'b@x.co', first_name: 'B', active: true, metadata: {} },
          { id: 'n4', user_id: 'c', title: 'Four', body: 'b', link_path: null, resource_type: 'payment', email: 'c@x.co', first_name: 'C', active: true, metadata: { notificationPrefs: { email: false } } },
          { id: 'n5', user_id: 'd', title: 'Five', body: 'b', link_path: null, resource_type: 'payment', email: 'd@x.co', first_name: 'D', active: true, metadata: { notificationPrefs: { muted: ['payments'] } } },
        ]
      }
      if (sql.startsWith('UPDATE notifications SET emailed_at = NOW(), email_status = $2')) marked.push({ ids: params[0] as string[], status: String(params[1]) })
      return []
    }
    const { emailPendingNotifications } = await import('./notificationMailer.js')
    const r = await emailPendingNotifications()
    expect(r).toEqual({ sent: 3, skipped: 2, failed: 0 })
    expect(sent.map((s) => s.to).sort()).toEqual(['a@x.co', 'b@x.co'])
    expect(sent.find((s) => s.to === 'b@x.co')!.subject).toMatch(/2 new updates/)
    expect(marked.filter((m) => m.status === 'off').flatMap((m) => m.ids).sort()).toEqual(['n4', 'n5'])
  })
})
