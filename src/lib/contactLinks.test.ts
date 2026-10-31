import { describe, expect, it } from 'vitest'
import { initials, telLink, websiteHref, whatsAppLink, whatsAppNumber } from './contactLinks'

describe('contact links', () => {
  it('turns SA numbers into international wa.me digits', () => {
    expect(whatsAppNumber('082 123 4567')).toBe('27821234567')
    expect(whatsAppNumber('+27 82 123 4567')).toBe('27821234567')
    expect(whatsAppNumber('0027821234567')).toBe('27821234567')
    expect(whatsAppNumber('123')).toBeNull()
    expect(whatsAppNumber('')).toBeNull()
  })

  it('builds a prefilled WhatsApp link', () => {
    expect(whatsAppLink('082 123 4567', 'Hi, about "Flat 1"')).toBe('https://wa.me/27821234567?text=Hi%2C%20about%20%22Flat%201%22')
    expect(whatsAppLink(null, 'x')).toBeNull()
  })

  it('tel links and website hrefs', () => {
    expect(telLink('+27 41 000 1111')).toBe('tel:+27410001111')
    expect(websiteHref('horizon.co.za')).toBe('https://horizon.co.za/')
    expect(websiteHref('javascript:alert(1)')).toBeNull()
    expect(websiteHref('')).toBeNull()
  })

  it('initials', () => {
    expect(initials('Horizon Realty')).toBe('HR')
    expect(initials('Meryl Ann Connett')).toBe('MC')
    expect(initials('')).toBe('?')
  })
})
