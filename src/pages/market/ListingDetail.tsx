import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { JobTitleSelect } from '../../components/JobTitleSelect'
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Heart, MapPin, Share2, Star } from 'lucide-react'
import { usePublicProperties, useStore } from '../../context/AppStore'
import { useAuth } from '../../context/AuthContext'
import { ActionButtonRow } from '../../components/ActionButtonRow'
import { BackButton } from '../../components/BackButton'
import { Badge, Button, Input, Modal, cn } from '../../components/ui'
import { PageSkeleton } from '../../components/loading/PageSkeleton'
import { PropertyFeaturesDisplay } from '../../components/property-features/PropertyFeaturesDisplay'
import { ExpandableDescription } from '../../components/listing/ExpandableDescription'
import { RoomsAndFeatures } from '../../components/listing/RoomsAndFeatures'
import { formatZAR } from '../../data/seed'
import { PropertyCard } from '../../components/PropertyCard'
import { PropertyMap } from '../../components/PropertyMap'
import { ListingPhotoGallery } from '../../components/listing/ListingPhotoGallery'
import { ListingReviewsSection } from '../../components/reviews/ListingReviewsSection'
import { propertyListingRating } from '../../components/reviews/StarRating'
import {
  blockedPropertyIdsForApplicant,
  isApplicantBlockedOnProperty,
} from '../../lib/blockedApplicants'
import { useWishlist } from '../../hooks/useWishlist'
import { hasMappedCoordinates } from '../../lib/mapCoords'
import { acquireSubmitLock, releaseSubmitLock } from '../../lib/wizardSubmitGuard'
import { fetchPublicListingImages } from '../../lib/api/postgresClient'
import { NO_PHOTOS_YET, normalizeListingImages } from '../../lib/listingPhotos'
import { isPubliclyListed } from '../../lib/publicListings'
import { availableFromLabel } from '../../lib/availableFromLabel'
import { findByListingId } from '../../lib/listingIds'
import { isApiEnabled } from '../../lib/api/config'
import {
  fetchPublicListingSlice,
  mergeListingLookupState,
} from '../../lib/publicMarketplaceMerge'
import type { PostgresBootstrap } from '../../lib/api/postgresClient'
import { submitListingEnquiry } from '../../lib/api/listingEnquiryApi'
import { listingAvailabilityCopy } from '../../lib/listingLimitCopy'
import { sweetError, sweetSuccess, sweetWarning } from '../../lib/sweetAlert'
import type { EnquiryOutcome } from '../../lib/listingEnquiryOutcome'
import { applyLeadInput, enquirySubmitPlan } from '../../lib/listingEnquirySubmit'
import { EnquiryConfirmation } from '../../components/listing/EnquiryConfirmation'
import { usePageMeta } from '../../hooks/usePageMeta'
import { useAgentDisplay } from '../../hooks/useAgentDisplay'
import { listingHeadline } from '../../lib/agentDisplay'
import { StickyMobileActionBar } from '../../components/layout/mobile/StickyMobileActionBar'
import { FullScreenSheet } from '../../components/layout/mobile/FullScreenSheet'
import { isFutureViewingSlot } from '../../lib/viewingSlotTime'
import { findOwnApplicationForProperty } from '../../lib/applicantApplication'
import { rentalApplyButton } from '../../lib/applyEligibility'
import { fetchApplyEligibility } from '../../lib/api/viewingApply'
import { formatEmploymentSummary } from '../../lib/employmentDisplay'
import { prefillEnquiryContact } from './listingEnquiryPrefill'
import { publicAreaLabel, toPublicListing } from '../../lib/publicLocation'

type EnquiryIntent = 'lead' | 'viewing'

