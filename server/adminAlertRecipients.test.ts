import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Admin emails (notices to super admins) go once to each admin alert address,
 * not to every super admin; other people's notices are unchanged; an empty
 * list falls back to every super admin.
 */
type Row = Record<string, unknown>
let pending: Row[] = []
let alertList: string[] | null = []
const marked: Array<{ ids: string[]; status: string }> = []

vi.mock('./db.js', () => ({
  query: vi.fn(async (sql: string, params?: unknown[]) => {
    if (sql.includes('FROM platform_settings')) return alertList ? [{ value: { emails: alertList } }] : []
    if (sql.includes('FROM notifications n JOIN users u')) return pending
    if (sql.includes('UPDATE notifications SET emailed_at = NOW(), email_status = $2')) {
      marked.push({ ids: params?.[0] as string[], status: params?.[1] as string })
      return []
    }
    if (sql.includes('lower(email) = ANY')) return [{ id: 'uuid-sam', email: 'sambampo200@gmail.com', first_name: 'Samuel' }]
    return []
  }),
}))
const sent: Array<{ id: string; to: string; name?: string; items?: unknown[]; title?: string }> = []
vi.mock('./email/templates.js', () => ({
  sendTemplateEmail: vi.fn(async (id: string, data: Row) => {
    sent.push({ id, to: String(data.to), name: data.name as string, items: data.items as unknown[], title: data.title as string })
    return { sent: true }
  }),
}))
vi.mock('./email/propertyContext.js', () => ({
  audienceForRole: () => 'staff',
  propertyCardForUnit: async () => null,
  resolvePropertyRef: async () => null,
}))
vi.mock('./email/actions.js', () => ({ emailActionFor: () => ({ label: 'Open', href: '/x' }) }))

const notice = (id: string, user: string, role: string, title: string, extra: Row = {}): Row => ({
  id,
  user_id: user,
  title,
  body: `${title} body`,
  link_path: '/workspace/admin/listing-approvals',
  resource_type: 'property',
  action_type: 'created',
  role,
  email: `${user}@example.com`,
  first_name: user,
  active: true,
  metadata: {},
  ...extra,
})

beforeEach(() => {
  pending = []
  alertList = ['sambampo200@gmail.com', 'samuel@lekayarentals.site']
  marked.length = 0
  sent.length = 0
})

describe('sanitizeAdminAlertEmails', () => {
  it('keeps valid, unique, lower-cased addresses (max 10)', async () => {
    const { sanitizeAdminAlertEmails } = await import('./adminAlertRecipients.js')
    expect(sanitizeAdminAlertEmails([' Sam@Example.com ', 'sam@example.com', 'not-an-email', 7])).toEqual(['sam@example.com'])
    expect(sanitizeAdminAlertEmails(Array.from({ length: 15 }, (_, i) => `a${i}@x.co`))).toHaveLength(10)
  })
})

describe('emailing notices meant for super admins', () => {
  it('sends a notice that went to three super admins once to each admin alert address', async () => {
    pending = [
      notice('n1', 'admin1', 'SUPER_ADMIN', 'Listing waiting for approval'),
      notice('n2', 'admin2', 'SUPER_ADMIN', 'Listing waiting for approval'),
      notice('n3', 'admin3', 'END_USER', 'Listing waiting for approval', { metadata: { frontend_role: 'super_admin' } }),
    ]
    const { emailPendingNotifications } = await import('./notificationMailer.js')
    const r = await emailPendingNotifications()
    expect(sent.map((s) => s.to).sort()).toEqual(['sambampo200@gmail.com', 'samuel@lekayarentals.site'])
    expect(sent.every((s) => s.id === 'notification' && s.title === 'Listing waiting for approval')).toBe(true)
    // Greeted by the account's name where the address has one.
    expect(sent.find((s) => s.to === 'sambampo200@gmail.com')?.name).toBe('Samuel')
    expect(sent.some((s) => s.to.startsWith('admin'))).toBe(false)
    expect(r.sent).toBe(3)
    expect(marked).toContainEqual({ ids: ['n1', 'n2', 'n3'], status: 'sent' })
  })

  it('sends several different admin notices as one summary per address', async () => {
    pending = [notice('n1', 'admin1', 'SUPER_ADMIN', 'New sign-up: Thandi'), notice('n2', 'admin1', 'SUPER_ADMIN', 'Escalation: leak')]
    const { emailPendingNotifications } = await import('./notificationMailer.js')
    await emailPendingNotifications()
    expect(sent).toHaveLength(2)
    expect(sent.every((s) => s.id === 'notification_digest' && s.items?.length === 2)).toBe(true)
  })

  it("leaves everyone else's notices as they were", async () => {
    pending = [notice('n1', 'tenant1', 'END_USER', 'Your viewing is confirmed', { resource_type: 'viewing' })]
    const { emailPendingNotifications } = await import('./notificationMailer.js')
    await emailPendingNotifications()
    expect(sent).toEqual([expect.objectContaining({ id: 'notification', to: 'tenant1@example.com' })])
  })

  it('with no addresses on the list, each super admin is emailed as before', async () => {
    alertList = []
    pending = [notice('n1', 'admin1', 'SUPER_ADMIN', 'Listing waiting for approval'), notice('n2', 'admin2', 'SUPER_ADMIN', 'Listing waiting for approval')]
    const { emailPendingNotifications } = await import('./notificationMailer.js')
    await emailPendingNotifications()
    expect(sent.map((s) => s.to).sort()).toEqual(['admin1@example.com', 'admin2@example.com'])
  })
})
