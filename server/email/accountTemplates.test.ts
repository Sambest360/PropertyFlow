import { describe, expect, it } from 'vitest'
import { renderTemplate } from './templates'

const TEMP = ['Temp', 'Pass', '<9241>'].join('-')

describe('account emails with a temporary password', () => {
  it('new account: shows the sign-in email and temporary password, links to sign-in; subject never holds it', () => {
    const r = renderTemplate('account_setup', { to: 'sipho@example.com', name: 'Sipho', link: '/login', tempPassword: TEMP, agencyName: 'century 21' })
    expect(r.subject).toBe('Your Lekaya Rentals account is ready')
    expect(r.subject).not.toContain(TEMP)
    expect(r.text).toContain(TEMP)
    expect(r.text).toContain('/login')
    expect(r.text).toMatch(/choose your own password when you first sign in/)
    expect(r.html).toContain('Temp-Pass-&lt;9241&gt;')
    expect(r.html).not.toContain('<9241>')
    expect(r.html).toContain('Temporary password')
    expect(r.html).not.toContain('set-password')
  })

  it('new account without a temporary password keeps the choose-a-password link', () => {
    const r = renderTemplate('account_setup', { to: 'a@example.com', link: '/set-password?token=abc' })
    expect(r.html).toContain('/set-password?token=abc')
    expect(r.html).not.toContain('Temporary password')
  })

  it('staff reset: emails the temporary password, forced change at sign-in', () => {
    const r = renderTemplate('password_reset_by_staff', { to: 'a@example.com', link: '/login', tempPassword: TEMP, resetBy: 'Lerato' })
    expect(r.subject).not.toContain(TEMP)
    expect(r.text).toContain(TEMP)
    expect(r.html).toContain('Temp-Pass-&lt;9241&gt;')
    expect(r.text).toMatch(/choose a new password straight away/)
  })
})

describe('email change messages', () => {
  it('the new address gets the confirm link; the old address gets a notice without one', () => {
    const confirm = renderTemplate('email_change_confirm', { to: 'new@example.com', link: '/confirm-email-change?token=t1', oldEmail: 'old@example.com', changedBy: 'Lerato' })
    expect(confirm.html).toContain('/confirm-email-change?token=t1')
    expect(confirm.text).toMatch(/Until you confirm, the account keeps its current email/)
    const notice = renderTemplate('email_change_notice', { to: 'old@example.com', newEmail: 'new@example.com', changedBy: 'Lerato' })
    expect(notice.html).toContain('new@example.com')
    expect(notice.html).not.toContain('confirm-email-change')
  })
})