export default function ListingDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const enquiryAsideRef = useRef<HTMLElement | null>(null)
  const {
    state,
    createApplication,
    createLead,
    recordGuestEnquiry,
    hydratedForUserId,
    hydrationFailed,
    refreshMarketplaceListings,
  } = useStore()
  const publicProperties = usePublicProperties()
  const { user, isAuthenticated, has } = useAuth()
  const { viewerId } = useAgentDisplay()
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
  const [moveInDate, setMoveInDate] = useState('')
  const [employerName, setEmployerName] = useState('')
  const [jobTitle, setJobTitle] = useState('')
  const [intent, setIntent] = useState<EnquiryIntent>('lead')
  const [submitting, setSubmitting] = useState(false)
  // T3: the last enquiry outcome, shown inline until the next submit.
  const [enquiryOutcome_, setEnquiryOutcome] = useState<EnquiryOutcome | null>(null)
  const [appSubmitting, setAppSubmitting] = useState(false)
  // Pre-apply warning: applicants confirm they understand they should view the home first.
  const [viewWarningOpen, setViewWarningOpen] = useState(false)
  const [viewAcknowledged, setViewAcknowledged] = useState(false)
  const [applyEligibility, setApplyEligibility] = useState<{ eligible: boolean; reason: string } | null>(null)
  const [applyEligibilityLoading, setApplyEligibilityLoading] = useState(false)
  const enquiryLockRef = useRef(false)
  const applicationLockRef = useRef(false)
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

  const liveDataMode = isApiEnabled
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
    if (!id) return
    void refreshMarketplaceListings({ force: true })
  }, [id, refreshMarketplaceListings])

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
    if (!isAuthenticated) return
    setEmail((e) => prefillEnquiryContact(user, { email: e, firstName: '', lastName: '', phone: '' }).email)
    setFirstName((f) =>
      prefillEnquiryContact(user, { email: '', firstName: f, lastName: '', phone: '' }).firstName,
    )
    setLastName((l) =>
      prefillEnquiryContact(user, { email: '', firstName: '', lastName: l, phone: '' }).lastName,
    )
    setPhone((p) =>
      prefillEnquiryContact(user, { email: '', firstName: '', lastName: '', phone: p }).phone,
    )
  }, [isAuthenticated, user.email, user.name, user.firstName, user.lastName, user.phone])

  const blockedIds = useMemo(() => {
    if (!isAuthenticated || user.id === 'guest') return new Set<string>()
    return blockedPropertyIdsForApplicant(state.applications, user)
  }, [isAuthenticated, state.applications, user])

  const isListed =
    p != null && isPubliclyListed(p, { units: lookup.units, users: lookup.users })

  const listingDescription = p
    ? `${p.type} in ${p.suburb}, ${p.city}. ${p.description.trim().slice(0, 155)}${p.description.length > 155 ? '…' : ''}`
    : undefined

  // Same wait as the loading skeleton below: the tab title must not say
  // "not found" while the listing is still on its way.
  const listingStillLoading =
    !p &&
    (awaitingSignedInHydration ||
      (liveDataMode && Boolean(id) && !listingFetchDone) ||
      (!(state.properties.length > 0 || state.units.length > 0) && !retryWindowOver))
  usePageMeta({
    title: p?.title ?? (listingStillLoading ? 'Loading listing…' : 'Listing not found'),
    description: listingDescription,
    image: p?.images[0],
    path: id ? `/listing/${id}` : undefined,
    preloadImage: p?.images[0],
  })

  // P3a: list/bootstrap may carry one photo; detail loads the full gallery from the API.
  const [fullImages, setFullImages] = useState<string[] | null>(null)
  useEffect(() => {
    setFullImages(null)
  }, [id])
  useEffect(() => {
    if (!isApiEnabled || !id) return
    let live = true
    void fetchPublicListingImages(id).then((imgs) => {
      if (live && imgs) setFullImages(imgs)
    })
    return () => {
      live = false
    }
  }, [id])

  const existingApplication = useMemo(() => {
    if (!p || !isAuthenticated || user.id === 'guest') return null
    return findOwnApplicationForProperty(state.applications, user, p.id)
  }, [isAuthenticated, p, state.applications, user, user.id])

  useEffect(() => {
    if (!p || !isAuthenticated || user.id === 'guest' || p.listingMode === 'sale' || existingApplication) {
      setApplyEligibility(null)
      setApplyEligibilityLoading(false)
      return
    }
    let live = true
    setApplyEligibilityLoading(true)
    void fetchApplyEligibility(p.backendId || p.id).then((row) => {
      if (!live) return
      setApplyEligibility(row ?? { eligible: false, reason: 'VIEWING_REQUIRED' })
      setApplyEligibilityLoading(false)
    })
    return () => {
      live = false
    }
  }, [existingApplication, isAuthenticated, p, user.id])

  useEffect(() => {
    const wantsViewing = searchParams.get('viewing') === '1'
    if ((searchParams.get('apply') !== '1' && !wantsViewing) || !p || !isListed) return
    const sp = new URLSearchParams(searchParams)
    sp.delete('apply')
    sp.delete('viewing')
    setSearchParams(sp, { replace: true })
    // ?viewing=1 (e.g. from My enquiries) opens the form on Book a viewing.
    if (wantsViewing) setIntent('viewing')

    if (!wantsViewing && existingApplication) {
      navigate(
        `/workspace/portals/tenant/applications/${encodeURIComponent(existingApplication.id)}`,
        { replace: true },
      )
      return
    }

    const isDesktop = window.matchMedia('(min-width: 1024px)').matches
    if (isDesktop) {
      requestAnimationFrame(() => {
        enquiryAsideRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
    } else {
      setEnquirySheetOpen(true)
    }
  }, [
    existingApplication,
    isListed,
    navigate,
    p,
    searchParams,
    setSearchParams,
  ])

  if (!p) {
    const storeSettled = state.properties.length > 0 || state.units.length > 0
    const awaitingPublicListingFetch =
      liveDataMode && Boolean(id) && !listingFetchDone && !awaitingSignedInHydration
    if (awaitingSignedInHydration || awaitingPublicListingFetch || (!storeSettled && !retryWindowOver)) {
      return (
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
          <PageSkeleton variant="listing" label="Loading listing…" />
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
  const availability = listingAvailabilityCopy(p)
  const formsClosed = availability.viewingForm === 'hidden' && availability.enquiryForm === 'hidden'
  const activeIntent: EnquiryIntent =
    intent === 'viewing' && availability.viewingForm === 'hidden'
      ? 'lead'
      : intent === 'lead' && availability.enquiryForm === 'hidden'
        ? 'viewing'
        : intent
  const activeMode = activeIntent === 'viewing' ? availability.viewingForm : availability.enquiryForm
  const fullName = `${firstName.trim()} ${lastName.trim()}`.trim()

  const listingReviewAvg = propertyListingRating(state.reviews, p.id)
  const enquiryListing = {
    id: p.id,
    agencyId: p.agencyId,
    agentId: p.agentId,
    listingMode: p.listingMode,
    value: p.price ?? p.rent ?? 0,
  }
  const enquiryContact = { name: fullName, email: email.trim(), phone: phone.trim(), notes: note.trim() }

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

    const action: EnquiryIntent = activeIntent
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

    if (!acquireSubmitLock(enquiryLockRef)) return
    setSubmitting(true)
    setEnquiryOutcome(null)
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
        interestType: p.listingMode === 'sale' ? 'Buy' : 'Rent',
        value: p.price ?? p.rent ?? 0,
      })

      // T3: the server's answer is the only save. Show it inline and keep the
      // sheet open (no modal, no reset). What a result does is the pure plan
      // in listingEnquirySubmit.ts (F3); a repeat shows no reference (F4).
      const plan = enquirySubmitPlan(result, {
        listing: enquiryListing,
        contact: enquiryContact,
        action,
        slot: selectedSlot ? { id: selectedSlot.id, date: selectedSlot.date, time: selectedSlot.time } : null,
        agentName: agent?.name ?? null,
      })
      if (plan.record) recordGuestEnquiry(plan.record)
      setEnquiryOutcome(plan.outcome)
      if (plan.clearNote) setNote('')
      return result.ok
    } finally {
      setSubmitting(false)
      releaseSubmitLock(enquiryLockRef)
    }
  }

  const submitApplication = async () => {
    if (!acquireSubmitLock(applicationLockRef)) return
    if (!isAuthenticated) {
      releaseSubmitLock(applicationLockRef)
      navigate(`/register?next=${encodeURIComponent(`/listing/${p.id}`)}`)
      return
    }
    if (!fullName || !email.trim()) {
      await sweetWarning('Missing details', 'Please enter your name and email.')
      releaseSubmitLock(applicationLockRef)
      return
    }
    if (p.listingMode !== 'sale' && applyEligibility && !applyEligibility.eligible) {
      await sweetWarning('Viewing required', 'Book and attend a viewing first.')
      releaseSubmitLock(applicationLockRef)
      return
    }
    if (p.availableFrom && moveInDate && moveInDate < p.availableFrom) {
      await sweetWarning('Move-in date', `Choose a move-in date on or after ${p.availableFrom}.`)
      releaseSubmitLock(applicationLockRef)
      return
    }

    setAppSubmitting(true)
    try {
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
      employerName: employerName.trim() || undefined,
      jobTitle: jobTitle.trim() || undefined,
      employment: formatEmploymentSummary(employerName, jobTitle, ''),
      moveInDate: moveInDate || undefined,
    })

    if (appResult && 'status' in appResult && appResult.status === 'ERROR') {
      await sweetError('Application not submitted', appResult.error)
      return
    }

    // T3 B1: the application's lead is a NEW lead. A tenant's is saved to the
    // server (the portal policy allows a new lead; it refuses only re-saving
    // an existing one). A guest's (401), landlord's or contractor's (403) stays
    // local. The Register-interest lead is never re-saved by the client.
    createLead(applyLeadInput({ listing: enquiryListing, contact: enquiryContact, role: user.role }))

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
    } finally {
      setAppSubmitting(false)
      releaseSubmitLock(applicationLockRef)
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
      {availability.badge ? (
        <Badge className="mt-2 ml-2" tone="neutral">
          {availability.badge}
        </Badge>
      ) : null}
      {availability.spots ? <p className="mt-2 text-sm font-medium text-ink">{availability.spots}</p> : null}
      {p.availableFrom ? (
        <Badge className="mt-2 ml-2" tone="neutral">
          {availableFromLabel(p.availableFrom)}
        </Badge>
      ) : null}
    </>
  )

  const enquiryFormFields = (
    <>
      {formsClosed ? (
        <p className="text-sm text-ink-600">No longer taking enquiries.</p>
      ) : (
      <>
      <p className="text-xs text-ink-500">
        No account needed — your details are saved so an agent can follow up.
        {activeMode === 'waitlist' ? ' This listing is fully booked — join the waitlist.' : ''}
      </p>

      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {availability.enquiryForm !== 'hidden' && (
        <button
          type="button"
          onClick={() => setIntent('lead')}
          className={cn(
            'min-h-11 rounded-xl border px-3 py-2 text-left text-xs font-semibold transition-colors',
            activeIntent === 'lead'
              ? 'border-primary bg-primary-50 text-primary'
              : 'border-primary-100 text-ink-600 hover:bg-primary-50/60',
          )}
        >
          {availability.enquiryForm === 'waitlist' ? 'Join enquiry waitlist' : 'Register interest'}
          <span className="mt-0.5 block font-normal text-ink-500">Create a lead — no viewing required</span>
        </button>
        )}
        {availability.viewingForm !== 'hidden' && (
        <button
          type="button"
          onClick={() => setIntent('viewing')}
          className={cn(
            'min-h-11 rounded-xl border px-3 py-2 text-left text-xs font-semibold transition-colors',
            activeIntent === 'viewing'
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
        )}
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
          <>
            <Input
              type="number"
              placeholder="Monthly income (optional)"
              value={income}
              onChange={(e) => setIncome(e.target.value)}
            />
            <Input
              type="date"
              aria-label="Move-in date"
              value={moveInDate}
              min={p.availableFrom ?? undefined}
              onChange={(e) => setMoveInDate(e.target.value)}
            />
            <Input
              placeholder="Employer name (optional)"
              value={employerName}
              onChange={(e) => setEmployerName(e.target.value)}
            />
            <JobTitleSelect value={jobTitle} onChange={setJobTitle} agencyId={p.agencyId} />
          </>
        )}
        {activeIntent === 'viewing' && openSlots.length > 0 && (
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
        {activeIntent === 'viewing' && openSlots.length === 0 && (
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
        <EnquiryConfirmation outcome={enquiryOutcome_} />
        <Button type="submit" className="w-full min-h-11" disabled={submitting}>
          {submitting
            ? 'Saving…'
            : activeMode === 'waitlist'
              ? 'Join waitlist'
              : activeIntent === 'lead'
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
          <>
          <Modal
            open={viewWarningOpen}
            onClose={() => setViewWarningOpen(false)}
            title="View the property before you apply"
            description={p.title}
            footer={
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  variant="secondary"
                  className="min-h-11"
                  onClick={() => {
                    setViewWarningOpen(false)
                    setIntent('viewing')
                  }}
                >
                  Book a viewing
                </Button>
                <Button
                  className="min-h-11"
                  disabled={!viewAcknowledged || appSubmitting}
                  onClick={() => {
                    setViewWarningOpen(false)
                    void submitApplication()
                  }}
                >
                  Continue to apply
                </Button>
              </div>
            }
          >
            <div className="space-y-4 text-sm text-ink-600">
              <p>
                We strongly recommend viewing a home in person before you apply. Photos and descriptions can't show
                everything — the condition, the area, noise or parking.
              </p>
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-primary-100 bg-primary-50/40 p-3">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4"
                  checked={viewAcknowledged}
                  onChange={(e) => setViewAcknowledged(e.target.checked)}
                />
                <span>I understand I should view this property before applying, and I want to continue with my application.</span>
              </label>
            </div>
          </Modal>
          <RentalApplyButton
            isRent={isRent}
            loading={applyEligibilityLoading}
            eligibility={applyEligibility}
            submitting={appSubmitting}
            onApply={() => {
              setViewAcknowledged(false)
              setViewWarningOpen(true)
            }}
            onBook={() => setIntent('viewing')}
          />
          </>
        )}
      </div>
      </>
      )}
    </>
  )

  const mobileCtaLabel = formsClosed
    ? 'Fully booked'
    : activeMode === 'waitlist'
      ? 'Join waitlist'
      : activeIntent === 'lead'
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
          {normalizeListingImages(fullImages ?? p.images).length ? (
            <ListingPhotoGallery
              images={normalizeListingImages(fullImages ?? p.images)}
              title={p.title}
            />
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
                {listingHeadline(p.type, viewerId, p.agentId, agent?.name)}
              </p>
              {p.agentId && agent?.name && p.agentId !== viewerId ? (
                <Link to={`/profile/${encodeURIComponent(p.agentId)}`} className="text-sm font-semibold text-primary hover:underline">
                  View {agent.name.split(/\s+/)[0]}'s profile and reviews
                </Link>
              ) : null}
              <p className="text-sm text-ink-500">
                {[p.beds > 0 && `${p.beds} bedrooms`, p.baths > 0 && `${p.baths} bathrooms`, `${p.parking} parking`, `${p.area} m²`, `${p.rooms.length} configured rooms`]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </div>

            <RoomsAndFeatures beds={p.beds} baths={p.baths} parking={p.parking} garages={p.garages} area={p.area} rooms={p.rooms} />

            <div className="border-b border-primary-100 py-6">
              <h2 className="text-lg font-semibold">About this property</h2>
              <ExpandableDescription
                text={p.description}
                className="mt-3"
                containExpandedScroll
                expandedMaxHeightClass="max-h-[min(18rem,40vh)]"
              />
            </div>

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
              {/* Guests see the area only — never the street address or an exact pin. */}
              <p className="mt-1 text-sm text-ink-500">
                {publicAreaLabel(p)} · Approximate location — contact the agent for the exact address.
              </p>
              {hasMappedCoordinates(p) ? (
                <div className="mt-4 h-64 overflow-hidden rounded-2xl sm:h-80">
                  <PropertyMap
                    properties={[toPublicListing(p)]}
                    mode={p.listingMode === 'sale' ? 'buy' : 'rent'}
                    className="h-full"
                  />
                </div>
              ) : (
                <div className="mt-4 flex h-48 items-center justify-center rounded-2xl bg-primary-100">
                  <div className="rounded-2xl bg-white/90 px-5 py-4 text-center shadow">
                    <MapPin className="mx-auto h-6 w-6 text-ink-500" />
                    <p className="mt-1 font-semibold">{publicAreaLabel(p)}</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          <aside
            ref={enquiryAsideRef}
            className="hidden lg:block lg:sticky lg:top-24 lg:self-start"
          >
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
            disabled={formsClosed}
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

function RentalApplyButton({
  isRent,
  loading,
  eligibility,
  submitting,
  onApply,
  onBook,
}: {
  isRent: boolean
  loading: boolean
  eligibility: { eligible: boolean } | null
  submitting: boolean
  onApply: () => void
  onBook: () => void
}) {
  if (!isRent) {
    return (
      <Button type="button" variant="secondary" className="w-full min-h-11" disabled={submitting} onClick={onApply}>
        {submitting ? 'Submitting…' : 'Submit full application'}
      </Button>
    )
  }
  const control = rentalApplyButton(eligibility, loading)
  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="secondary"
        className="w-full min-h-11"
        disabled={submitting || control.disabled}
        onClick={onApply}
      >
        {submitting ? 'Submitting…' : control.label}
      </Button>
      {control.bookFirst ? (
        <button type="button" onClick={onBook} className="block w-full text-center text-xs font-semibold text-primary hover:underline">
          Book a viewing
        </button>
      ) : null}
    </div>
  )
}
