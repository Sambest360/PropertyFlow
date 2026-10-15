import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { Bath, BedDouble, Car, Heart, MapPin, Share2, Star } from 'lucide-react'
import { roomKindLabel } from '../../data/infrastructure'
import { usePublicProperties, useStore } from '../../context/AppStore'
import { useAuth } from '../../context/AuthContext'
import { ActionButtonRow } from '../../components/ActionButtonRow'
import { BackButton } from '../../components/BackButton'
import { Badge, Button, Input, cn } from '../../components/ui'
import { PropertyFeaturesDisplay } from '../../components/property-features/PropertyFeaturesDisplay'
import { ExpandableDescription } from '../../components/listing/ExpandableDescription'
import { formatZAR } from '../../data/seed'
import { PropertyCard } from '../../components/PropertyCard'
import { PropertyMap } from '../../components/PropertyMap'
import { ListingPhotoGallery } from '../../components/listing/ListingPhotoGallery'
import { ListingReviewsSection } from '../../components/reviews/ListingReviewsSection'
import { averageRating } from '../../components/reviews/StarRating'
import {
  blockedPropertyIdsForApplicant,
  isApplicantBlockedOnProperty,
} from '../../lib/blockedApplicants'
import { useWishlist } from '../../hooks/useWishlist'
import { hasMappedCoordinates } from '../../lib/mapCoords'
import { fetchPublicListingImages } from '../../lib/api/postgresClient'
import { NO_PHOTOS_YET } from '../../lib/listingPhotos'
import { isPubliclyListed } from '../../lib/publicListings'
import { findByListingId } from '../../lib/listingIds'
import { isApiEnabled, isSupabaseMode } from '../../lib/api/config'
import {
  fetchPublicListingSlice,
  mergeListingLookupState,
} from '../../lib/publicMarketplaceMerge'
import type { PostgresBootstrap } from '../../lib/api/postgresClient'
import { submitListingEnquiry } from '../../lib/api/listingEnquiryApi'
import { sweetError, sweetInfo, sweetSuccess, sweetWarning } from '../../lib/sweetAlert'
import { usePageMeta } from '../../hooks/usePageMeta'
import { useAgentDisplay } from '../../hooks/useAgentDisplay'
import { StickyMobileActionBar } from '../../components/layout/mobile/StickyMobileActionBar'
import { FullScreenSheet } from '../../components/layout/mobile/FullScreenSheet'
import { isFutureViewingSlot } from '../../lib/viewingSlotTime'

type EnquiryIntent = 'lead' | 'viewing'

