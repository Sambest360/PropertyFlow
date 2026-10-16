import { describe, expect, it, vi } from 'vitest'

const HOST = 'ep-hidden-host-123.eu-central-1.aws.neon.tech'
vi.hoisted(() => {
  process.env.PF_SKIP_SERVE = '1'
  process.env.DATABASE_URL = 'postgres://pfuser:pfpass@ep-hidden-host-123.eu-central-1.aws.neon.tech:6543/pfdbname'
  process.env.AUTH_SECRET = 'test-secret-health'
  process.env.SUPABASE_URL = 'https://abcdefghijklmnopqrst.supabase.co'
  delete process.env.AUTH_MODE
})

import app from './index'

describe('/api/health auth mode + db fingerprint', () => {
  it('reports api mode and an 8-hex db fingerprint with no host/user/db name', async () => {
    const res = await app.request('/api/health?db=0')
    const text = await res.text()
    const body = JSON.parse(text)
    expect(body.authMode).toBe('api')
    expect(body.dbHost).toMatch(/^[0-9a-f]{8}$/)
    for (const leak of [HOST, 'neon.tech', 'pfuser', 'pfpass', 'pfdbname', 'supabase.co']) {
      expect(text).not.toContain(leak)
    }
  })
})
