import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  Building2,
  Home,
  Briefcase,
  Building,
  LandPlot,
  GraduationCap,
  KeyRound,
  Tag,
} from 'lucide-react'
import { useStore } from '../../context/AppStore'
import { useAgencyScope, useAuth } from '../../context/AuthContext'
import { RequirePermission } from '../../components/RequirePermission'
import {
  CreateWizardShell,
  type WizardStepMeta,
} from '../../components/admin/CreateWizardShell'
import { WizardSectionCard } from '../../components/wizard/WizardSectionCard'
import { WizardFooter } from '../../components/wizard/WizardFooter'
import { TypeCardGrid } from '../../components/wizard/TypeCardGrid'
import { CounterPillRow } from '../../components/wizard/CounterPillRow'
import { LiveListingPreview } from '../../components/wizard/LiveListingPreview'
import { ImageCoverField, ImageDropzone } from '../../components/ImageDropzone'
import { PropertyFeaturePicker } from '../../components/property-features/PropertyFeaturePicker'
import { PlacesAddressInput } from '../../components/PlacesAddressInput'
import { Button, Input, Select } from '../../components/ui'
import { FormLabel, FieldHelp } from '../../components/onboarding/FieldHelp'
import { uid } from '../../data/seed'
import { UNIT_TEMPLATES, roomKindLabel, type BuildingGrading, type RoomKind, type UnitTemplateId } from '../../data/infrastructure'
import { isFieldAgent } from '../../lib/permissions'
import { pruneAmenitiesForMode } from '../../lib/propertyFeatures'
import { readReturnTo } from '../../lib/returnTo'
import { isVerificationApproved } from '../../lib/verification'
import { useWizardDraft, useWizardSteps } from '../../hooks/useWizardSteps'
import { useLookupOptions } from '../../hooks/useLookupOptions'
import { formatZAR } from '../../data/seed'

const DRAFT_KEY = 'propertyflow:property-create'

const STEPS: WizardStepMeta[] = [
  { id: 'type', label: 'Property type', tip: 'Choose how this asset will be listed and pick a unit layout template.' },
  { id: 'location', label: 'Location', tip: 'Set the building name and street address. Geocoding improves map search.' },
  { id: 'building', label: 'Building', tip: 'Optional grading, solar, borehole, and building-level photos.' },
  { id: 'rooms', label: 'Unit & rooms', tip: 'Configure the unit number, size, and room breakdown for the floor plan.' },
  { id: 'amenities', label: 'Amenities', tip: 'Select features grouped by category — safety, living, kitchen, and more.' },
  { id: 'media', label: 'Media', tip: 'Add at least one photo. Five or more is recommended for marketplace listings.' },
  { id: 'pricing', label: 'Pricing', tip: 'Set rent and/or sale price, deposit guidance, and availability rules.' },
  { id: 'assignment', label: 'Assignment', tip: 'Link the listing to an agency, landlord, and field agent.' },
  { id: 'review', label: 'Review', tip: 'Confirm everything before saving as draft or publishing.' },
]

const LISTING_OPTIONS = [
  { value: 'rent', label: 'For rent', blurb: 'Monthly rental listing', icon: KeyRound },
  { value: 'sale', label: 'For sale', blurb: 'Purchase listing', icon: Tag },
  { value: 'both', label: 'Rent & sale', blurb: 'Dual listing mode', icon: Home },
]

const TYPE_OPTIONS = [
  { value: 'House', label: 'House', icon: Home },
  { value: 'Apartment', label: 'Apartment', icon: Building2 },
  { value: 'Townhouse', label: 'Townhouse', icon: Building },
  { value: 'Office', label: 'Office', icon: Briefcase },
  { value: 'Commercial', label: 'Commercial', icon: Building2 },
  { value: 'Vacant Land', label: 'Vacant land', icon: LandPlot },
  { value: 'Student Accommodation', label: 'Student', icon: GraduationCap },
]

type RoomDraft = {
  id: string
  name: string
  kind: RoomKind
  beds: number
  baths: number
  areaSqm: string
}

