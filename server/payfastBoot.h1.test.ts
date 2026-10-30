import { describe, expect, it } from 'vitest'
import { payfastProductionModeError } from './payfast.js'

/** H1 R2: production with PayFast configured but not live logs a boot error. Fake values only. */
describe('H1 R2 PayFast production mode check', () => {
  const base = { PAYFAST_MERCHANT_ID: 'FAKE-MERCHANT-0001', PAYFAST_MERCHANT_KEY: 'fake-merchant-key' }
  it('production + sandbox (or unset mode) gives the boot error', () => {
    expect(payfastProductionModeError({ ...base, NODE_ENV: 'production', PAYFAST_MODE: 'sandbox' })).toMatch(/payfast_mode_not_live/)
    expect(payfastProductionModeError({ ...base, NODE_ENV: 'production' })).toMatch(/PAYFAST_MODE=live/)
  })
  it('production + live, non-production, or PayFast not configured gives none', () => {
    expect(payfastProductionModeError({ ...base, NODE_ENV: 'production', PAYFAST_MODE: 'LIVE' })).toBeNull()
    expect(payfastProductionModeError({ ...base, NODE_ENV: 'development', PAYFAST_MODE: 'sandbox' })).toBeNull()
    expect(payfastProductionModeError({ NODE_ENV: 'production' })).toBeNull()
  })
  it('the message carries no env values', () => {
    const msg = payfastProductionModeError({ ...base, NODE_ENV: 'production', PAYFAST_MODE: 'sandbox' }) ?? ''
    expect(msg).not.toMatch(/FAKE-MERCHANT|fake-merchant-key/)
  })
})
