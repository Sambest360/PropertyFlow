import { useEffect, useState } from 'react'
import { Globe, Mail, MapPin, MessageCircle, Phone } from 'lucide-react'
import { cn } from '../ui'
import { isApiEnabled } from '../../lib/api/config'
import { fetchListingContact, type PublicListingContact } from '../../lib/api/agencyProfileApi'
import { initials, telLink, websiteHref, whatsAppLink } from '../../lib/contactLinks'

const CARD = 'rounded-3xl border border-primary-100 bg-white p-5 text-center shadow-lg shadow-ink/5'
const BUTTON =
  'inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-primary-200 px-4 text-sm font-semibold text-primary transition hover:bg-primary-50'

const NO_CONTACT: PublicListingContact = { agency: null, person: null }

/**
 * Agency + contact person for a listing: live from
 * /api/public/listings/:id/contact (public fields only), or `fallback`
 * (store data) without the API. Call it before the page's early returns.
 */
export function useListingContact(listingId: string | undefined, fallback: PublicListingContact | null): PublicListingContact {
  const [live, setLive] = useState<PublicListingContact | null>(null)
  useEffect(() => {
    setLive(null)
    if (!isApiEnabled || !listingId) return
    let cancelled = false
    void fetchListingContact(listingId).then((r) => {
      if (!cancelled && r) setLive(r)
    })
    return () => {
      cancelled = true
    }
  }, [listingId])
  return isApiEnabled ? (live ?? NO_CONTACT) : (fallback ?? NO_CONTACT)
}

/** Agency and contact-person cards under the listing's enquiry panel. Missing data hides its row or button. */
export function ListingContactCards({
  listingId,
  listingTitle,
  contact,
  className,
}: {
  listingId: string
  listingTitle: string
  contact: PublicListingContact
  className?: string
}) {
  const [phoneShown, setPhoneShown] = useState(false)
  useEffect(() => setPhoneShown(false), [listingId])

  const { agency, person } = contact
  if (!agency && !person) return null

  const site = websiteHref(agency?.website)
  const whatsApp = whatsAppLink(
    person?.phone,
    `Hi ${person?.name.split(/\s+/)[0] ?? ''}, I'm interested in "${listingTitle}" (${window.location.origin}/listing/${listingId}).`,
  )

  return (
    <div className={cn('space-y-4', className)}>
      {agency ? (
        <section className={CARD} aria-label="Listing agency">
          {agency.logoUrl ? (
            <img src={agency.logoUrl} alt={`${agency.name} logo`} className="mx-auto max-h-24 max-w-full object-contain" />
          ) : (
            <div className="mx-auto flex h-20 w-full items-center justify-center rounded-2xl bg-primary-50 font-display text-2xl font-semibold text-primary">
              {initials(agency.name)}
            </div>
          )}
          <p className="mt-4 font-semibold text-ink">{agency.name}</p>
          {agency.area ? <p className="text-sm text-ink-500">{agency.area}</p> : null}
          {agency.description ? <p className="mt-2 text-sm text-ink-500">{agency.description}</p> : null}
          <ul className="mt-4 space-y-2 text-left text-sm">
            {agency.phone ? (
              <li>
                <a href={telLink(agency.phone)} className="flex items-center gap-2 text-ink hover:text-primary">
                  <Phone className="h-4 w-4 shrink-0 text-primary" aria-hidden /> {agency.phone}
                </a>
              </li>
            ) : null}
            {agency.email ? (
              <li>
                <a href={`mailto:${agency.email}`} className="flex items-center gap-2 break-all text-ink hover:text-primary">
                  <Mail className="h-4 w-4 shrink-0 text-primary" aria-hidden /> {agency.email}
                </a>
              </li>
            ) : null}
            {site ? (
              <li>
                <a href={site} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 break-all text-ink hover:text-primary">
                  <Globe className="h-4 w-4 shrink-0 text-primary" aria-hidden /> {site.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                </a>
              </li>
            ) : null}
            {agency.address ? (
              <li className="flex items-start gap-2 text-ink-500">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden /> {agency.address}
              </li>
            ) : null}
          </ul>
        </section>
      ) : null}

      {person ? (
        <section className={CARD} aria-label="Contact person">
          {person.photoUrl ? (
            <img src={person.photoUrl} alt={person.name} className="mx-auto h-28 w-28 rounded-full object-cover" />
          ) : (
            <div className="mx-auto flex h-28 w-28 items-center justify-center rounded-full bg-primary-50 font-display text-3xl font-semibold text-primary">
              {initials(person.name)}
            </div>
          )}
          <p className="mt-4 font-semibold text-ink">{person.name}</p>
          <p className="text-sm text-ink-500">{person.role}</p>
          {person.phone ? (
            <div className="mt-4 space-y-2">
              {phoneShown ? (
                <a href={telLink(person.phone)} className={BUTTON}>
                  <Phone className="h-4 w-4" aria-hidden /> {person.phone}
                </a>
              ) : (
                <button type="button" className={BUTTON} onClick={() => setPhoneShown(true)}>
                  <Phone className="h-4 w-4" aria-hidden /> Show contact number
                </button>
              )}
              {whatsApp ? (
                <a href={whatsApp} target="_blank" rel="noopener noreferrer" className={BUTTON}>
                  <MessageCircle className="h-4 w-4" aria-hidden /> WhatsApp
                </a>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  )
}