type PropertyDraft = {
  listingMode: 'rent' | 'sale' | 'both'
  propertyType: string
  unitTemplateId: UnitTemplateId
  buildingName: string
  existingBuildingId: string
  address: string
  suburb: string
  city: string
  province: string
  postalCode: string
  lat: number
  lng: number
  placeId: string
  formattedAddress: string
  grading: BuildingGrading
  solarCapacityKw: string
  hasBorehole: boolean
  buildingImages: string[]
  unitNumber: string
  unitTitle: string
  title: string
  area: string
  parking: number
  rooms: RoomDraft[]
  amenities: string[]
  images: string[]
  floorPlan: string | null
  price: string
  rent: string
  depositHint: string
  minStayDays: string
  instantBook: boolean
  description: string
  agencyId: string
  landlordId: string
  agentId: string
  publishAfterSave: boolean
}

function defaultRooms(templateId: UnitTemplateId): RoomDraft[] {
  const template = UNIT_TEMPLATES.find((t) => t.id === templateId) ?? UNIT_TEMPLATES[1]
  return template.rooms.map((r) => ({
    id: uid('r'),
    name: r.name,
    kind: r.kind,
    beds: r.beds,
    baths: r.baths,
    areaSqm: r.areaSqm != null ? String(r.areaSqm) : '',
  }))
}

