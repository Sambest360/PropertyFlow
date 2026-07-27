import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Button, Input, Modal, Select } from '../ui'
import { PlacesAddressInput } from '../PlacesAddressInput'
import { useStore } from '../../context/AppStore'
import { useAuth } from '../../context/AuthContext'
import { isFieldAgent } from '../../lib/permissions'
import { useLookupOptions } from '../../hooks/useLookupOptions'
import { geocodeAddress } from '../../lib/api/geocoding'
import type { PropertyAsset } from '../../types/domain'

type CreatePropertyInput = Parameters<ReturnType<typeof useStore>['createProperty']>[0]

/**
 * Staged create-property popup (same pattern as Add agency).
 * Creates a draft listing linked to an agency + agent.
 */
export function CreatePropertyModal({
  open,
  onClose,
  defaultAgencyId,
  lockAgency,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  defaultAgencyId?: string
  lockAgency?: boolean
  onCreated?: (property: PropertyAsset) => void
}) {
  const { state, createProperty } = useStore()
  const { user, agencyId, has, role } = useAuth()
  const isLandlord = role === 'landlord'
  const [step, setStep] = useState(1)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const agencies = useMemo(
    () =>
      has('platform.manage')
        ? state.agencies
        : state.agencies.filter((a) => a.id === (defaultAgencyId ?? agencyId)),
    [state.agencies, has, defaultAgencyId, agencyId],
  )

  const [form, setForm] = useState({
    title: '',
    type: 'Apartment',
    listingMode: 'rent' as 'sale' | 'rent' | 'both',
    rent: '',
    price: '',
    city: '',
    suburb: '',
    address: '',
    agencyId: '',
    landlordId: '',
    agentId: '',
    placeId: '' as string,
    formattedAddress: '' as string,
    lat: null as number | null,
    lng: null as number | null,
  })

  const propertyTypes = useLookupOptions('PROPERTY_TYPE', form.agencyId || agencyId)
  const listingModes = useLookupOptions('LISTING_MODE', form.agencyId || agencyId)

  const landlords = state.users.filter(
    (u) => u.role === 'landlord' && u.active && u.agencyId === form.agencyId,
  )
  const agents = state.users.filter(
    (u) =>
      u.active &&
      u.agencyId === form.agencyId &&
      (u.role === 'ground_agent' || u.role === 'agent' || u.role === 'agent_admin'),
  )

  useEffect(() => {
    if (!open) return
    const aid = isLandlord
      ? (agencyId ?? '')
      : defaultAgencyId ?? agencyId ?? agencies[0]?.id ?? ''
    const agencyLandlords = state.users.filter(
      (u) => u.role === 'landlord' && u.active && u.agencyId === aid,
    )
    const agencyAgents = state.users.filter(
      (u) =>
        u.active &&
        u.agencyId === aid &&
        (u.role === 'ground_agent' || u.role === 'agent' || u.role === 'agent_admin'),
    )
    setStep(1)
    setError('')
    setForm({
      title: '',
      type: propertyTypes[0]?.value ?? 'Apartment',
      listingMode: 'rent',
      rent: '',
      price: '',
      city: agencies.find((a) => a.id === aid)?.city ?? '',
      suburb: '',
      address: '',
      agencyId: aid,
      landlordId: isLandlord ? user.id : agencyLandlords[0]?.id ?? '',
      agentId: isLandlord ? '' : isFieldAgent(role) ? user.id : agencyAgents[0]?.id ?? '',
      placeId: '',
      formattedAddress: '',
      lat: null,
      lng: null,
    })
  }, [open, defaultAgencyId, agencyId, agencies, state.users, role, user.id, propertyTypes, isLandlord])

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (step === 1) {
      if (!form.title.trim()) {
        setError('Property title is required.')
        return
      }
      if (!form.agencyId) {
        setError('Select an agency.')
        return
      }
      setError('')
      setStep(2)
      return
    }

    if (!form.landlordId && !isLandlord) {
      setError('Select a landlord / owner for this property.')
      return
    }

    void (async () => {
      setSubmitting(true)
      setError('')
      try {
        const city = form.city.trim() || 'Port Elizabeth'
        const suburb = form.suburb.trim() || 'Central'
        const address = form.address.trim() || form.title.trim()
        const geo =
          form.lat != null && form.lng != null
            ? {
                lat: form.lat,
                lng: form.lng,
                placeId: form.placeId || null,
                formattedAddress: form.formattedAddress || `${address}, ${suburb}, ${city}`,
                geocodedAt: new Date().toISOString(),
              }
            : await geocodeAddress({ address, suburb, city })

        const input: CreatePropertyInput = {
          agencyId: isLandlord ? (user.agencyId ?? form.agencyId) : form.agencyId,
          landlordId: isLandlord ? user.id : form.landlordId,
          agentId: isLandlord ? null : form.agentId || null,
          title: form.title.trim(),
          type: form.type,
          status: 'Draft',
          listingMode: form.listingMode,
          price: form.price ? Number(form.price) : null,
          rent: form.rent ? Number(form.rent) : null,
          beds: 1,
          baths: 1,
          parking: 1,
          area: 80,
          city,
          suburb,
          address,
          lat: geo.lat,
          lng: geo.lng,
          placeId: geo.placeId,
          formattedAddress: geo.formattedAddress,
          geocodedAt: geo.geocodedAt,
          amenities: ['Parking'],
          description: '',
          featured: false,
          images: [
            'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800&q=80',
          ],
          rooms: [{ id: `r-${Date.now()}`, name: 'Bedroom 1', beds: 1, baths: 1, area: 14 }],
        }

        const created = createProperty(input)
        onCreated?.(created)
        onClose()
      } catch {
        setError('Could not geocode address. Try again or check the Maps API key.')
      } finally {
        setSubmitting(false)
      }
    })()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add property"
      description={
        step === 1
          ? 'Step 1 of 2 — Basics and agency.'
          : 'Step 2 of 2 — Owner, assigned agent, and pricing.'
      }
      size="lg"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={step === 1 ? onClose : () => setStep(1)}>
            {step === 1 ? 'Cancel' : 'Back'}
          </Button>
          <Button type="submit" form="create-property-form" disabled={submitting}>
            {step === 1 ? 'Continue' : submitting ? 'Creating…' : 'Create property'}
          </Button>
        </>
      }
    >
      <form id="create-property-form" className="space-y-3" onSubmit={submit}>
        <StepDots step={step} total={2} labels={['Basics', 'Assignment']} />
        {error ? <p className="text-sm text-accent-600">{error}</p> : null}

        {step === 1 ? (
          <>
            <Input
              className="min-h-11"
              placeholder="Property title"
              value={form.title}
              onChange={(e) => set('title', e.target.value)}
              required
            />
            <div className="grid gap-2 sm:grid-cols-2">
              <Select
                className="min-h-11 cursor-pointer"
                value={form.type}
                onChange={(e) => set('type', e.target.value)}
                aria-label="Property type"
              >
                {(propertyTypes.length ? propertyTypes : [{ value: 'Apartment', label: 'Apartment' }]).map(
                  (t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ),
                )}
              </Select>
              <Select
                className="min-h-11 cursor-pointer"
                value={form.listingMode}
                onChange={(e) => set('listingMode', e.target.value as typeof form.listingMode)}
                aria-label="Listing mode"
              >
                {(listingModes.length
                  ? listingModes
                  : [
                      { value: 'rent', label: 'Rent' },
                      { value: 'sale', label: 'Sale' },
                      { value: 'both', label: 'Both' },
                    ]
                ).map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </Select>
            </div>
            <Select
              className="min-h-11 cursor-pointer"
              value={form.agencyId}
              disabled={isLandlord || lockAgency || !has('platform.manage')}
              onChange={(e) => {
                const next = e.target.value
                const nextLandlords = state.users.filter(
                  (u) => u.role === 'landlord' && u.active && u.agencyId === next,
                )
                const nextAgents = state.users.filter(
                  (u) =>
                    u.active &&
                    u.agencyId === next &&
                    (u.role === 'ground_agent' || u.role === 'agent' || u.role === 'agent_admin'),
                )
                setForm((f) => ({
                  ...f,
                  agencyId: next,
                  landlordId: isLandlord ? user.id : nextLandlords[0]?.id ?? '',
                  agentId: isLandlord ? '' : isFieldAgent(role) ? user.id : nextAgents[0]?.id ?? '',
                  city: agencies.find((a) => a.id === next)?.city ?? f.city,
                }))
              }}
              aria-label="Agency"
            >
              {agencies.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
            {isLandlord ? (
              <p className="rounded-xl bg-primary-50 px-3 py-2 text-xs text-ink-600">
                Listed under your personal portfolio.
              </p>
            ) : null}
            <div className="grid gap-2 sm:grid-cols-2">
              <Input
                className="min-h-11"
                placeholder="City"
                value={form.city}
                onChange={(e) => set('city', e.target.value)}
              />
              <Input
                className="min-h-11"
                placeholder="Suburb"
                value={form.suburb}
                onChange={(e) => set('suburb', e.target.value)}
              />
            </div>
            <PlacesAddressInput
              className="min-h-11"
              placeholder="Street address"
              value={form.address}
              onChange={(address) => set('address', address)}
              onPlaceSelect={(place) =>
                setForm((f) => ({
                  ...f,
                  address: place.address,
                  suburb: place.suburb ?? f.suburb,
                  city: place.city ?? f.city,
                  placeId: place.placeId ?? '',
                  formattedAddress: place.formattedAddress ?? '',
                  lat: place.lat ?? null,
                  lng: place.lng ?? null,
                }))
              }
            />
          </>
        ) : (
          <>
            {isLandlord ? (
              <p className="rounded-xl bg-primary-50 px-3 py-2 text-sm text-ink-600">
                You are the owner of this listing. Set rent or sale price, then create.
              </p>
            ) : (
              <>
                <Select
                  className="min-h-11 cursor-pointer"
                  value={form.landlordId}
                  onChange={(e) => set('landlordId', e.target.value)}
                  aria-label="Landlord"
                  required
                >
                  <option value="">Select landlord / owner</option>
                  {landlords.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </Select>
                <Select
                  className="min-h-11 cursor-pointer"
                  value={form.agentId}
                  onChange={(e) => set('agentId', e.target.value)}
                  aria-label="Assigned agent"
                >
                  <option value="">Unassigned</option>
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </Select>
              </>
            )}
            <div className="grid gap-2 sm:grid-cols-2">
              <Input
                className="min-h-11"
                type="number"
                placeholder="Rent (ZAR)"
                value={form.rent}
                onChange={(e) => set('rent', e.target.value)}
              />
              <Input
                className="min-h-11"
                type="number"
                placeholder="Sale price (ZAR)"
                value={form.price}
                onChange={(e) => set('price', e.target.value)}
              />
            </div>
            {!isLandlord && landlords.length === 0 ? (
              <p className="text-sm text-accent-600">
                This agency has no landlords yet. Add a landlord user first, then create the property.
              </p>
            ) : null}
          </>
        )}
      </form>
    </Modal>
  )
}

export function StepDots({
  step,
  total,
  labels,
  maxReachable,
  onStepSelect,
}: {
  step: number
  total: number
  labels?: string[]
  /** Highest 1-based step the user may jump to. Defaults to `step`. */
  maxReachable?: number
  /** Called with 1-based step number when a reachable step is clicked. */
  onStepSelect?: (step: number) => void
}) {
  const reachable = maxReachable ?? step
  return (
    <ol className="mb-1 flex flex-wrap gap-2">
      {Array.from({ length: total }, (_, i) => {
        const n = i + 1
        const active = n === step
        const done = n < step
        const locked = n > reachable
        const clickable = Boolean(onStepSelect) && !locked && !active
        return (
          <li key={n}>
            <button
              type="button"
              disabled={locked || !onStepSelect || active}
              onClick={() => {
                if (!clickable || !onStepSelect) return
                onStepSelect(n)
              }}
              aria-current={active ? 'step' : undefined}
              className={`inline-flex min-h-11 items-center gap-2 rounded-md border px-3 text-xs font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                active
                  ? 'cursor-default border-primary bg-primary text-white'
                  : done
                    ? 'cursor-pointer border-primary-200 bg-primary-50 text-primary hover:bg-primary-100'
                    : locked
                      ? 'cursor-not-allowed border-primary-100 bg-white text-ink-400'
                      : 'cursor-pointer border-primary-100 bg-white text-ink-500 hover:bg-primary-50'
              }`}
            >
              <span className="tabular">{n}</span>
              {labels?.[i] ? <span>{labels[i]}</span> : null}
            </button>
          </li>
        )
      })}
    </ol>
  )
}
