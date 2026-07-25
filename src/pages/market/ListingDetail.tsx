import { useMemo, useState, type FormEvent } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { ArrowLeft, Bath, BedDouble, Car, Heart, MapPin, Share2, Star } from 'lucide-react'
import { useStore } from '../../context/AppStore'
import { useAuth } from '../../context/AuthContext'
import { Badge, Button, Input } from '../../components/ui'
import { PropertyFeaturesDisplay } from '../../components/property-features/PropertyFeaturesDisplay'
import { formatZAR } from '../../data/seed'
import { PropertyCard } from '../../components/PropertyCard'
import { minimumRequiredIncome, resolveUnitForProperty } from '../../lib/applicationApi'
import {
  blockedPropertyIdsForApplicant,
  isApplicantBlockedOnProperty,
} from '../../lib/blockedApplicants'

export default function ListingDetail() {
  const { id } = useParams()
  const { state, createApplication, createLead, bookViewingSlot } = useStore()
  const { user } = useAuth()
  const p = state.properties.find((x) => x.id === id) ?? state.properties[0]
  const blockedIds = useMemo(
    () => blockedPropertyIdsForApplicant(state.applications, user),
    [state.applications, user],
  )
  const isBlockedForUser = blockedIds.has(p.id)
  const unit = resolveUnitForProperty(p, state.units)
  const agent = state.users.find((u) => u.id === p.agentId)
  const similar = state.properties
    .filter(
      (x) =>
        x.id !== p.id &&
        x.city === p.city &&
        ['Published', 'Featured', 'Under Offer'].includes(x.status) &&
        !blockedIds.has(x.id),
    )
    .slice(0, 3)
  const openSlots = state.viewingSlots.filter((s) => s.propertyId === p.id && s.status === 'Open')
  const isRent = p.listingMode !== 'sale'
  const rent = p.rent ?? unit?.rent ?? 0
  const minIncome = rent > 0 ? minimumRequiredIncome(rent) : 0
  const accepting =
    !isBlockedForUser &&
    !['Rented', 'Sold', 'Archived'].includes(p.status) &&
    (!unit || (unit.listingType !== 'not_listed' && unit.statusKey !== 'OCCUPIED'))

  const [name, setName] = useState('')
  const [contact, setContact] = useState('')
  const [note, setNote] = useState('')
  const [slotId, setSlotId] = useState('')
  const [income, setIncome] = useState('')
  const [idNumber, setIdNumber] = useState('')
  const [done, setDone] = useState('')

  const emailOf = () =>
    contact.includes('@') ? contact.trim() : `${name.replace(/\s+/g, '.').toLowerCase()}@email.com`
  const phoneOf = () => (contact.includes('@') ? '' : contact.trim())

  if (isBlockedForUser) {
    return <Navigate to="/browse" replace />
  }

  const submitViewing = (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !contact.trim()) return
    if (!accepting) {
      setDone('This property is not accepting viewings or applications.')
      return
    }
    if (
      isApplicantBlockedOnProperty(state.applications, p.id, {
        userId: user.id,
        email: emailOf(),
        name: name.trim(),
      })
    ) {
      setDone('You are blocked from viewing or applying to this property.')
      return
    }
    const slot = openSlots.find((s) => s.id === (slotId || openSlots[0]?.id))
    createLead({
      agencyId: p.agencyId,
      propertyId: p.id,
      agentId: p.agentId,
      name: name.trim(),
      email: emailOf(),
      phone: phoneOf(),
      channel: 'Web Form',
      type: p.listingMode === 'sale' ? 'Buy' : 'Rent',
      value: p.price ?? p.rent ?? 0,
      stage: 'Viewing Scheduled',
    })
    if (slot) {
      const booked = bookViewingSlot(slot.id, name.trim(), emailOf())
      if (!booked) {
        setDone('Unable to book this viewing — you may be blocked for this property.')
        return
      }
      setDone(`Viewing booked for ${slot.date} at ${slot.time}. The agency will confirm.`)
    } else {
      setDone('No open slots — an agent will contact you to schedule.')
    }
    setNote('')
  }

  const submitApplication = () => {
    if (!name.trim() || !contact.trim()) {
      setDone('Please enter your name and email/phone first.')
      return
    }
    if (!accepting) {
      setDone('This property is not accepting applications.')
      return
    }
    const result = createApplication({
      agencyId: p.agencyId,
      propertyId: p.id,
      agentId: p.agentId,
      applicantName: name.trim(),
      email: emailOf(),
      phone: phoneOf(),
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

    if (result && 'status' in result && result.status === 'ERROR') {
      setDone(result.error)
      return
    }

    createLead({
      agencyId: p.agencyId,
      propertyId: p.id,
      agentId: p.agentId,
      name: name.trim(),
      email: emailOf(),
      phone: phoneOf(),
      channel: 'Web Form',
      type: isRent ? 'Rent' : 'Buy',
      value: p.price ?? p.rent ?? 0,
      stage: 'Application Submitted',
    })
    setDone('Application submitted to the agency review workflow. Continue in the Tenant portal after signing in.')
  }

  return (
    <div className="bg-white">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <Link to="/browse" className="inline-flex items-center gap-2 text-sm font-medium text-ink-500 hover:text-ink">
          <ArrowLeft className="h-4 w-4" /> Back to search
        </Link>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="font-display text-2xl font-semibold text-ink sm:text-3xl">{p.title}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-3 text-sm text-ink-500">
              <span className="inline-flex items-center gap-1 font-semibold text-ink">
                <Star className="h-4 w-4 fill-accent text-accent" /> 4.8
              </span>
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-4 w-4" />
                {p.suburb}, {p.city}
              </span>
            </p>
          </div>
          <div className="flex gap-2">
            <button type="button" className="inline-flex items-center gap-2 rounded-full border border-primary-100 px-4 py-2 text-sm font-semibold hover:bg-primary-50">
              <Share2 className="h-4 w-4" /> Share
            </button>
            <button type="button" className="inline-flex items-center gap-2 rounded-full border border-primary-100 px-4 py-2 text-sm font-semibold hover:bg-primary-50">
              <Heart className="h-4 w-4" /> Save
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-2 overflow-hidden rounded-3xl sm:h-[420px] sm:grid-cols-4 sm:grid-rows-2">
          <div className="sm:col-span-2 sm:row-span-2">
            <img src={p.images[0]} alt="" className="h-56 w-full object-cover sm:h-full" />
          </div>
          {(p.images.length > 1 ? p.images.slice(1, 5) : [p.images[0], p.images[0], p.images[0], p.images[0]]).map((src, i) => (
            <div key={i} className="hidden overflow-hidden sm:block">
              <img src={src} alt="" className="h-full w-full object-cover" />
            </div>
          ))}
        </div>

        <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_380px]">
          <div>
            <div className="border-b border-primary-100 pb-6">
              <p className="text-lg font-semibold text-ink">
                {p.type} · listed by {agent?.name ?? 'Agency agent'}
              </p>
              <p className="text-sm text-ink-500">
                {[p.beds > 0 && `${p.beds} bedrooms`, p.baths > 0 && `${p.baths} bathrooms`, `${p.parking} parking`, `${p.area} m²`, `${p.rooms.length} configured rooms`]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </div>

            <div className="grid gap-4 border-b border-primary-100 py-6 sm:grid-cols-3">
              {[
                { icon: BedDouble, label: 'Bedrooms', value: p.beds || '—' },
                { icon: Bath, label: 'Bathrooms', value: p.baths || '—' },
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
              <p className="mt-3 text-sm leading-relaxed text-ink-600">{p.description}</p>
            </div>

            {p.rooms.length > 0 && (
              <div className="border-b border-primary-100 py-6">
                <h2 className="text-lg font-semibold">Room configuration</h2>
                <ul className="mt-3 space-y-2">
                  {p.rooms.map((r) => (
                    <li key={r.id} className="flex justify-between rounded-xl bg-primary-50 px-3 py-2 text-sm">
                      <span>{r.name}</span>
                      <span className="text-ink-500">
                        {r.beds} bed · {r.baths} bath
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

            <div className="py-6">
              <h2 className="text-lg font-semibold">Location</h2>
              <div className="mt-4 flex h-48 items-center justify-center rounded-2xl bg-primary-100">
                <div className="rounded-2xl bg-white/90 px-5 py-4 text-center shadow">
                  <MapPin className="mx-auto h-6 w-6 text-ink-500" />
                  <p className="mt-1 font-semibold">{p.address}</p>
                  <p className="text-xs text-ink-500">
                    {p.suburb}, {p.city}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <aside className="lg:sticky lg:top-24 lg:self-start">
            <form onSubmit={submitViewing} className="rounded-3xl border border-primary-100 bg-white p-5 shadow-lg shadow-ink/5">
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

              {!accepting && (
                <p className="mt-3 rounded-xl bg-accent/10 px-3 py-2 text-xs text-ink">
                  Not accepting applications (occupied or unlisted).
                </p>
              )}
              {done && <p className="mt-3 rounded-xl bg-primary-50 px-3 py-2 text-xs text-ink">{done}</p>}

              <div className="mt-4 space-y-3">
                <Input placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} required />
                <Input placeholder="Email or phone" value={contact} onChange={(e) => setContact(e.target.value)} required />
                {isRent && (
                  <Input
                    type="number"
                    placeholder={minIncome ? `Monthly income (min ${formatZAR(minIncome)})` : 'Monthly income (ZAR)'}
                    value={income}
                    onChange={(e) => setIncome(e.target.value)}
                  />
                )}
                <Input
                  placeholder="SA ID or passport"
                  value={idNumber}
                  onChange={(e) => setIdNumber(e.target.value)}
                />
                {openSlots.length > 0 ? (
                  <select
                    className="h-10 w-full rounded-xl border border-primary-100 bg-white px-3 text-sm"
                    value={slotId || openSlots[0]?.id}
                    onChange={(e) => setSlotId(e.target.value)}
                  >
                    {openSlots.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.date} at {s.time} ({s.capacity - s.booked} left)
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="rounded-xl bg-primary-50 px-3 py-2 text-xs text-ink-500">No open slots yet — request and the agent will schedule.</p>
                )}
                <textarea
                  className="w-full rounded-xl border border-primary-100 px-3 py-2 text-sm"
                  rows={3}
                  placeholder="Notes for the agent…"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
                <Button type="submit" className="w-full" disabled={!accepting}>
                  Book viewing slot
                </Button>
                <Button type="button" variant="secondary" className="w-full" onClick={submitApplication} disabled={!accepting}>
                  Submit application
                </Button>
              </div>
              <p className="mt-4 text-center text-xs text-ink-400">
                Instant income check · Agent: {agent?.name ?? 'Assigned soon'}
              </p>
            </form>
          </aside>
        </div>

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