export default function PropertyCreatePage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const returnTo = readReturnTo(searchParams) ?? '/workspace/properties'
  const queryAgencyId = searchParams.get('agencyId') ?? ''

  const { state, createPropertyBundle, publishProperty } = useStore()
  const { user, agencyId, has, role } = useAuth()
  const { scopeAgency } = useAgencyScope()
  const isLandlord = role === 'landlord'
  const landlordVerified = isVerificationApproved(user.verification, user.role)
  const canPublish = has('listings.publish') && landlordVerified

  const propertyTypes = useLookupOptions('PROPERTY_TYPE', agencyId)
  const listingModes = useLookupOptions('LISTING_MODE', agencyId)

  const agencies = state.agencies.filter((a) => scopeAgency(a.id) || has('platform.manage'))
  const landlords = state.users.filter(
    (u) => u.role === 'landlord' && (has('platform.manage') || u.agencyId === agencyId),
  )
  const agents = state.users.filter(
    (u) =>
      (u.role === 'ground_agent' || u.role === 'agent_admin' || u.role === 'agent') &&
      (has('platform.manage') || u.agencyId === agencyId),
  )
  const scopedBuildings = state.buildings.filter(
    (b) => has('platform.manage') || b.clientId === (queryAgencyId || agencyId),
  )

  const defaultAgencyId = queryAgencyId || (isLandlord ? user.agencyId ?? '' : agencyId ?? agencies[0]?.id ?? '')

  const initialDraft: PropertyDraft = {
    listingMode: 'rent',
    propertyType: 'Apartment',
    unitTemplateId: 'one_bed',
    buildingName: '',
    existingBuildingId: '',
    address: '',
    suburb: '',
    city: '',
    province: 'Eastern Cape',
    postalCode: '',
    lat: -33.96,
    lng: 25.6,
    placeId: '',
    formattedAddress: '',
    grading: null,
    solarCapacityKw: '0',
    hasBorehole: false,
    buildingImages: [],
    unitNumber: '1',
    unitTitle: '',
    title: '',
    area: '80',
    parking: 1,
    rooms: defaultRooms('one_bed'),
    amenities: ['Fibre', 'Parking'],
    images: [],
    floorPlan: null,
    price: '',
    rent: '',
    depositHint: '',
    minStayDays: '30',
    instantBook: false,
    description: '',
    agencyId: defaultAgencyId,
    landlordId: isLandlord ? user.id : landlords[0]?.id ?? '',
    agentId: isLandlord ? '' : isFieldAgent(role) ? user.id : agents[0]?.id ?? '',
    publishAfterSave: isLandlord,
  }

  const { draft, setDraft, clearDraft } = useWizardDraft<PropertyDraft>(DRAFT_KEY, initialDraft)
  const { stepIndex, maxReachableIndex, goNext, goBack, goTo, markReachable, isFirst, isLast } =
    useWizardSteps({ totalSteps: STEPS.length, storageKey: DRAFT_KEY })

  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (queryAgencyId && draft.agencyId !== queryAgencyId) {
      setDraft((d) => ({ ...d, agencyId: queryAgencyId }))
    }
  }, [queryAgencyId, draft.agencyId, setDraft])

  const beds = useMemo(() => draft.rooms.reduce((n, r) => n + r.beds, 0), [draft.rooms])
  const baths = useMemo(() => draft.rooms.reduce((n, r) => n + r.baths, 0), [draft.rooms])

  const typeOptions = useMemo(() => {
    if (!propertyTypes.length) return TYPE_OPTIONS
    const icons = TYPE_OPTIONS.reduce<Record<string, typeof Home>>((acc, o) => {
      acc[o.value] = o.icon
      return acc
    }, {})
    return propertyTypes.map((t) => ({
      value: t.value,
      label: t.label,
      icon: icons[t.value] ?? Home,
    }))
  }, [propertyTypes])

  const listingOptions = useMemo(() => {
    if (!listingModes.length) return LISTING_OPTIONS
    const icons = LISTING_OPTIONS.reduce<Record<string, typeof KeyRound>>((acc, o) => {
      acc[o.value] = o.icon
      return acc
    }, {})
    return listingModes.map((m) => ({
      value: m.value as 'rent' | 'sale' | 'both',
      label: m.label,
      blurb: m.value === 'both' ? 'Dual listing mode' : undefined,
      icon: icons[m.value] ?? KeyRound,
    }))
  }, [listingModes])

  function applyTemplate(templateId: UnitTemplateId) {
    const template = UNIT_TEMPLATES.find((t) => t.id === templateId)
    if (!template) return
    setDraft((d) => ({
      ...d,
      unitTemplateId: templateId,
      area: String(template.squareMeters),
      parking: template.parking,
      rooms: defaultRooms(templateId),
    }))
  }

  function validateStep(index: number): string | null {
    switch (index) {
      case 0:
        if (!draft.propertyType) return 'Select a property type.'
        return null
      case 1:
        if (!draft.buildingName.trim() && !draft.existingBuildingId) return 'Enter a building name or pick an existing building.'
        if (!draft.address.trim()) return 'Street address is required.'
        if (!draft.city.trim()) return 'City is required.'
        return null
      case 2:
        return null
      case 3:
        if (!draft.unitNumber.trim()) return 'Unit number is required.'
        if (draft.rooms.length === 0) return 'Add at least one room.'
        return null
      case 5:
        if (draft.images.length === 0) return 'Add at least one photo.'
        return null
      case 6:
        if (draft.listingMode !== 'sale' && !draft.rent.trim()) return 'Monthly rent is required for rental listings.'
        if (draft.listingMode !== 'rent' && !draft.price.trim()) return 'Sale price is required for sale listings.'
        return null
      case 7: {
        const resolvedAgency = isLandlord ? user.agencyId ?? draft.agencyId : draft.agencyId
        const resolvedLandlord = isLandlord ? user.id : draft.landlordId
        if (!resolvedAgency) return 'Agency is required.'
        if (!resolvedLandlord) return 'Landlord is required.'
        if (!draft.title.trim()) return 'Listing title is required.'
        return null
      }
      default:
        return null
    }
  }

  function handleContinue() {
    const err = validateStep(stepIndex)
    if (err) {
      setError(err)
      return
    }
    setError('')
    markReachable(stepIndex + 1)
    goNext()
  }

  function saveDraftOnly() {
    setError('')
    submitProperty('Draft', false)
  }

  function submitProperty(status: 'Draft' | 'Published', fromReview: boolean) {
    const resolvedAgencyId = isLandlord ? user.agencyId ?? draft.agencyId : draft.agencyId
    const resolvedLandlordId = isLandlord ? user.id : draft.landlordId
    const err = validateStep(7)
    if (err) {
      setError(err)
      if (fromReview) goTo(7)
      return
    }
    if (draft.images.length === 0) {
      setError('Add at least one photo.')
      goTo(5)
      return
    }

    setBusy(true)
    const title = draft.title.trim() || draft.unitTitle.trim() || `${draft.propertyType} in ${draft.suburb || draft.city}`

    const created = createPropertyBundle({
      existingBuildingId: draft.existingBuildingId || undefined,
      building: draft.existingBuildingId
        ? undefined
        : {
            clientId: resolvedAgencyId,
            landlordId: resolvedLandlordId,
            name: draft.buildingName.trim(),
            addressLine1: draft.address.trim(),
            suburb: draft.suburb.trim() || 'Central',
            city: draft.city.trim() || 'Port Elizabeth',
            province: draft.province.trim() || 'Eastern Cape',
            grading: draft.grading,
            solarCapacityKw: Number(draft.solarCapacityKw) || 0,
            hasBorehole: draft.hasBorehole,
            lat: draft.lat,
            lng: draft.lng,
            images: draft.buildingImages,
          },
      unitTemplateId: draft.unitTemplateId,
      unit: {
        unitNumber: draft.unitNumber.trim(),
        title: draft.unitTitle.trim() || title,
        listingType: draft.listingMode,
        price: draft.price ? Number(draft.price) : null,
        rent: draft.rent ? Number(draft.rent) : null,
        agentId: isLandlord ? null : draft.agentId || null,
        squareMeters: Number(draft.area) || 0,
        bedrooms: beds,
        bathrooms: baths,
        parking: draft.parking,
        description: draft.description.trim(),
        amenities: draft.amenities,
      },
      rooms: draft.rooms.map((r) => ({
        name: r.name,
        kind: r.kind,
        beds: r.beds,
        baths: r.baths,
        areaSqm: r.areaSqm ? Number(r.areaSqm) : undefined,
      })),
      property: {
        agencyId: resolvedAgencyId,
        landlordId: resolvedLandlordId,
        agentId: isLandlord ? null : draft.agentId || null,
        title,
        type: draft.propertyType,
        status: 'Draft',
        listingMode: draft.listingMode,
        price: draft.price ? Number(draft.price) : null,
        rent: draft.rent ? Number(draft.rent) : null,
        parking: draft.parking,
        area: Number(draft.area) || 0,
        city: draft.city.trim() || 'Port Elizabeth',
        suburb: draft.suburb.trim() || 'Central',
        address: draft.address.trim() || draft.suburb,
        lat: draft.lat,
        lng: draft.lng,
        placeId: draft.placeId || null,
        formattedAddress: draft.formattedAddress || null,
        amenities: draft.amenities,
        description: draft.description.trim() || `${draft.propertyType} in ${draft.suburb || draft.city}`,
        featured: false,
        images: draft.images,
        floorPlan: draft.floorPlan ?? undefined,
        solarCapacityKw: Number(draft.solarCapacityKw) || 0,
        hasBorehole: draft.hasBorehole,
        grading: draft.grading,
        unitNumber: draft.unitNumber.trim(),
      },
    })

    const shouldPublish =
      (fromReview && draft.publishAfterSave && canPublish) || (status === 'Published' && canPublish)
    if (shouldPublish) {
      publishProperty(created.id, 'Published')
    }

    clearDraft()
    setBusy(false)
    navigate(isLandlord ? `/workspace/properties/${created.id}` : returnTo)
  }

  function renderStep() {
    switch (stepIndex) {
      case 0:
        return (
          <WizardSectionCard title="Listing mode & type" description="How will this property be marketed?">
            <div>
              <FormLabel
                help={{
                  title: 'Listing mode',
                  body: 'Choose rent for monthly tenancies, sale for purchase listings, or both if the owner is open to either. This controls which price fields appear later.',
                }}
              >
                Listing mode
              </FormLabel>
              <TypeCardGrid
                options={listingOptions}
                value={draft.listingMode}
                onChange={(listingMode) =>
                  setDraft((d) => ({
                    ...d,
                    listingMode: listingMode as PropertyDraft['listingMode'],
                    amenities: pruneAmenitiesForMode(d.amenities, listingMode as PropertyDraft['listingMode']),
                  }))
                }
                columns={3}
              />
            </div>
            <div>
              <FormLabel
                help={{
                  title: 'Property type',
                  body: 'Pick the category buyers and tenants filter by — house, apartment, commercial, student accommodation, and so on.',
                }}
              >
                Property type
              </FormLabel>
              <TypeCardGrid
                options={typeOptions}
                value={draft.propertyType}
                onChange={(propertyType) => setDraft((d) => ({ ...d, propertyType }))}
                columns={3}
              />
            </div>
            <div>
              <FormLabel
                help={{
                  title: 'Unit template',
                  body: 'Templates pre-fill room counts and sizes for common layouts (studio, one-bed, etc.). Choose Custom if the floor plan does not match a preset.',
                }}
              >
                Unit template
              </FormLabel>
              <Select
                className="min-h-11"
                value={draft.unitTemplateId}
                onChange={(e) => applyTemplate(e.target.value as UnitTemplateId)}
              >
                {UNIT_TEMPLATES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label} — {t.blurb}
                  </option>
                ))}
                <option value="custom">Custom layout</option>
              </Select>
            </div>
          </WizardSectionCard>
        )
      case 1:
        return (
          <WizardSectionCard title="Location" description="Building and street address for this asset.">
            {scopedBuildings.length > 0 ? (
              <>
                <FormLabel
                  help={{
                    title: 'Existing building',
                    body: 'Link to a building already in your portfolio to reuse its address and grading. Choose New building when listing a standalone property.',
                  }}
                >
                  Building
                </FormLabel>
                <Select
                className="min-h-11"
                value={draft.existingBuildingId}
                onChange={(e) => {
                  const id = e.target.value
                  const b = state.buildings.find((x) => x.id === id)
                  setDraft((d) => ({
                    ...d,
                    existingBuildingId: id,
                    buildingName: b?.name ?? d.buildingName,
                    address: b?.addressLine1 ?? d.address,
                    suburb: b?.suburb ?? d.suburb,
                    city: b?.city ?? d.city,
                    province: b?.province ?? d.province,
                    lat: b?.lat ?? d.lat,
                    lng: b?.lng ?? d.lng,
                  }))
                }}
              >
                <option value="">New building</option>
                {scopedBuildings.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} — {b.suburb}, {b.city}
                  </option>
                ))}
              </Select>
              </>
            ) : null}
            {!draft.existingBuildingId ? (
              <Input
                className="min-h-11"
                placeholder="Building name"
                value={draft.buildingName}
                onChange={(e) => setDraft((d) => ({ ...d, buildingName: e.target.value }))}
              />
            ) : null}
            <PlacesAddressInput
              className="min-h-11"
              placeholder="Street address"
              value={draft.address}
              onChange={(address) => setDraft((d) => ({ ...d, address }))}
              onPlaceSelect={(place) =>
                setDraft((d) => ({
                  ...d,
                  address: place.address,
                  suburb: place.suburb ?? d.suburb,
                  city: place.city ?? d.city,
                  lat: place.lat ?? d.lat,
                  lng: place.lng ?? d.lng,
                  placeId: place.placeId ?? d.placeId,
                  formattedAddress: place.formattedAddress ?? d.formattedAddress,
                }))
              }
            />
            <div className="grid gap-3 sm:grid-cols-3">
              <Input
                className="min-h-11"
                placeholder="Suburb"
                value={draft.suburb}
                onChange={(e) => setDraft((d) => ({ ...d, suburb: e.target.value }))}
              />
              <Input
                className="min-h-11"
                placeholder="City"
                value={draft.city}
                onChange={(e) => setDraft((d) => ({ ...d, city: e.target.value }))}
              />
              <Input
                className="min-h-11"
                placeholder="Province"
                value={draft.province}
                onChange={(e) => setDraft((d) => ({ ...d, province: e.target.value }))}
              />
            </div>
          </WizardSectionCard>
        )
      case 2:
        return (
          <WizardSectionCard title="Building details" description="Optional sustainability and grading fields.">
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <FormLabel
                  help={{
                    title: 'Building grading',
                    body: 'Optional quality tier (P = premium, A–C = standard bands). Helps agents filter stock and set tenant expectations.',
                  }}
                  className="mb-1.5"
                >
                  Grading
                </FormLabel>
                <Select
                className="min-h-11"
                value={draft.grading ?? ''}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    grading: (e.target.value || null) as BuildingGrading,
                  }))
                }
              >
                <option value="">Grading (optional)</option>
                <option value="P">P — Premium</option>
                <option value="A">A</option>
                <option value="B">B</option>
                <option value="C">C</option>
              </Select>
              </div>
              <div>
                <FormLabel
                  help={{
                    title: 'Solar capacity',
                    body: 'Enter installed solar in kilowatts if the building has backup or green power — useful for load-shedding-sensitive tenants.',
                  }}
                  className="mb-1.5"
                >
                  Solar kW
                </FormLabel>
                <Input
                className="min-h-11"
                type="number"
                min={0}
                step={0.1}
                placeholder="Solar kW"
                value={draft.solarCapacityKw}
                onChange={(e) => setDraft((d) => ({ ...d, solarCapacityKw: e.target.value }))}
              />
              </div>
              <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-primary-100 px-3 text-sm">
                <input
                  type="checkbox"
                  checked={draft.hasBorehole}
                  onChange={(e) => setDraft((d) => ({ ...d, hasBorehole: e.target.checked }))}
                />
                Borehole on site
              </label>
            </div>
            <ImageDropzone
              label="Building photos (optional)"
              value={draft.buildingImages}
              onChange={(buildingImages) => setDraft((d) => ({ ...d, buildingImages }))}
              max={6}
            />
          </WizardSectionCard>
        )
      case 3:
        return (
          <WizardSectionCard title="Unit & rooms" description="Unit metadata and room rows power the floor plan.">
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                className="min-h-11"
                placeholder="Unit number"
                value={draft.unitNumber}
                onChange={(e) => setDraft((d) => ({ ...d, unitNumber: e.target.value }))}
              />
              <Input
                className="min-h-11"
                placeholder="Unit title (optional)"
                value={draft.unitTitle}
                onChange={(e) => setDraft((d) => ({ ...d, unitTitle: e.target.value }))}
              />
              <Input
                className="min-h-11"
                type="number"
                placeholder="Size m²"
                value={draft.area}
                onChange={(e) => setDraft((d) => ({ ...d, area: e.target.value }))}
              />
            </div>
            <CounterPillRow label="Parking bays" value={draft.parking} onChange={(parking) => setDraft((d) => ({ ...d, parking }))} />
            <div className="overflow-x-auto rounded-lg border border-primary-100">
              <table className="min-w-full text-sm">
                <thead className="bg-primary-50/60 text-left text-xs uppercase tracking-wide text-ink-500">
                  <tr>
                    <th className="px-3 py-2">Room</th>
                    <th className="px-3 py-2">Kind</th>
                    <th className="px-3 py-2">Beds</th>
                    <th className="px-3 py-2">Baths</th>
                    <th className="px-3 py-2">m²</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {draft.rooms.map((room, idx) => (
                    <tr key={room.id} className="border-t border-primary-50">
                      <td className="px-2 py-2">
                        <Input
                          className="min-h-10"
                          value={room.name}
                          onChange={(e) =>
                            setDraft((d) => ({
                              ...d,
                              rooms: d.rooms.map((r, i) => (i === idx ? { ...r, name: e.target.value } : r)),
                            }))
                          }
                        />
                      </td>
                      <td className="px-2 py-2">
                        <Select
                          className="min-h-10"
                          value={room.kind}
                          onChange={(e) =>
                            setDraft((d) => ({
                              ...d,
                              rooms: d.rooms.map((r, i) =>
                                i === idx ? { ...r, kind: e.target.value as RoomKind } : r,
                              ),
                            }))
                          }
                        >
                          {(['bedroom', 'bathroom', 'kitchen', 'living', 'dining', 'study', 'garage', 'other'] as RoomKind[]).map(
                            (k) => (
                              <option key={k} value={k}>
                                {roomKindLabel(k)}
                              </option>
                            ),
                          )}
                        </Select>
                      </td>
                      <td className="px-2 py-2">
                        <Input
                          className="min-h-10 w-16"
                          type="number"
                          min={0}
                          value={room.beds}
                          onChange={(e) =>
                            setDraft((d) => ({
                              ...d,
                              rooms: d.rooms.map((r, i) =>
                                i === idx ? { ...r, beds: Number(e.target.value) || 0 } : r,
                              ),
                            }))
                          }
                        />
                      </td>
                      <td className="px-2 py-2">
                        <Input
                          className="min-h-10 w-16"
                          type="number"
                          min={0}
                          step={0.5}
                          value={room.baths}
                          onChange={(e) =>
                            setDraft((d) => ({
                              ...d,
                              rooms: d.rooms.map((r, i) =>
                                i === idx ? { ...r, baths: Number(e.target.value) || 0 } : r,
                              ),
                            }))
                          }
                        />
                      </td>
                      <td className="px-2 py-2">
                        <Input
                          className="min-h-10 w-20"
                          type="number"
                          min={0}
                          value={room.areaSqm}
                          onChange={(e) =>
                            setDraft((d) => ({
                              ...d,
                              rooms: d.rooms.map((r, i) => (i === idx ? { ...r, areaSqm: e.target.value } : r)),
                            }))
                          }
                        />
                      </td>
                      <td className="px-2 py-2">
                        <Button
                          type="button"
                          variant="secondary"
                          className="min-h-10"
                          onClick={() =>
                            setDraft((d) => ({ ...d, rooms: d.rooms.filter((_, i) => i !== idx) }))
                          }
                        >
                          Remove
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Button
              type="button"
              variant="secondary"
              className="min-h-11"
              onClick={() =>
                setDraft((d) => ({
                  ...d,
                  rooms: [
                    ...d.rooms,
                    { id: uid('r'), name: `Room ${d.rooms.length + 1}`, kind: 'other', beds: 0, baths: 0, areaSqm: '' },
                  ],
                }))
              }
            >
              Add room
            </Button>
          </WizardSectionCard>
        )
      case 4:
        return (
          <WizardSectionCard title="Amenities" description="Grouped checklist of property features.">
            <PropertyFeaturePicker
              listingMode={draft.listingMode}
              value={draft.amenities}
              onChange={(amenities) => setDraft((d) => ({ ...d, amenities }))}
            />
          </WizardSectionCard>
        )
      case 5:
        return (
          <WizardSectionCard title="Photos & floor plan" description="Minimum one listing photo required.">
            <ImageDropzone
              label="Listing photos"
              value={draft.images}
              onChange={(images) => setDraft((d) => ({ ...d, images }))}
              max={12}
            />
            <ImageCoverField
              label="Floor plan (optional)"
              value={draft.floorPlan}
              onChange={(floorPlan) => setDraft((d) => ({ ...d, floorPlan }))}
            />
          </WizardSectionCard>
        )
      case 6:
        return (
          <WizardSectionCard title="Pricing & availability">
            <div className="grid gap-3 sm:grid-cols-2">
              {(draft.listingMode === 'rent' || draft.listingMode === 'both') && (
                <div>
                  <FormLabel
                    help={{
                      title: 'Monthly rent',
                      body: 'Enter the asking rental in ZAR per month, excluding utilities unless your agency bundles them.',
                    }}
                    className="mb-1.5"
                  >
                    Monthly rent
                  </FormLabel>
                  <Input
                  className="min-h-11"
                  type="number"
                  placeholder="Monthly rent (ZAR)"
                  value={draft.rent}
                  onChange={(e) => setDraft((d) => ({ ...d, rent: e.target.value }))}
                />
                </div>
              )}
              {(draft.listingMode === 'sale' || draft.listingMode === 'both') && (
                <div>
                  <FormLabel
                    help={{
                      title: 'Sale price',
                      body: 'The listed purchase price in ZAR. Leave negotiable notes in the description if the owner is flexible.',
                    }}
                    className="mb-1.5"
                  >
                    Sale price
                  </FormLabel>
                  <Input
                  className="min-h-11"
                  type="number"
                  placeholder="Sale price (ZAR)"
                  value={draft.price}
                  onChange={(e) => setDraft((d) => ({ ...d, price: e.target.value }))}
                />
                </div>
              )}
              <div>
                <FormLabel
                  help={{
                    title: 'Deposit hint',
                    body: 'Optional guidance shown to applicants — e.g. one month rent plus admin fee. Not a legal contract amount.',
                  }}
                  className="mb-1.5"
                >
                  Deposit hint
                </FormLabel>
                <Input
                className="min-h-11"
                placeholder="Deposit hint (optional)"
                value={draft.depositHint}
                onChange={(e) => setDraft((d) => ({ ...d, depositHint: e.target.value }))}
              />
              </div>
              <div>
                <FormLabel
                  help={{
                    title: 'Minimum stay',
                    body: 'Shortest lease period you will accept, in days. Common values are 30 for month-to-month or 365 for annual leases.',
                  }}
                  className="mb-1.5"
                >
                  Minimum stay (days)
                </FormLabel>
                <Input
                className="min-h-11"
                type="number"
                placeholder="Minimum stay (days)"
                value={draft.minStayDays}
                onChange={(e) => setDraft((d) => ({ ...d, minStayDays: e.target.value }))}
              />
              </div>
            </div>
            <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-ink-600">
              <input
                type="checkbox"
                checked={draft.instantBook}
                onChange={(e) => setDraft((d) => ({ ...d, instantBook: e.target.checked }))}
              />
              Allow instant booking (when published)
              <FieldHelp
                title="Instant booking"
                body="When enabled, qualified tenants can apply immediately without waiting for agent approval on the listing slot."
              />
            </label>
          </WizardSectionCard>
        )
      case 7:
        return (
          <WizardSectionCard title="Assignment" description="Who owns and manages this listing?">
            <Input
              className="min-h-11"
              placeholder="Listing title"
              value={draft.title}
              onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
              required
            />
            <Input
              className="min-h-11"
              placeholder="Description"
              value={draft.description}
              onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
            />
            {!isLandlord ? (
              <>
                <Select
                  className="min-h-11"
                  value={draft.agencyId}
                  disabled={Boolean(queryAgencyId)}
                  onChange={(e) => setDraft((d) => ({ ...d, agencyId: e.target.value }))}
                >
                  {agencies.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </Select>
                <Select
                  className="min-h-11"
                  value={draft.landlordId}
                  onChange={(e) => setDraft((d) => ({ ...d, landlordId: e.target.value }))}
                >
                  {landlords.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </Select>
                <Select
                  className="min-h-11"
                  value={draft.agentId}
                  onChange={(e) => setDraft((d) => ({ ...d, agentId: e.target.value }))}
                >
                  <option value="">Unassigned agent</option>
                  {agents.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </Select>
              </>
            ) : null}
            {canPublish ? (
              <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-ink-600">
                <input
                  type="checkbox"
                  checked={draft.publishAfterSave}
                  onChange={(e) => setDraft((d) => ({ ...d, publishAfterSave: e.target.checked }))}
                />
                Publish immediately after save
              </label>
            ) : null}
          </WizardSectionCard>
        )
      case 8:
        return (
          <WizardSectionCard title="Review & submit" description="Confirm details before creating the listing.">
            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-ink-400">Title</dt>
                <dd className="font-medium text-ink">{draft.title || draft.unitTitle || '—'}</dd>
              </div>
              <div>
                <dt className="text-ink-400">Type</dt>
                <dd className="font-medium text-ink">{draft.propertyType}</dd>
              </div>
              <div>
                <dt className="text-ink-400">Location</dt>
                <dd className="font-medium text-ink">
                  {[draft.address, draft.suburb, draft.city].filter(Boolean).join(', ')}
                </dd>
              </div>
              <div>
                <dt className="text-ink-400">Rooms</dt>
                <dd className="font-medium text-ink">
                  {beds} beds · {baths} baths · {draft.parking} parking
                </dd>
              </div>
              <div>
                <dt className="text-ink-400">Pricing</dt>
                <dd className="font-medium text-ink">
                  {draft.rent ? `${formatZAR(Number(draft.rent))}/mo` : ''}
                  {draft.rent && draft.price ? ' · ' : ''}
                  {draft.price ? formatZAR(Number(draft.price)) : ''}
                </dd>
              </div>
              <div>
                <dt className="text-ink-400">Photos</dt>
                <dd className="font-medium text-ink">{draft.images.length} uploaded</dd>
              </div>
            </dl>
          </WizardSectionCard>
        )
      default:
        return null
    }
  }

  return (
    <RequirePermission permission="assets.manage">
      <div className="animate-fade-in space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link to={returnTo}>
            <Button type="button" variant="secondary" className="min-h-11 cursor-pointer">
              Cancel
            </Button>
          </Link>
        </div>

        <CreateWizardShell
          title={isLandlord ? 'List a property' : 'Add property'}
          subtitle="Multi-step wizard — building, unit, rooms, and listing in one flow."
          steps={STEPS}
          stepIndex={stepIndex}
          maxReachableIndex={maxReachableIndex}
          onStepSelect={goTo}
          preview={
            <LiveListingPreview
              title={draft.title || draft.unitTitle}
              type={draft.propertyType}
              address={draft.address}
              suburb={draft.suburb}
              city={draft.city}
              beds={beds}
              baths={baths}
              parking={draft.parking}
              rent={draft.rent ? Number(draft.rent) : null}
              price={draft.price ? Number(draft.price) : null}
              listingMode={draft.listingMode}
              coverImage={draft.images[0] ?? null}
            />
          }
          footer={
            <WizardFooter
              showBack={!isFirst}
              onBack={goBack}
              showContinue={!isLast}
              onContinue={handleContinue}
              showSaveDraft={isLast}
              onSaveDraft={saveDraftOnly}
              showSubmit={isLast}
              submitLabel={draft.publishAfterSave && canPublish ? 'Publish listing' : 'Create listing'}
              onSubmit={() => submitProperty('Draft', true)}
              busy={busy}
            />
          }
        >
          {error ? <p className="mb-4 text-sm text-accent-600">{error}</p> : null}
          {renderStep()}
        </CreateWizardShell>
      </div>
    </RequirePermission>
  )
}
