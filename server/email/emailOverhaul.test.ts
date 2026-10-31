import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const queries: Array<{ sql: string; params: unknown[] }> = []
let handler: (sql: string, params: unknown[]) => unknown[] = () => []
vi.mock('../db.js', () => ({
  query: async (sql: string, params: unknown[] = []) => {
    queries.push({ sql, params })
    return handler(sql, params)
  },
}))

const UNIT = '11111111-2222-4333-8444-555555555555'
const AGENT = 'aaaaaaaa-0000-4000-8000-000000000001'
const ADMIN = 'aaaaaaaa-0000-4000-8000-000000000002'
const PNG_1PX =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

function unitRow(over: Record<string, unknown> = {}) {
  return {
    id: UNIT,
    title: 'Humewood Beach Apartment B14',
    unit_number: 'B14',
    building_name: 'Humewood Beach',
    suburb: 'Humewood',
    city: 'Gqeberha',
    rent: '8500.00',
    price: null,
    listing_type: 'RENT',
    status_config_key: 'PUBLISHED',
    advertise_while_occupied: false,
    available_from: null,
    bedrooms: 2,
    bathrooms: '1.0',
    unit_images: [PNG_1PX],
    building_images: [],
    agent_id: AGENT,
    landlord_id: null,
    landlord_verification: null,
    ...over,
  }
}

