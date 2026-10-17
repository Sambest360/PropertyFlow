import { describe, expect, it } from 'vitest'
import { prefillEnquiryContact } from './listingEnquiryPrefill'

describe('prefillEnquiryContact', () => {
  it('prefers explicit firstName, lastName, and phone', () => {
    const out = prefillEnquiryContact(
      {
        email: 'a@b.com',
        name: 'Legacy Name',
        firstName: 'Sam',
        lastName: 'User',
        phone: '+27000000000',
      },
      { email: '', firstName: '', lastName: '', phone: '' },
    )
    expect(out).toEqual({
      email: 'a@b.com',
      firstName: 'Sam',
      lastName: 'User',
      phone: '+27000000000',
    })
  })

  it('falls back to splitting name when names omitted', () => {
    const out = prefillEnquiryContact(
      { email: 'a@b.com', name: 'Jane Doe' },
      { email: '', firstName: '', lastName: '', phone: '' },
    )
    expect(out.firstName).toBe('Jane')
    expect(out.lastName).toBe('Doe')
  })

  it('does not overwrite user-edited fields', () => {
    const out = prefillEnquiryContact(
      { firstName: 'Sam', lastName: 'User', phone: '1' },
      { email: 'x@y.com', firstName: 'Typed', lastName: '', phone: '' },
    )
    expect(out.firstName).toBe('Typed')
    expect(out.email).toBe('x@y.com')
  })
})
