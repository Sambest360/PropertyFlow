import { useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { useStore } from '../context/AppStore'
import { useAgencyScope, useAuth } from '../context/AuthContext'
import { RequirePermission } from '../components/RequirePermission'
import { ImageCoverField, ImageDropzone } from '../components/ImageDropzone'
import { PropertyFeaturePicker } from '../components/property-features/PropertyFeaturePicker'
import { Button, Card, Input, PageHeader, Select } from '../components/ui'
import { PlacesAddressInput } from '../components/PlacesAddressInput'
import { uid } from '../data/seed'
import { isFieldAgent } from '../lib/permissions'
import { pruneAmenitiesForMode } from '../lib/propertyFeatures'
import { readReturnTo } from '../lib/returnTo'
import { isVerificationApproved } from '../lib/verification'
import type { Room } from '../types/domain'
import { useLookupOptions } from '../hooks/useLookupOptions'

export default function AssetCreate() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const returnTo = readReturnTo(searchParams) ?? '/workspace/properties'
  const { state, createProperty, publishProperty } = useStore()
  const { user, agencyId, has, role } = useAuth()
  const { scopeAgency } = useAgencyScope()
  const isLandlord = role === 'landlord'
  const landlordVerified = isVerificationApproved(user.verification, user.role)
  const canPublish = has('listings.publish') && landlordVerified
  const propertyTypes = useLookupOptions('PROPERTY_TYPE', agencyId)
  const listingModes = useLookupOptions('LISTING_MODE', agencyId)

  const agencies = state.agencies.filter((a) => scopeAgency(a.id) || has('platform.manage'))
  const landlords = state.users.filter((u) => u.role === 'landlord' && (has('platform.manage') || u.agencyId === agencyId))
  const agents = state.users.filter(
    (u) =>
      (u.role === 'ground_agent' || u.role === 'agent_admin' || u.role === 'agent') &&
      (has('platform.manage') || u.agencyId === agencyId),
  )

  const [form, setForm] = useState({
    title: '',
    type: 'Apartment',
    listingMode: 'rent' as 'sale' | 'rent' | 'both',
    price: '',
    rent: '',
    city: '',
    suburb: '',
    address: '',
    area: '80',
    parking: '1',
    agencyId: isLandlord ? (agencyId ?? '') : agencyId ?? agencies[0]?.id ?? '',
    landlordId: isLandlord ? user.id : landlords[0]?.id ?? '',
    agentId: isLandlord ? '' : isFieldAgent(role) ? user.id : agents[0]?.id ?? '',
    description: '',
    amenities: ['Fibre', 'Parking'] as string[],
  })
  const [publishAfterSave, setPublishAfterSave] = useState(isLandlord)
  const [images, setImages] = useState<string[]>([])
  const [floorPlan, setFloorPlan] = useState<string | null>(null)
  const [rooms, setRooms] = useState<Room[]>([
    { id: uid('r'), name: 'Bedroom 1', beds: 1, baths: 1, area: 14 },
  ])

  const beds = useMemo(() => rooms.reduce((n, r) => n + r.beds, 0), [rooms])
  const baths = useMemo(() => rooms.reduce((n, r) => n + r.baths, 0), [rooms])

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    const resolvedAgencyId = isLandlord ? (user.agencyId ?? form.agencyId) : form.agencyId
    const resolvedLandlordId = isLandlord ? user.id : form.landlordId
    if (!form.title.trim() || !resolvedAgencyId || !resolvedLandlordId) return
    if (images.length === 0) return
    const created = createProperty({
      agencyId: resolvedAgencyId,
      landlordId: resolvedLandlordId,
      agentId: isLandlord ? null : form.agentId || null,
      title: form.title.trim(),
      type: form.type,
      status: 'Draft',
      listingMode: form.listingMode,
      price: form.price ? Number(form.price) : null,
      rent: form.rent ? Number(form.rent) : null,
      beds,
      baths,
      parking: Number(form.parking) || 0,
      area: Number(form.area) || 0,
      city: form.city.trim() || 'Port Elizabeth',
      suburb: form.suburb.trim() || 'Central',
      address: form.address.trim() || form.suburb,
      lat: -33.96,
      lng: 25.6,
      amenities: form.amenities,
      description: form.description.trim() || `${form.type} in ${form.suburb}`,
      featured: false,
      images,
      rooms,
      floorPlan: floorPlan ?? undefined,
    })
    if (publishAfterSave && canPublish) {
      publishProperty(created.id, 'Published')
    }
    navigate(isLandlord ? `/workspace/properties/${created.id}` : returnTo)
  }

  return (
    <RequirePermission permission="assets.manage">
      <div className="animate-fade-in">
        <PageHeader
          title={isLandlord ? 'List a property' : 'Add property asset'}
          subtitle={
            isLandlord
              ? 'Add your home, then publish it so applicants can find it on the marketplace.'
              : 'Infrastructure record first — rooms, beds, images, floor plan — then publish as a listing.'
          }
          actions={
            <Link to={returnTo}>
              <Button variant="secondary">Cancel</Button>
            </Link>
          }
        />

        <form onSubmit={onSubmit} className="grid gap-6 lg:grid-cols-3">
          <Card className="space-y-3 p-5 lg:col-span-2">
            <Input placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
            <div className="grid gap-3 sm:grid-cols-3">
              <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                {(
                  propertyTypes.length
                    ? propertyTypes
                    : [
                        'House',
                        'Apartment',
                        'Townhouse',
                        'Commercial',
                        'Office',
                        'Vacant Land',
                        'Student Accommodation',
                      ].map((t) => ({ value: t, label: t }))
                ).map((t: { value: string; label: string }) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </Select>
              <Select
                value={form.listingMode}
                onChange={(e) => {
                  const listingMode = e.target.value as typeof form.listingMode
                  setForm({
                    ...form,
                    listingMode,
                    amenities: pruneAmenitiesForMode(form.amenities, listingMode),
                    price: listingMode === 'rent' ? '' : form.price,
                    rent: listingMode === 'sale' ? '' : form.rent,
                  })
                }}
              >
                {(
                  listingModes.length
                    ? listingModes
                    : [
                        { value: 'sale', label: 'For sale' },
                        { value: 'rent', label: 'To rent' },
                        { value: 'both', label: 'Sale or rent' },
                      ]
                ).map((m: { value: string; label: string }) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </Select>
              <Input placeholder="Parking bays" value={form.parking} onChange={(e) => setForm({ ...form, parking: e.target.value })} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {(form.listingMode === 'sale' || form.listingMode === 'both') && (
                <Input
                  placeholder="Sale price (ZAR)"
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                  required={form.listingMode === 'sale'}
                />
              )}
              {(form.listingMode === 'rent' || form.listingMode === 'both') && (
                <Input
                  placeholder="Monthly rent (ZAR)"
                  value={form.rent}
                  onChange={(e) => setForm({ ...form, rent: e.target.value })}
                  required={form.listingMode === 'rent'}
                />
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Input placeholder="City" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
              <Input placeholder="Suburb" value={form.suburb} onChange={(e) => setForm({ ...form, suburb: e.target.value })} />
              <Input placeholder="Area m²" value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} />
            </div>
            <PlacesAddressInput
              placeholder="Street address"
              value={form.address}
              onChange={(address) => setForm({ ...form, address })}
              onPlaceSelect={(place) =>
                setForm({
                  ...form,
                  address: place.address,
                  suburb: place.suburb ?? form.suburb,
                  city: place.city ?? form.city,
                })
              }
            />
            <ImageDropzone
              label="Property photos"
              value={images}
              onChange={setImages}
              multiple
              max={12}
              hint="Drag & drop photos here, or click to open your gallery"
            />
            <ImageCoverField
              label="Floor plan (optional)"
              value={floorPlan}
              onChange={setFloorPlan}
            />
            <div className="rounded-2xl border border-primary-100 bg-primary-50/30 p-4">
              <PropertyFeaturePicker
                value={form.amenities}
                onChange={(amenities) => setForm({ ...form, amenities })}
                listingMode={form.listingMode}
              />
            </div>
            <textarea
              className="min-h-24 w-full rounded-xl border border-primary-100 bg-white px-3 py-2 text-sm"
              placeholder="Description"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />

            <div>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="font-semibold text-ink">Rooms & beds</h3>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => setRooms([...rooms, { id: uid('r'), name: `Room ${rooms.length + 1}`, beds: 1, baths: 0 }])}
                >
                  <Plus className="h-3.5 w-3.5" /> Add room
                </Button>
              </div>
              <div className="space-y-2">
                {rooms.map((r, idx) => (
                  <div key={r.id} className="grid grid-cols-4 gap-2">
                    <Input
                      value={r.name}
                      onChange={(e) => {
                        const next = [...rooms]
                        next[idx] = { ...r, name: e.target.value }
                        setRooms(next)
                      }}
                    />
                    <Input
                      type="number"
                      min={0}
                      value={r.beds}
                      onChange={(e) => {
                        const next = [...rooms]
                        next[idx] = { ...r, beds: Number(e.target.value) }
                        setRooms(next)
                      }}
                      placeholder="Beds"
                    />
                    <Input
                      type="number"
                      min={0}
                      value={r.baths}
                      onChange={(e) => {
                        const next = [...rooms]
                        next[idx] = { ...r, baths: Number(e.target.value) }
                        setRooms(next)
                      }}
                      placeholder="Baths"
                    />
                    <Button type="button" variant="ghost" size="sm" onClick={() => setRooms(rooms.filter((x) => x.id !== r.id))}>
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-xs text-ink-500">
                Totals · {beds} beds · {baths} baths
              </p>
            </div>
          </Card>

          <div className="space-y-4">
            <Card className="space-y-3 p-5">
              <h3 className="font-semibold">{isLandlord ? 'Your listing' : 'Ownership & assignment'}</h3>
              {isLandlord ? (
                <p className="rounded-xl bg-primary-50 px-3 py-2 text-xs text-ink-600">
                  Listed under your portfolio as <span className="font-semibold">{user.name}</span>.
                  {user.agencyId
                    ? ` Agency: ${state.agencies.find((a) => a.id === user.agencyId)?.name ?? 'Personal portfolio'}.`
                    : ''}
                </p>
              ) : (
                <>
                  <label className="block text-xs font-medium text-ink-500">Agency</label>
                  <Select value={form.agencyId} onChange={(e) => setForm({ ...form, agencyId: e.target.value })}>
                    {agencies.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </Select>
                  <label className="block text-xs font-medium text-ink-500">Landlord</label>
                  <Select value={form.landlordId} onChange={(e) => setForm({ ...form, landlordId: e.target.value })}>
                    {landlords.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </Select>
                  <label className="block text-xs font-medium text-ink-500">Assigned agent</label>
                  <Select value={form.agentId} onChange={(e) => setForm({ ...form, agentId: e.target.value })}>
                    {agents.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </Select>
                </>
              )}
              {has('listings.publish') && (
                <label
                  className={`flex min-h-11 items-start gap-3 rounded-xl border border-primary-100 bg-white px-3 py-3 ${
                    canPublish ? 'cursor-pointer' : 'cursor-not-allowed opacity-70'
                  }`}
                >
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4"
                    checked={publishAfterSave && canPublish}
                    disabled={!canPublish}
                    onChange={(e) => setPublishAfterSave(e.target.checked)}
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-ink">Publish to marketplace</span>
                    <span className="mt-0.5 block text-xs text-ink-500">
                      {canPublish
                        ? 'Applicants can browse and apply once published.'
                        : 'Your landlord account is pending document review — publish unlocks after approval.'}
                    </span>
                  </span>
                </label>
              )}
              {images.length === 0 && (
                <p className="text-xs font-medium text-accent">Add at least one property photo to save.</p>
              )}
              <Button
                type="submit"
                className="w-full cursor-pointer"
                disabled={images.length === 0}
              >
                {publishAfterSave && canPublish ? 'Save & publish' : 'Save asset'}
              </Button>
            </Card>
            {images[0] && (
              <Card className="overflow-hidden">
                <img src={images[0]} alt="" className="aspect-[4/3] w-full object-cover" />
                <p className="p-3 text-xs text-ink-500">Cover preview</p>
              </Card>
            )}
          </div>
        </form>
      </div>
    </RequirePermission>
  )
}
