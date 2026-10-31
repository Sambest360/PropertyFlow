/**
 * Phone and web links for public contact cards (client + server).
 * South African numbers: a leading 0 becomes the 27 country code.
 */

/** Digits in international format for wa.me (no +), or null when it is not a usable number. */
export function whatsAppNumber(phone: string | null | undefined): string | null {
  if (!phone) return null
  const trimmed = phone.trim()
  let digits = trimmed.replace(/\D/g, '')
  if (!digits) return null
  if (trimmed.startsWith('+')) {
    // already international
  } else if (digits.startsWith('00')) {
    digits = digits.slice(2)
  } else if (digits.startsWith('0')) {
    digits = `27${digits.slice(1)}`
  }
  return digits.length >= 9 && digits.length <= 15 ? digits : null
}

/** https://wa.me link with a prefilled message, or null without a usable number. */
export function whatsAppLink(phone: string | null | undefined, message: string): string | null {
  const n = whatsAppNumber(phone)
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(message)}` : null
}

/** tel: link (keeps a leading +). */
export function telLink(phone: string): string {
  const t = phone.trim()
  return `tel:${t.startsWith('+') ? '+' : ''}${t.replace(/\D/g, '')}`
}

/** Website as an https link ("example.co.za" → "https://example.co.za"); null unless http(s). */
export function websiteHref(site: string | null | undefined): string | null {
  const s = (site ?? '').trim()
  if (!s) return null
  const withScheme = /^https?:\/\//i.test(s) ? s : `https://${s}`
  try {
    const u = new URL(withScheme)
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null
  } catch {
    return null
  }
}

/** Initials for a photo placeholder ("Horizon Realty" → "HR"). */
export function initials(name: string | null | undefined): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean)
  return (parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : (parts[0] ?? '?').slice(0, 2)).toUpperCase()
}
