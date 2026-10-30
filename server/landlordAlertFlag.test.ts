import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Michael ruling (30 Oct 2026): landlord enquiry alerts are OFF by default.
 * At launch only the agent is alerted; a landlord gets the enquirer's name,
 * email, phone and note only when ALERT_LANDLORDS=1 (after a DPA and sender
 * verification). Any other value, or unset, sends no landlord copy. The agent
 * alert is unchanged in both states. The flag is read at call time.
 */
const sent = vi.hoisted(() => [] as Array<{ to: string; subject: string }>)
vi.mock('./email/send.js', async (orig) => ({
  ...(await orig<typeof import('./email/send.js')>()),
  deliverEmail: vi.fn(async (input: { to: string; subject: string }) => {
    sent.push(input)
    return { ok: true, provider: 'log' }
  }),
}))

import { sendListingLeadAlert } from './mailtrap.js'

const saved = process.env.ALERT_LANDLORDS
beforeEach(() => {
  sent.length = 0
  delete process.env.ALERT_LANDLORDS
})
afterEach(() => {
  if (saved === undefined) delete process.env.ALERT_LANDLORDS
  else process.env.ALERT_LANDLORDS = saved
})

const base = { agentEmail: 'agent@example.com', landlordEmail: 'landlord@example.com', leadName: 'Kelly Buyer', leadEmail: 'kelly@example.com', leadPhone: '0821234567' }
const recipients = async () => {
  await new Promise((r) => setTimeout(r, 0))
  return sent.map((m) => m.to).sort()
}

describe('ALERT_LANDLORDS gate on the listing lead alert', () => {
  for (const [label, value] of [['unset', undefined], ['0', '0'], ['true', 'true'], ['yes', 'yes'], ['empty', ''], [' 1 ', ' 1 ']] as const) {
    it(`flag ${label}: agent only, for a lead, a viewing and a repeat with a note`, async () => {
      if (value !== undefined) process.env.ALERT_LANDLORDS = value
      await sendListingLeadAlert({ ...base, action: 'lead' })
      await sendListingLeadAlert({ ...base, action: 'viewing' })
      await sendListingLeadAlert({ ...base, action: 'lead', repeatNote: 'Can I view on Saturday?' })
      expect(await recipients()).toEqual(['agent@example.com', 'agent@example.com', 'agent@example.com'])
    })
  }

  it('flag 1: agent and landlord, for a lead, a viewing and a repeat with a note', async () => {
    process.env.ALERT_LANDLORDS = '1'
    await sendListingLeadAlert({ ...base, action: 'lead' })
    await sendListingLeadAlert({ ...base, action: 'viewing' })
    await sendListingLeadAlert({ ...base, action: 'lead', repeatNote: 'Can I view on Saturday?' })
    const to = await recipients()
    expect(to.filter((t) => t === 'agent@example.com')).toHaveLength(3)
    expect(to.filter((t) => t === 'landlord@example.com')).toHaveLength(3)
  })

  it('the flag is read at call time, not at module load', async () => {
    process.env.ALERT_LANDLORDS = '1'
    await sendListingLeadAlert({ ...base, action: 'lead' })
    delete process.env.ALERT_LANDLORDS
    await sendListingLeadAlert({ ...base, action: 'lead' })
    expect(await recipients()).toEqual(['agent@example.com', 'agent@example.com', 'landlord@example.com'])
  })
})