export default function ListingDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { state, createApplication, createLead, recordGuestEnquiry, hydratedForUserId, hydrationFailed } =
    useStore()
  const publicProperties = usePublicProperties()
  const { user, isAuthenticated, has } = useAuth()
  const { listedBy } = useAgentDisplay()
  const [publicListingSlice, setPublicListingSlice] = useState<PostgresBootstrap | null>(null)
  const [listingFetchDone, setListingFetchDone] = useState(false)
  const lookup = useMemo(
    () =>
      mergeListingLookupState(
        {
          properties: state.properties,
          units: state.units,
          users: state.users,
          viewingSlots: state.viewingSlots,
        },
        publicListingSlice,
      ),
    [publicListingSlice, state.properties, state.units, state.users, state.viewingSlots],
  )
  const p = findByListingId(lookup.properties, id)
  const { saved, toggle } = useWishlist(isAuthenticated ? user.id : 'guest')
  const wishlisted = p ? saved(p.id) : false

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [note, setNote] = useState('')
  const [slotId, setSlotId] = useState('')
  const [income, setIncome] = useState('')
  const [idNumber, setIdNumber] = useState('')
  const [intent, setIntent] = useState<EnquiryIntent>('lead')
  const [submitting, setSubmitting] = useState(false)
  const [enquirySheetOpen, setEnquirySheetOpen] = useState(false)
  // P0-4 (R4): guest direct-URL opens used to flash "Listing not found" while
  // the public bootstrap was still in flight. Give the store a short window
  // (capped, so a genuinely dead link still resolves to not-found) before
  // declaring the listing missing.
  const [retryWindowOver, setRetryWindowOver] = useState(false)
  useEffect(() => {
    const t = window.setTimeout(() => setRetryWindowOver(true), 6000)
    return () => window.clearTimeout(t)
  }, [])

  const liveDataMode = isApiEnabled || isSupabaseMode
  const awaitingSignedInHydration =
    liveDataMode &&
    isAuthenticated &&
    user.id !== 'guest' &&
    hydratedForUserId !== user.id &&
    !hydrationFailed

  useEffect(() => {
    setPublicListingSlice(null)
    setListingFetchDone(false)
  }, [id, user.id])

  useEffect(() => {
    if (!id || p || awaitingSignedInHydration) return
    let live = true
    void fetchPublicListingSlice(id, 12_000).then((slice) => {
      if (!live) return
      if (slice) setPublicListingSlice(slice)
      setListingFetchDone(true)
    })
    return () => {
      live = false
    }
  }, [awaitingSignedInHydration, id, p])

  useEffect(() => {
    if (isAuthenticated && user.email) {
      setEmail((e) => e || user.email)
      const parts = user.name.trim().split(/\s+/)
      setFirstName((f) => f || parts[0] || '')
      setLastName((l) => l || parts.slice(1).join(' ') || '')
    }
  }, [isAuthenticated, user.email, user.name])

  const blockedIds = useMemo(() => {
    if (!isAuthenticated || user.id === 'guest') return new Set<string>()
    return blockedPropertyIdsForApplicant(state.applications, user)
  }, [isAuthenticated, state.applications, user])

  const isListed =
    p != null && isPubliclyListed(p, { units: lookup.units, users: lookup.users })

  const listingDescription = p
    ? `${p.type} in ${p.suburb}, ${p.city}. ${p.description.trim().slice(0, 155)}${p.description.length > 155 ? '…' : ''}`
    : undefined

  usePageMeta({
    title: p?.title ?? 'Listing not found',
    description: listingDescription,
    image: p?.images[0],
    path: id ? `/listing/${id}` : undefined,
    preloadImage: p?.images[0],
  })

  // P3a: guest list payloads carry one photo per listing; load the rest here.
  const [fullImages, setFullImages] = useState<string[] | null>(null)
  const listingKey = p?.id
  const shownCount = p?.images.length ?? 0
  useEffect(() => {
    if (!listingKey || shownCount > 1) return
    let live = true
    void fetchPublicListingImages(listingKey).then((imgs) => {
      if (live && imgs && imgs.length > shownCount) setFullImages(imgs)
    })
    return () => {
      live = false
    }
  }, [listingKey, shownCount])

  if (!p) {
    const storeSettled = state.properties.length > 0 || state.units.length > 0
    const awaitingPublicListingFetch =
      liveDataMode && Boolean(id) && !listingFetchDone && !awaitingSignedInHydration
    if (awaitingSignedInHydration || awaitingPublicListingFetch || (!storeSettled && !retryWindowOver)) {
      return (
        <div className="mx-auto max-w-3xl px-4 py-16 text-center" role="status" aria-live="polite">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-primary-100 border-t-primary" />
          <p className="mt-4 font-semibold text-ink">Loading listing…</p>
          <p className="mt-2 text-sm text-ink-500">Fetching the latest listing details.</p>
        </div>
      )
    }
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <p className="font-semibold text-ink">Listing not found</p>
        <p className="mt-2 text-sm text-ink-500">It may have been unpublished or the link is outdated.</p>
        <div className="mt-6 flex justify-center">
          <BackButton to="/browse" label="Back to browse" />
        </div>
      </div>
    )
  }

  // P0-1 / P2-3: the property exists but is not on the public market —
  // show a clear state with a staff next-action instead of a dead end.
  if (!isListed) {
    const staffCanFix = isAuthenticated && (has('listings.publish') || has('assets.manage'))
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <p className="font-semibold text-ink">This listing isn’t published yet</p>
        <p className="mt-2 text-sm text-ink-500">
          “{p.title}” exists but is not visible to the public while its status is “{p.status}”.
        </p>
        {staffCanFix ? (
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link
              to={`/workspace/properties/${p.id}`}
              className="inline-flex min-h-11 items-center rounded-full bg-primary px-5 text-sm font-semibold text-white transition-colors duration-200 hover:bg-primary-600"
            >
              Open in workspace & publish
            </Link>
          </div>
        ) : (
          <p className="mt-4 text-sm text-ink-500">
            The listing agent has been notified — check back soon.
          </p>
        )}
        <div className="mt-6 flex justify-center">
          <BackButton to="/browse" label="Back to browse" />
        </div>
      </div>
    )
  }

  const existingApplication = useMemo(() => {
    if (!isAuthenticated || user.id === 'guest') return null
    const email = user.email?.trim().toLowerCase()
    return (
      state.applications.find(
        (a) =>
          a.propertyId === p.id &&
          (a.applicantUserId === user.id || (email && a.email?.trim().toLowerCase() === email)),
      ) ?? null
    )
  }, [isAuthenticated, p.id, state.applications, user.email, user.id])

  const isBlockedForUser = blockedIds.has(p.id)
  const agentUser = p.agentId ? state.users.find((u) => u.id === p.agentId) : undefined
  // Guests get no users list; the public marketplace sends the agent's display name only.
  const agent = agentUser ?? (p.agentName ? { name: p.agentName } : undefined)
  const similar = publicProperties
    .filter(
      (x) =>
        x.id !== p.id &&
        x.city === p.city &&
        !blockedIds.has(x.id),
    )
    .slice(0, 3)
  const openSlots = lookup.viewingSlots.filter(
    (s) => s.propertyId === p.id && s.status === 'Open' && isFutureViewingSlot(s),
  )
  const isRent = p.listingMode !== 'sale'
  const fullName = `${firstName.trim()} ${lastName.trim()}`.trim()

  const listingReviewAvg = averageRating(
    state.reviews.filter(
      (r) =>
        r.propertyId === p.id &&
        (r.targetType === 'property' || r.targetType === 'application'),
    ),
  )

  if (isBlockedForUser) {
    return <Navigate to="/browse" replace />
  }

  const submitEnquiry = async (e: FormEvent) => {
    e.preventDefault()
    if (!firstName.trim() || !lastName.trim() || !email.trim()) {
      await sweetWarning('Missing details', 'Please enter your name, surname, and email.')
      return
    }
    if (!phone.trim()) {
      await sweetWarning('Missing phone', 'Please enter a phone number so an agent can reach you.')
      return
    }
    if (
      isApplicantBlockedOnProperty(state.applications, p.id, {
        userId: user.id,
        email: email.trim(),
        name: fullName,
      })
    ) {
      await sweetError('Unable to submit', 'You are blocked from viewing or applying to this property.')
      return
    }

    const action: EnquiryIntent = intent
    const selectedSlot =
      action === 'viewing' && openSlots.length > 0
        ? openSlots.find((s) => s.id === (slotId || openSlots[0]?.id))
        : null

    if (action === 'viewing' && openSlots.length > 0 && !selectedSlot) {
      await sweetWarning(
        'Slot unavailable',
        'That viewing time has passed or is no longer open. Choose another slot or request a viewing without a slot.',
      )
      return
    }

    setSubmitting(true)
    try {
      const result = await submitListingEnquiry({
        propertyId: p.id,
        agencyId: p.agencyId,
        agentId: p.agentId,
        action,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        notes: note.trim() || undefined,
        slotId: selectedSlot?.id ?? null,
        monthlyIncome: isRent && income ? Number(income) : null,
        idNumber: idNumber.trim() || undefined,
        interestType: p.listingMode === 'sale' ? 'Buy' : 'Rent',
        value: p.price ?? p.rent ?? 0,
      })

      if (!result.ok) {
        await sweetError('Could not save enquiry', 'error' in result ? result.error : 'Unknown error')
        return
      }

      recordGuestEnquiry({
        lead: {
          id: result.leadId,
          agencyId: p.agencyId,
          propertyId: p.id,
          agentId: p.agentId,
          name: fullName,
          email: email.trim(),
          phone: phone.trim(),
          channel: 'Web Form',
          type: p.listingMode === 'sale' ? 'Buy' : 'Rent',
          value: p.price ?? p.rent ?? 0,
          stage: result.stage,
          notes: note.trim(),
        },
        viewing:
          action === 'viewing' && selectedSlot
            ? {
                id: result.bookingId ?? undefined,
                agencyId: p.agencyId,
                propertyId: p.id,
                agentId: p.agentId,
                slotId: selectedSlot.id,
                applicantName: fullName,
                applicantEmail: email.trim(),
                date: selectedSlot.date,
                time: selectedSlot.time,
              }
            : null,
      })

      if (action === 'viewing' && selectedSlot) {
        await sweetSuccess(
          'Viewing booked',
          `Your slot is ${selectedSlot.date} at ${selectedSlot.time}. ${agent?.name ?? 'The agency'} will confirm shortly.`,
        )
      } else if (action === 'viewing') {
        await sweetInfo(
          'Viewing request sent',
          'No open slots right now — an agent will contact you to schedule a time.',
        )
      } else {
        await sweetSuccess(
          'Interest registered',
          `${agent?.name ?? 'The agency'} will follow up on this property. No account needed.`,
        )
      }
      setNote('')
      setEnquirySheetOpen(false)
      return true
    } finally {
      setSubmitting(false)
    }
    return false
  }

  const submitApplication = async () => {
    if (!isAuthenticated) {
      navigate(`/register?next=${encodeURIComponent(`/listing/${p.id}`)}`)
      return
    }
    if (!fullName || !email.trim()) {
      await sweetWarning('Missing details', 'Please enter your name and email.')
      return
    }

    const appResult = await createApplication({
      agencyId: p.agencyId,
      propertyId: p.id,
      agentId: p.agentId,
      applicantUserId: user.id,
      applicantName: fullName,
      email: email.trim(),
      phone: phone.trim(),
      type: isRent ? 'Rental' : 'Purchase',
      income: Number(income) || 0,
      employment: 'Declared on application',
      idNumberOrPassport: idNumber.trim(),
      uploadedDocs: {
        bankStatementsUrl: 'https://yourplatform.co.za/docs/bank',
        idCopyUrl: 'https://yourplatform.co.za/docs/id',
        payslipUrl: 'https://yourplatform.co.za/docs/payslip',
      },
    })

    if (appResult && 'status' in appResult && appResult.status === 'ERROR') {
      await sweetError('Application not submitted', appResult.error)
      return
    }

    createLead({
      agencyId: p.agencyId,
      propertyId: p.id,
      agentId: p.agentId,
      name: fullName,
      email: email.trim(),
      phone: phone.trim(),
      channel: 'Web Form',
      type: isRent ? 'Rent' : 'Buy',
      value: p.price ?? p.rent ?? 0,
      stage: 'Application Submitted',
      notes: note.trim(),
    })

    // P1-2: the applicant gets their reference number immediately.
    const appRef =
      appResult && !('status' in appResult && appResult.status === 'ERROR')
        ? (appResult as unknown as { id: string }).id
        : null
    await sweetSuccess(
      'Application submitted',
      appRef
        ? `Your reference is ${appRef}. Track progress in your tenant portal under Applications.`
        : 'Track progress in your tenant portal under Applications.',
    )
    if (appRef) {
      navigate(`/workspace/portals/tenant/applications/${encodeURIComponent(appRef)}`)
    }
  }

  const applyHref = `/register?next=${encodeURIComponent(`/listing/${p.id}`)}`

  const priceBlock = (
    <>
      <p className="tabular text-2xl font-bold text-ink">
        {p.listingMode === 'rent' || (p.listingMode === 'both' && !p.price) ? (
          <>
            {formatZAR(p.rent)}
            <span className="text-base font-medium text-ink-500"> / month</span>
          </>
        ) : (
          formatZAR(p.price)
        )}
      </p>
      {p.listingMode === 'both' && p.price != null && p.rent != null && (
        <p className="mt-1 tabular text-sm text-ink-500">
          or {formatZAR(p.rent)} / month to rent
        </p>
      )}
      <Badge className="mt-2" tone="brand">
        {p.listingMode === 'both' ? 'Sale or rent' : p.listingMode === 'sale' ? 'For sale' : 'To rent'}
      </Badge>
    </>
  )

  const enquiryFormFields = (
    <>
      <p className="text-xs text-ink-500">
        No account needed — your details are saved so an agent can follow up.
      </p>

      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => setIntent('lead')}
          className={cn(
            'min-h-11 rounded-xl border px-3 py-2 text-left text-xs font-semibold transition-colors',
            intent === 'lead'
              ? 'border-primary bg-primary-50 text-primary'
              : 'border-primary-100 text-ink-600 hover:bg-primary-50/60',
          )}
        >
          Register interest
          <span className="mt-0.5 block font-normal text-ink-500">Create a lead — no viewing required</span>
        </button>
        <button
          type="button"
          onClick={() => setIntent('viewing')}
          className={cn(
            'min-h-11 rounded-xl border px-3 py-2 text-left text-xs font-semibold transition-colors',
            intent === 'viewing'
              ? 'border-primary bg-primary-50 text-primary'
              : 'border-primary-100 text-ink-600 hover:bg-primary-50/60',
          )}
        >
          {openSlots.length > 0 ? 'Book a viewing' : 'Request viewing'}
          <span className="mt-0.5 block font-normal text-ink-500">
            {openSlots.length > 0
              ? 'Pick an agent slot below'
              : 'No slots yet — we will schedule with you'}
          </span>
        </button>
      </div>

      <div className="mt-4 space-y-3">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Input placeholder="First name" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
          <Input placeholder="Surname" value={lastName} onChange={(e) => setLastName(e.target.value)} required />
        </div>
        <Input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <Input
          type="tel"
          placeholder="Phone"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          required
        />
        {isRent && (
          <Input
            type="number"
            placeholder="Monthly income (optional)"
            value={income}
            onChange={(e) => setIncome(e.target.value)}
          />
        )}
        <Input
          placeholder="SA ID or passport (optional)"
          value={idNumber}
          onChange={(e) => setIdNumber(e.target.value)}
        />
        {intent === 'viewing' && openSlots.length > 0 && (
          <select
            className="h-11 w-full rounded-xl border border-primary-100 bg-white px-3 text-base sm:text-sm"
            value={slotId || openSlots[0]?.id}
            onChange={(e) => setSlotId(e.target.value)}
          >
            {openSlots.map((s) => (
              <option key={s.id} value={s.id}>
                {s.date} at {s.time} ({s.capacity - s.booked} left)
              </option>
            ))}
          </select>
        )}
        {intent === 'viewing' && openSlots.length === 0 && (
          <p className="rounded-xl bg-primary-50 px-3 py-2 text-xs text-ink-600">
            No open viewing slots on this listing yet. Submit the form and the agent will
            propose a time with you directly — no slots are being missed.
          </p>
        )}
        <textarea
          className="w-full rounded-xl border border-primary-100 px-3 py-2 text-base sm:text-sm"
          rows={3}
          placeholder="Notes for the agent…"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <Button type="submit" className="w-full min-h-11" disabled={submitting}>
          {submitting
            ? 'Saving…'
            : intent === 'lead'
              ? 'Register interest'
              : openSlots.length > 0
                ? 'Book viewing slot'
                : 'Request viewing'}
        </Button>
        {!isAuthenticated ? (
          <div className="space-y-2">
            <Link to={applyHref}>
              <Button type="button" variant="secondary" className="w-full min-h-11">
                Register to apply formally
              </Button>
            </Link>
            <Link
              to={`/login?next=${encodeURIComponent(`/listing/${p.id}`)}`}
              className="block text-center text-xs font-semibold text-primary hover:underline"
            >
              Already have an account? Sign in
            </Link>
          </div>
        ) : existingApplication ? (
          <Link
            to={`/workspace/portals/tenant/applications/${encodeURIComponent(existingApplication.id)}`}
            className="block"
          >
            <Button type="button" variant="secondary" className="w-full min-h-11">
              Application submitted — view status
            </Button>
          </Link>
        ) : (
          <Button type="button" variant="secondary" className="w-full min-h-11" onClick={submitApplication}>
            Submit full application
          </Button>
        )}
      </div>
    </>
  )

  const mobileCtaLabel =
    intent === 'lead'
      ? 'Register interest'
      : openSlots.length > 0
        ? 'Book viewing'
        : 'Request viewing'

  return (
    <div className="bg-white pb-24 lg:pb-0">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="font-display text-2xl font-semibold text-ink sm:text-3xl">{p.title}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-3 text-sm text-ink-500">
              {listingReviewAvg != null ? (
                <a
                  href="#reviews"
                  className="inline-flex cursor-pointer items-center gap-1 font-semibold text-ink hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <Star className="h-4 w-4 fill-accent text-accent" aria-hidden /> {listingReviewAvg}
                </a>
              ) : (
                <a
                  href="#reviews"
                  className="inline-flex cursor-pointer items-center gap-1 font-semibold text-ink-500 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <Star className="h-4 w-4 text-ink-300" aria-hidden /> No reviews yet
                </a>
              )}
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-4 w-4" />
                {p.suburb}, {p.city}
              </span>
            </p>
          </div>
          <ActionButtonRow className="sm:w-auto">
            <button type="button" className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-primary-100 px-4 py-2 text-sm font-semibold hover:bg-primary-50">
              <Share2 className="h-4 w-4" /> Share
            </button>
            <button
              type="button"
              onClick={() => p && toggle(p.id)}
              className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-primary-100 px-4 py-2 text-sm font-semibold transition-colors duration-200 hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              aria-pressed={wishlisted}
            >
              <Heart className={cn('h-4 w-4', wishlisted && 'fill-accent text-accent')} />
              {wishlisted ? 'Saved' : 'Save'}
            </button>
            <BackButton to="/browse" label="Back to search" />
          </ActionButtonRow>
        </div>

        <div className="mt-6">
          {(fullImages ?? p.images).length ? (
            <ListingPhotoGallery images={fullImages ?? p.images} title={p.title} />
          ) : (
            <div className="flex aspect-[16/7] items-center justify-center rounded-2xl bg-primary-50 text-sm font-medium text-ink-500">
              {NO_PHOTOS_YET}
            </div>
          )}
        </div>

        <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_380px]">
          <div>
            <div className="border-b border-primary-100 pb-6">
              <p className="text-lg font-semibold text-ink">
                {(() => {
                  const by = listedBy(p.agentId, agent?.name)
                  return by ? `${p.type} · listed by ${by}` : p.type
                })()}
              </p>
              <p className="text-sm text-ink-500">
                {[p.beds > 0 && `${p.beds} bedrooms`, p.baths > 0 && `${p.baths} bathrooms`, `${p.parking} parking`, `${p.area} m²`, `${p.rooms.length} configured rooms`]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </div>

            <div className="grid gap-4 border-b border-primary-100 py-6 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { icon: BedDouble, label: 'Bedrooms', value: p.beds || '—' },
                { icon: Bath, label: 'Bathrooms', value: p.baths || '—' },
                ...(p.garages != null && p.garages > 0
                  ? [{ icon: Car, label: 'Garages', value: p.garages }]
                  : []),
                { icon: Car, label: 'Parking', value: p.parking },
              ].map((s) => (
                <div key={s.label} className="rounded-2xl bg-primary-50 p-4">
                  <s.icon className="h-5 w-5 text-ink-500" />
                  <p className="mt-2 text-xs text-ink-500">{s.label}</p>
                  <p className="tabular text-lg font-semibold">{s.value}</p>
                </div>
              ))}
            </div>

            <div className="border-b border-primary-100 py-6">
              <h2 className="text-lg font-semibold">About this property</h2>
              <ExpandableDescription
                text={p.description}
                className="mt-3"
                containExpandedScroll
                expandedMaxHeightClass="max-h-[min(18rem,40vh)]"
              />
            </div>

            {p.rooms.length > 0 && (
              <div className="border-b border-primary-100 py-6">
                <h2 className="text-lg font-semibold">Room configuration</h2>
                <ul className="mt-3 space-y-2">
                  {p.rooms.map((r) => (
                    <li key={r.id} className="flex justify-between rounded-xl bg-primary-50 px-3 py-2 text-sm">
                      <span>{r.name}</span>
                      <span className="text-ink-500">
                        {r.kind === 'bedroom' && `${r.beds} bed${r.beds === 1 ? '' : 's'}`}
                        {r.kind === 'bathroom' && `${r.baths} bath${r.baths === 1 ? '' : 's'}`}
                        {r.kind === 'garage' && 'Garage'}
                        {r.kind && !['bedroom', 'bathroom', 'garage'].includes(r.kind) &&
                          roomKindLabel(r.kind as Parameters<typeof roomKindLabel>[0])}
                        {!r.kind && (r.beds > 0 || r.baths > 0) && `${r.beds} bed · ${r.baths} bath`}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="border-b border-primary-100 py-6">
              <h2 className="text-lg font-semibold">What this place offers</h2>
              <div className="mt-4">
                <PropertyFeaturesDisplay amenities={p.amenities} />
              </div>
            </div>

            <ListingReviewsSection
              propertyId={p.id}
              agencyId={p.agencyId}
              agentId={p.agentId}
              agentName={agent?.name}
            />

            <div className="py-6">
              <h2 className="text-lg font-semibold">Location</h2>
              <p className="mt-1 text-sm text-ink-500">
                {p.formattedAddress ?? p.address}
                {(p.suburb || p.city) && (
                  <>
                    {' · '}
                    {[p.suburb, p.city].filter(Boolean).join(', ')}
                  </>
                )}
              </p>
              {hasMappedCoordinates(p) ? (
                <div className="mt-4 h-64 overflow-hidden rounded-2xl sm:h-80">
                  <PropertyMap properties={[p]} mode={p.listingMode === 'sale' ? 'buy' : 'rent'} className="h-full" />
                </div>
              ) : (
                <div className="mt-4 flex h-48 items-center justify-center rounded-2xl bg-primary-100">
                  <div className="rounded-2xl bg-white/90 px-5 py-4 text-center shadow">
                    <MapPin className="mx-auto h-6 w-6 text-ink-500" />
                    <p className="mt-1 font-semibold">{p.address}</p>
                    <p className="text-xs text-ink-500">
                      {p.suburb}, {p.city}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          <aside className="hidden lg:block lg:sticky lg:top-24 lg:self-start">
            <form onSubmit={submitEnquiry} className="rounded-3xl border border-primary-100 bg-white p-5 shadow-lg shadow-ink/5">
              {priceBlock}
              {enquiryFormFields}
            </form>
          </aside>
        </div>

        <StickyMobileActionBar>
          <Button
            type="button"
            className="w-full min-h-11"
            onClick={() => setEnquirySheetOpen(true)}
          >
            {mobileCtaLabel}
          </Button>
        </StickyMobileActionBar>

        <FullScreenSheet
          open={enquirySheetOpen}
          onClose={() => setEnquirySheetOpen(false)}
          title={mobileCtaLabel}
        >
          <form onSubmit={submitEnquiry} className="h-full overflow-y-auto p-4">
            {priceBlock}
            {enquiryFormFields}
          </form>
        </FullScreenSheet>

        {similar.length > 0 && (
          <section className="mt-14 border-t border-primary-100 pt-10">
            <h2 className="font-display text-2xl font-semibold">More in {p.city}</h2>
            <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {similar.map((s) => (
                <PropertyCard key={s.id} property={s} />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