beforeEach(() => {
  queries.length = 0
  handler = () => []
  process.env.PUBLIC_APP_URL = 'https://www.lekayarentals.site'
  process.env.AUTH_SECRET = 'test-secret'
  for (const k of ['EMAIL_PROVIDER', 'BREVO_API_KEY', 'SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'MAILTRAP_API_KEY', 'MAILTRAP_SMTP_USER', 'MAILTRAP_SMTP_PASS']) delete process.env[k]
})
afterEach(() => {
  delete process.env.PUBLIC_APP_URL
  delete process.env.AUTH_SECRET
})

describe('routing: who gets which email (server/email/routing.ts)', () => {
  it('agents, field agents, landlords and tenants get every notification', async () => {
    const { routeNotificationEmail } = await import('./routing.js')
    for (const role of ['GROUND_AGENT', 'LANDLORD', 'END_USER', 'CONTRACTOR', 'SUPER_ADMIN']) {
      expect(routeNotificationEmail({ role, resource: 'applicant', action: 'created', title: 'New application' }).route, role).toBe('email')
    }
    // Stale metadata never turns a field agent into an admin.
    expect(routeNotificationEmail({ role: 'GROUND_AGENT', frontendRole: 'client_admin', resource: 'viewing', action: 'created' }).route).toBe('email')
  })

  it('agency admins get routine updates in the daily summary, not one by one', async () => {
    const { routeNotificationEmail } = await import('./routing.js')
    for (const [resource, title] of [
      ['applicant', 'New application'],
      ['viewing', 'Viewing booked'],
      ['property', 'Listing updated'],
      ['maintenance', 'Maintenance job updated'],
      ['payment', 'Payment recorded'],
      ['lease', 'Lease ends in 80 business days'],
      ['message', 'New message'],
    ]) {
      expect(routeNotificationEmail({ role: 'AGENCY_ADMIN', resource, action: 'created', title }).route, `${resource}`).toBe('digest')
    }
    expect(routeNotificationEmail({ role: 'END_USER', frontendRole: 'agent_admin', resource: 'viewing' }).route).toBe('email')
    expect(routeNotificationEmail({ role: null, frontendRole: 'client_admin', resource: 'viewing' }).route).toBe('digest')
  })

  it('agency admins are still emailed what needs them', async () => {
    const { routeNotificationEmail } = await import('./routing.js')
    const admin = (x: Record<string, unknown>) => routeNotificationEmail({ role: 'AGENT_ADMIN', ...x }).route
    expect(admin({ resource: 'escalation', action: 'alert', title: 'Fault overdue' })).toBe('email')
    expect(admin({ resource: 'billing', action: 'created', title: 'Invoice' })).toBe('email')
    expect(admin({ resource: 'storage', action: 'alert' })).toBe('email')
    expect(admin({ resource: 'complaint', action: 'created' })).toBe('email')
    expect(admin({ resource: 'support', action: 'updated' })).toBe('email')
    expect(admin({ resource: 'maintenance', action: 'escalated', title: 'Emergency: burst pipe' })).toBe('email')
    expect(admin({ resource: 'lease', action: 'rent_escalation' })).toBe('email')
    expect(admin({ resource: 'applicant', action: 'updated', title: 'Landlord approval needed' })).toBe('email')
    expect(admin({ resource: 'payment', action: 'updated', title: 'Payout awaiting your approval' })).toBe('email')
    expect(admin({ resource: 'maintenance', action: 'updated', title: 'Ticket assigned to you: Geyser' })).toBe('email')
    // The admin is the agent on this piece of work.
    expect(admin({ resource: 'viewing', action: 'created', title: 'Viewing booked', assignedToRecipient: true })).toBe('email')
    // "approved" is news, not a request for a decision.
    expect(admin({ resource: 'applicant', action: 'updated', title: 'Application approved' })).toBe('digest')
  })
})

describe('deep links and buttons (server/email/actions.ts)', () => {
  it('fixes links that would lose their target', async () => {
    const { deepLinkFor } = await import('./actions.js')
    expect(deepLinkFor('/workspace/maintenance?ticket=MT-9', 'staff')).toBe('/workspace/operations/maintenance?ticket=MT-9')
    expect(deepLinkFor('/leases?tenancy=ten-1', 'landlord')).toBe('/workspace/leases?tenancy=ten-1')
    expect(deepLinkFor('/workspace/people/leases?lease=ten-1', 'landlord')).toBe('/workspace/portals/owner')
    expect(deepLinkFor('/workspace/people/leases?lease=ten-1', 'tenant')).toBe('/workspace/portals/tenant/leases')
    expect(deepLinkFor('/workspace/people/leases?lease=ten-1', 'staff')).toBe('/workspace/people/leases?lease=ten-1')
    expect(deepLinkFor('/workspace/sales/crm/leads/LD-4', 'staff')).toBe('/workspace/sales/crm/LD-4')
    expect(deepLinkFor('https://evil.example/x', 'staff')).toBe('/workspace')
    expect(deepLinkFor('//evil.example/x', 'staff')).toBe('/workspace')
  })

  it('labels the button after the thing to do', async () => {
    const { emailActionFor } = await import('./actions.js')
    const label = (link: string, audience: 'staff' | 'tenant' | 'landlord', title = '', resource?: string) =>
      emailActionFor({ link, audience, title, resource }).label
    expect(label('/workspace/sales/applications/APP-1', 'staff')).toBe('Review the application')
    expect(label('/workspace/portals/tenant/applications/APP-1', 'tenant', 'Please upload your payslip')).toBe('Upload documents')
    expect(label('/workspace/portals/tenant/leases', 'tenant', 'Your lease is ready to sign', 'lease')).toBe('Review and sign the lease')
    expect(label('/workspace/portals/tenant/leases', 'tenant', 'Lease signed by everyone', 'lease')).toBe('View the lease')
    expect(label('/workspace/sales/viewings/property/PR-1?booking=B1', 'staff')).toBe('Open the viewing')
    expect(label('/workspace/portals/tenant/payments', 'tenant', 'Rent is overdue', 'payment')).toBe('Upload proof of payment')
    expect(label('/workspace/operations/payments/P-1', 'staff', 'Proof of payment uploaded', 'payment')).toBe('Review the payment proof')
    expect(label('/workspace/help?ticket=S-1', 'staff', '', 'support')).toBe('Open the support ticket')
    expect(emailActionFor({ link: null, audience: 'tenant' })).toEqual({ label: 'Open my dashboard', href: '/workspace' })
  })
})

describe('property card (server/email/layout.ts)', () => {
  it('is email-client safe: table layout, absolute https photo with alt, width and height', async () => {
    const { propertyCard, propertyCardText } = await import('./layout.js')
    const html = propertyCard({
      title: 'Oak <Court>',
      area: 'Walmer, Gqeberha',
      price: 'R 8 500 / month',
      imageUrl: 'https://www.lekayarentals.site/api/email/photo/x.jpg',
      viewUrl: '/listing/PR-9',
    })
    expect(html).toContain('role="presentation"')
    expect(html).toMatch(/<img src="https:\/\/www\.lekayarentals\.site\/api\/email\/photo\/x\.jpg" alt="Photo of Oak &lt;Court&gt;" width="536" height="300"/)
    expect(html).toContain('href="https://www.lekayarentals.site/listing/PR-9"')
    expect(html).toContain('View property')
    expect(html).not.toContain('<Court>')
    expect(propertyCardText({ title: 'Oak', area: 'Walmer', price: 'R 1', viewUrl: '/listing/PR-9' })).toBe(
      'Property: Oak\nArea: Walmer\nPrice: R 1\nView property: https://www.lekayarentals.site/listing/PR-9',
    )
  })

  it('never embeds a data: photo; shows the no-photo panel instead', async () => {
    const { propertyCard } = await import('./layout.js')
    const html = propertyCard({ title: 'Oak', imageUrl: PNG_1PX })
    expect(html).not.toContain('data:image')
    expect(html).toContain('No photo yet')
    expect(html).not.toContain('<img')
  })

  it('the button is bulletproof (Outlook VML + link) and absolute', async () => {
    const { button, buttonText } = await import('./layout.js')
    const html = button('Sign the lease', '/workspace/portals/tenant/leases')
    expect(html).toContain('<v:roundrect')
    expect(html).toContain('href="https://www.lekayarentals.site/workspace/portals/tenant/leases"')
    expect(html).toContain('class="pf-btn"')
    expect(buttonText('Sign the lease', '/workspace/portals/tenant/leases')).toBe('Sign the lease: https://www.lekayarentals.site/workspace/portals/tenant/leases')
  })
})

describe('property context (server/email/propertyContext.ts)', () => {
  it('reads the ids a notification link carries', async () => {
    const { idsFromLink } = await import('./propertyContext.js')
    expect(idsFromLink('/workspace/sales/applications/APP-1?tab=blocks')).toEqual([{ kind: 'application', id: 'APP-1' }])
    expect(idsFromLink('/workspace/portals/tenant/applications/APP%2D1')).toEqual([{ kind: 'application', id: 'APP-1' }])
    expect(idsFromLink('/workspace/sales/viewings/property/PR-1?booking=BK-2')).toEqual([
      { kind: 'booking', id: 'BK-2' },
      { kind: 'property', id: 'PR-1' },
    ])
    expect(idsFromLink('/workspace/leases?tenancy=ten-1')).toEqual([{ kind: 'lease', id: 'ten-1' }])
    expect(idsFromLink('/workspace/operations/maintenance/MT-3')).toEqual([{ kind: 'ticket', id: 'MT-3' }])
    expect(idsFromLink('/workspace/operations/payments/P-4')).toEqual([{ kind: 'payment', id: 'P-4' }])
    expect(idsFromLink('/workspace/properties/PR-5?tab=maintenance')).toEqual([{ kind: 'property', id: 'PR-5' }])
    expect(idsFromLink('/workspace/properties/new')).toEqual([])
    expect(idsFromLink('/listing/PR-6#reviews')).toEqual([{ kind: 'property', id: 'PR-6' }])
    expect(idsFromLink('/workspace/admin/storage')).toEqual([])
  })

  it('prices rentals per month and sales as the asking price', async () => {
    const { priceLabel } = await import('./propertyContext.js')
    expect(priceLabel({ rent: '8500', price: null, listing_type: 'RENT' })).toBe('R 8 500 / month')
    expect(priceLabel({ rent: null, price: '1250000', listing_type: 'SALE' })).toBe('R 1 250 000')
    expect(priceLabel({ rent: null, price: null, listing_type: 'RENT' })).toBeNull()
  })

  it('stored photos go through the resizing endpoint; other https photos are linked as they are', async () => {
    const { cardImageUrl, photoSignature } = await import('./propertyContext.js')
    const viaEndpoint = cardImageUrl(UNIT, PNG_1PX, true)!
    expect(viaEndpoint).toMatch(new RegExp(`^https://www\\.lekayarentals\\.site/api/email/photo/${UNIT}\\.jpg\\?v=[0-9a-f]{10}&s=`))
    expect(viaEndpoint).toContain(`s=${photoSignature(UNIT)}`)
    expect(cardImageUrl(UNIT, '/api/files/units/a.jpg', false)).not.toContain('&s=')
    expect(cardImageUrl(UNIT, 'https://images.example.com/a.jpg', true)).toBe('https://images.example.com/a.jpg')
    expect(cardImageUrl(UNIT, 'http://insecure.example.com/a.jpg', true)).toBeNull()
    process.env.PUBLIC_APP_URL = 'http://localhost:5173'
    expect(cardImageUrl(UNIT, PNG_1PX, true)).toBeNull()
  })

  it('builds the card: public listing links to /listing, private ones only for staff and landlords', async () => {
    const { propertyCardForUnit } = await import('./propertyContext.js')
    let row = unitRow()
    handler = (sql) => (sql.includes('FROM units u') ? [row] : sql.includes('entity_id_map') ? [{ frontend_id: 'PR-1011' }] : [])
    const pub = await propertyCardForUnit(UNIT, 'tenant')
    expect(pub).toMatchObject({
      title: 'Humewood Beach Apartment B14',
      area: 'Humewood, Gqeberha · 2 bed · 1 bath',
      price: 'R 8 500 / month',
    })
    expect(pub!.viewUrl).toMatch(/^\/listing\//)
    expect(pub!.imageUrl).not.toContain('&s=')
    row = unitRow({ listing_type: 'NOT_LISTED', status_config_key: 'OCCUPIED' })
    const tenant = await propertyCardForUnit(UNIT, 'tenant')
    expect(tenant!.viewUrl).toBeNull()
    expect(tenant!.imageUrl).toContain('&s=')
    const staff = await propertyCardForUnit(UNIT, 'staff')
    expect(staff!.viewUrl).toMatch(/^\/workspace\/properties\//)
  })
})

describe('cover photo endpoint (server/email/photoRoute.ts)', () => {
  it('serves a public listing photo resized to 1072×600 JPEG', async () => {
    handler = (sql) => (sql.includes('FROM units u') ? [unitRow()] : [])
    const { emailPhoto } = await import('./photoRoute.js')
    const r = await emailPhoto(`${UNIT}.jpg`, null)
    expect(r.status).toBe(200)
    const sharp = (await import('sharp')).default
    const meta = await sharp((r as { body: Buffer }).body).metadata()
    expect(meta).toMatchObject({ format: 'jpeg', width: 1072, height: 600 })
  })

  it('a non-public listing needs the email signature', async () => {
    handler = (sql) => (sql.includes('FROM units u') ? [unitRow({ listing_type: 'NOT_LISTED', unit_images: [PNG_1PX + ''] })] : [])
    const { emailPhoto } = await import('./photoRoute.js')
    const { photoSignature } = await import('./propertyContext.js')
    expect((await emailPhoto(`${UNIT}.jpg`, null)).status).toBe(404)
    expect((await emailPhoto(`${UNIT}.jpg`, 'forged-signature-xxxxx')).status).toBe(404)
    expect((await emailPhoto(`${UNIT}.jpg`, photoSignature(UNIT))).status).toBe(200)
    expect((await emailPhoto('../../etc/passwd', photoSignature(UNIT))).status).toBe(404)
  })

  it('never fetches arbitrary remote links', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    handler = (sql) => (sql.includes('FROM units u') ? [unitRow({ unit_images: ['https://internal.example/a.jpg'] })] : [])
    const { emailPhoto } = await import('./photoRoute.js')
    expect((await emailPhoto(`${UNIT}.jpg`, null)).status).toBe(404)
    expect(fetchSpy).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})

describe('notification mailer routing', () => {
  function pending(userId: string, role: string, over: Record<string, unknown> = {}) {
    return {
      id: `bbbbbbbb-0000-4000-8000-00000000000${userId === AGENT ? 1 : 2}`,
      user_id: userId,
      title: 'Viewing booked',
      body: 'Saturday 10:00 with Thandi.',
      link_path: `/workspace/sales/viewings/property/${UNIT}`,
      resource_type: 'viewing',
      action_type: 'created',
      role,
      email: userId === AGENT ? 'agent@example.com' : 'admin@example.com',
      first_name: userId === AGENT ? 'James' : 'Lerato',
      active: true,
      metadata: {},
      ...over,
    }
  }

  it('emails the agent with the property card and button; holds the admin copy for the summary', async () => {
    const marks: Array<{ ids: string[]; status: string }> = []
    handler = (sql, params) => {
      if (sql.includes('information_schema.columns')) return [{ n: '1' }]
      if (sql.includes('FROM notifications n JOIN users u')) return [pending(AGENT, 'GROUND_AGENT'), pending(ADMIN, 'AGENCY_ADMIN')]
      if (sql.includes('FROM units u')) return [unitRow({ agent_id: AGENT })]
      if (sql.includes('UPDATE notifications SET emailed_at = NOW(), email_status = $2')) marks.push({ ids: params[0] as string[], status: String(params[1]) })
      return []
    }
    const { captureEmails } = await import('./send.js')
    const { emailPendingNotifications } = await import('../notificationMailer.js')
    let result: Awaited<ReturnType<typeof emailPendingNotifications>> | undefined
    const mails = await captureEmails(async () => {
      result = await emailPendingNotifications()
    })
    expect(mails.map((m) => m.to)).toEqual(['agent@example.com'])
    expect(mails[0]!.html).toContain('Humewood Beach Apartment B14')
    expect(mails[0]!.html).toContain('/api/email/photo/')
    expect(mails[0]!.html).toContain('Open the viewing')
    expect(mails[0]!.html).toContain(`https://www.lekayarentals.site/workspace/sales/viewings/property/${UNIT}`)
    expect(mails[0]!.text).toContain(`Open the viewing: https://www.lekayarentals.site/workspace/sales/viewings/property/${UNIT}`)
    expect(mails[0]!.text).toContain('Property: Humewood Beach Apartment B14')
    expect(marks).toContainEqual({ ids: [pending(ADMIN, 'AGENCY_ADMIN').id], status: 'digest' })
    expect(result!.held).toBe(1)
  })

  it('an admin who is the agent on the property is emailed straight away', async () => {
    handler = (sql) => {
      if (sql.includes('information_schema.columns')) return [{ n: '1' }]
      if (sql.includes('FROM notifications n JOIN users u')) return [pending(ADMIN, 'AGENCY_ADMIN')]
      if (sql.includes('FROM units u')) return [unitRow({ agent_id: ADMIN })]
      return []
    }
    const { captureEmails } = await import('./send.js')
    const { emailPendingNotifications } = await import('../notificationMailer.js')
    const mails = await captureEmails(() => emailPendingNotifications())
    expect(mails.map((m) => m.to)).toEqual(['admin@example.com'])
  })

  it('the daily summary lists unread held items with their links, and marks every held row', async () => {
    const updates: unknown[][] = []
    const now = new Date().toISOString()
    handler = (sql, params) => {
      if (sql.includes('information_schema.columns')) return [{ n: '1' }]
      if (sql.includes("WHERE n.email_status = 'digest'"))
        return [
          { ...pending(ADMIN, 'AGENCY_ADMIN'), read_at: null, created_at: now, agency_name: 'Horizon Realty' },
          { ...pending(ADMIN, 'AGENCY_ADMIN'), id: 'bbbbbbbb-0000-4000-8000-000000000009', title: 'Seen already', read_at: now, created_at: now, agency_name: 'Horizon Realty' },
        ]
      if (sql.includes('FROM units u')) return [unitRow()]
      if (sql.startsWith('UPDATE notifications SET email_status')) updates.push(params)
      return []
    }
    const { captureEmails } = await import('./send.js')
    const { sendAdminDailyDigests } = await import('../notificationMailer.js')
    const mails = await captureEmails(() => sendAdminDailyDigests())
    expect(mails).toHaveLength(1)
    expect(mails[0]!.subject).toBe('Your daily summary: 1 update on Lekaya Rentals')
    expect(mails[0]!.html).toContain('Horizon Realty')
    expect(mails[0]!.html).toContain('Open the viewing')
    expect(mails[0]!.html).not.toContain('Seen already')
    expect(mails[0]!.text).toContain(`https://www.lekayarentals.site/workspace/sales/viewings/property/${UNIT}`)
    expect((updates[0]![0] as string[]).length).toBe(2)
  })
})

describe('every email: action button, links written out in text, nothing sensitive in subjects', () => {
  it('previews render with absolute links in both versions', async () => {
    const { listEmailPreviews } = await import('./previews.js')
    const previews = await listEmailPreviews()
    expect(previews.length).toBeGreaterThanOrEqual(20)
    const PROPERTY = new Set([
      'notification',
      'notification_digest',
      'admin_daily_digest',
      'enquiry_confirmation',
      'lead_alert',
      'application_received',
      'application_approved',
      'application_declined',
      'payment_receipt',
      'dunning_notice',
      'lease_signed',
      'lease_end_reminder',
    ])
    for (const p of previews) {
      if (p.id === 'email_change_notice') continue // informational security notice, no action
      expect(p.html, p.id).toMatch(/class="pf-btn" href="https:\/\//)
      expect(p.text, p.id).toMatch(/https:\/\//)
      expect(p.html, p.id).not.toMatch(/localhost|data:image/)
      expect(p.subject, p.id).not.toMatch(/password:|temp-|\b\d{13}\b/i)
      expect(p.html, p.id).not.toMatch(/pay now|checkout/i)
      if (PROPERTY.has(p.id)) {
        expect(p.html, p.id).toContain('Humewood Beach Apartment B14')
        expect(p.html, p.id).toContain('pf-card')
        expect(p.text, p.id).toMatch(/Humewood Beach Apartment B14/)
      }
    }
  })
})

describe('site address in links', () => {
  it('a localhost address never reaches production emails', async () => {
    const { appLink } = await import('./layout.js')
    const env = process.env.NODE_ENV
    process.env.PUBLIC_APP_URL = 'http://localhost:5173'
    try {
      process.env.NODE_ENV = 'production'
      expect(appLink('/workspace')).toBe('https://lekayarentals.site/workspace')
      process.env.NODE_ENV = 'development'
      expect(appLink('/workspace')).toBe('http://localhost:5173/workspace')
    } finally {
      process.env.NODE_ENV = env
    }
  })
})
