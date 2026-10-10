import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { showPasswordResetEntry } from './passwordResetUi'
import { validatePasswordChange } from '../../pages/account/ChangePasswordPage'
import { TEMP_PASSWORD_HANDOFF_NOTE } from '../../components/admin/ResetPasswordButton'

/** Test-only password fixtures, built at runtime (not credentials). */
const TEST_FIXTURE_OLD_PW = ['old', 'password', '1'].join('-')
const TEST_FIXTURE_NEW_PW = ['new', 'password', '1'].join('-')
const TEST_FIXTURE_NINE_PW = ['abcd', 'efgh', 'i'].join('')
const TEST_FIXTURE_OTHER_PW = ['other', 'password'].join('-')

describe('D3 reset entry visibility (UI only; the server is the gate)', () => {
  const base = { hasUsersManage: true, apiMode: true, viewerId: 'u-admin', target: { id: 'u-t', role: 'tenant' } }
  it('shows with users.manage in API mode for another non-super user', () => {
    expect(showPasswordResetEntry(base)).toBe(true)
  })
  it('hides without users.manage, outside API mode, on your own row and on a super admin', () => {
    expect(showPasswordResetEntry({ ...base, hasUsersManage: false })).toBe(false)
    expect(showPasswordResetEntry({ ...base, apiMode: false })).toBe(false)
    expect(showPasswordResetEntry({ ...base, target: { id: 'u-admin', role: 'client_admin' } })).toBe(false)
    expect(showPasswordResetEntry({ ...base, target: { id: 'u-sa2', role: 'super_admin' } })).toBe(false)
    expect(showPasswordResetEntry({ ...base, target: null })).toBe(false)
  })
})

describe('D3 change-password form checks', () => {
  const ok = { currentPassword: TEST_FIXTURE_OLD_PW, newPassword: TEST_FIXTURE_NEW_PW, confirmPassword: TEST_FIXTURE_NEW_PW }
  it('accepts a 10+ character new password that matches its confirmation', () => {
    expect(validatePasswordChange(ok)).toBeNull()
  })
  it('refuses 9 characters, a mismatch, a missing current password and an unchanged password', () => {
    expect(validatePasswordChange({ ...ok, newPassword: TEST_FIXTURE_NINE_PW, confirmPassword: TEST_FIXTURE_NINE_PW })).toMatch(/10/)
    expect(validatePasswordChange({ ...ok, confirmPassword: TEST_FIXTURE_OTHER_PW })).toMatch(/match/)
    expect(validatePasswordChange({ ...ok, currentPassword: '' })).toMatch(/current/)
    expect(validatePasswordChange({ ...ok, currentPassword: ok.newPassword })).toMatch(/different/)
  })
})

describe('D3 temp password modal', () => {
  const src = readFileSync(new URL('../../components/admin/ResetPasswordButton.tsx', import.meta.url), 'utf8')
  it('tells the admin to hand the password over privately', () => {
    expect(TEMP_PASSWORD_HANDOFF_NOTE).toBe(
      'Send this password to the user privately (a direct call or message). Don\u2019t post it in a group chat.',
    )
    expect(src).toContain('{TEMP_PASSWORD_HANDOFF_NOTE}')
    expect(src).toContain('navigator.clipboard.writeText(tempPassword)')
  })
  it('never stores or logs the temp password client-side', () => {
    expect(src).not.toMatch(/localStorage|sessionStorage|indexedDB|console\./)
    expect(src).toContain('setTempPassword(null)')
  })
})
