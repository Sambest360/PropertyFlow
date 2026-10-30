import { beforeEach, describe, expect, it, vi } from 'vitest'

/** H1 item 7: the repeat alert carries the new note, HTML-escaped. */
const sent = vi.hoisted(() => [] as Array<{ subject: string; text: string; html?: string }>)
vi.mock('./email/send.js', async (orig) => ({
  ...(await orig<typeof import('./email/send.js')>()),
  deliverEmail: vi.fn(async (input: { subject: string; text: string; html?: string }) => {
    sent.push(input)
    return { ok: true, provider: 'log' }
  }),
}))

import { sendListingLeadAlert } from './mailtrap.js'

beforeEach(() => {
  sent.length = 0
})

describe('H1 repeat-enquiry agent alert', () => {
  it('a repeat alert is a follow-up carrying the note, escaped', async () => {
    await sendListingLeadAlert({
      agentEmail: 'agent@example.com',
      leadName: 'Kelly Buyer',
      leadEmail: 'kelly@example.com',
      action: 'lead',
      repeatNote: 'Can I view <b>Saturday</b>?',
    })
    expect(sent).toHaveLength(1)
    expect(sent[0]?.subject).toMatch(/follow-up/i)
    expect(sent[0]?.html).toContain('Can I view &lt;b&gt;Saturday&lt;/b&gt;?')
    expect(sent[0]?.html).not.toContain('<b>Saturday</b>')
    expect(sent[0]?.text).toContain('Can I view <b>Saturday</b>?')
  })

  it('a first enquiry alert is unchanged (no message line)', async () => {
    await sendListingLeadAlert({ agentEmail: 'agent@example.com', leadName: 'Kelly Buyer', leadEmail: 'kelly@example.com', action: 'lead' })
    expect(sent[0]?.subject).toBe('New enquiry: Kelly Buyer')
    expect(sent[0]?.html).not.toMatch(/Message:/)
  })
})
