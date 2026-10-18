import { useEffect, useMemo, useRef, useState } from 'react'
import { MAX_LISTING_PHOTOS, MAX_LISTING_PHOTO_BYTES, listingPhotosLabel } from '../../lib/listingPhotos'
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
  BedDouble,
  Bath,
  Car,
  Plus,
  Trash2,
  Warehouse,
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
import { ImageDropzone } from '../../components/ImageDropzone'
import { ListingDescriptionEditor } from '../../components/listing/ListingDescriptionEditor'
import { ExpandableDescription } from '../../components/listing/ExpandableDescription'
import { PropertyFeaturePicker } from '../../components/property-features/PropertyFeaturePicker'
import { PlacesAddressInput } from '../../components/PlacesAddressInput'
import { LocationMapPreview } from '../../components/maps/LocationMapPreview'
import { geocodeAddress } from '../../lib/api/geocoding'
import { Button, Input, Select } from '../../components/ui'
import { FormLabel, FieldHelp } from '../../components/onboarding/FieldHelp'
import { uid } from '../../data/seed'
import { roomKindLabel, type RoomKind } from '../../data/infrastructure'
import { isFieldAgent } from '../../lib/permissions'
import { pruneAmenitiesForMode } from '../../lib/propertyFeatures'
import { readReturnTo } from '../../lib/returnTo'
import { isVerificationApproved } from '../../lib/verification'
import { useWizardDraft, useWizardSteps } from '../../hooks/useWizardSteps'
import { useLookupOptions } from '../../hooks/useLookupOptions'
import { formatZAR } from '../../data/seed'
import {
  gradingLabel,
  inferSolarCapacityKw,
  resolveBuildingGrading,
} from '../../lib/buildingGrading'
import { sanitizeRoomCounts, summarizeRooms } from '../../lib/roomSummary'
import {
  LandlordPicker,
  resolveLandlordAssignment,
  validateLandlordAssignment,
  type LandlordDraft,
} from '../../components/wizard/LandlordPicker'
import {
  applyUnfurnishedListingPreset,
  clearUnfurnishedListingPreset,
  draftAfterAmenitiesChange,
  draftFromProperty,
  defaultWizardRooms,
  emptyWizardAsset,
  type PropertyWizardDraft as PropertyDraft,
  type WizardAssetDraft,
  type WizardRoomDraft as RoomDraft,
} from '../../lib/propertyWizardDraft'
import type { AssetCondition } from '../../data/infrastructure'
import type { PropertyAsset } from '../../types/domain'
import { showTempPasswordOnce } from '../../lib/auth/tempPasswordBus'
import { acquireSubmitLock, releaseSubmitLock } from '../../lib/wizardSubmitGuard'
import { nextUniquePropertyId } from '../../lib/listingIds'
import { shouldRetainWizardDraftPropertyId } from '../../lib/propertyWizardResume'
import { propertyIdFromCreateError } from '../../lib/createPropertyBundleError'
import { sweetError, sweetSuccess, sweetWarning } from '../../lib/sweetAlert'
import { PropertyLoader } from '../../components/loading/PropertyLoader'

const DRAFT_KEY = 'propertyflow:property-create'

const STEPS: WizardStepMeta[] = [
  { id: 'type', label: 'Property type', tip: 'Choose how this asset will be listed and what type of property it is.' },
  { id: 'location', label: 'Location', tip: 'Set the building name and street address. Geocoding improves map search.' },
  { id: 'building', label: 'Building', tip: 'Add listing photos here — they appear on the marketplace. Grade is calculated automatically.' },
  { id: 'rooms', label: 'Unit & rooms', tip: 'Bedrooms, bathrooms, and garages are counted from room kinds — parking bays are set separately.' },
  { id: 'amenities', label: 'Amenities', tip: 'Select features grouped by category — safety, living, kitchen, and more.' },
  { id: 'pricing', label: 'Pricing', tip: 'Set rent and/or sale price, deposit guidance, and availability rules.' },
  { id: 'assignment', label: 'Assignment', tip: 'Set the agency and field agent. Link a landlord only when the property is privately owned.' },
  { id: 'assets', label: 'Assets (optional)', tip: 'Add in-unit inventory (microwave, beds, etc.) — or skip and manage it from the property detail inventory tab.' },
  { id: 'review', label: 'Review', tip: 'Confirm everything before saving as draft or publishing.' },
]

const LISTING_OPTIONS = [
  { value: 'rent', label: 'For rent', blurb: 'Monthly rental listing', icon: KeyRound },
  { value: 'sale', label: 'For sale', blurb: 'Purchase listing', icon: Tag },
  { value: 'both', label: 'Rent & sale', blurb: 'Dual listing mode', icon: Home },
]

const ASSET_TYPES = [
  { value: 'APPLIANCE', label: 'Appliance' },
  { value: 'FURNITURE', label: 'Furniture' },
  { value: 'ELECTRONICS', label: 'Electronics' },
  { value: 'FIXTURE', label: 'Fixture' },
]

const ASSET_CONDITIONS: AssetCondition[] = [
  'Excellent',
  'Good',
  'Fair',
  'Damaged',
  'Needs replacement',
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

function defaultUnitNumber(propertyType: string): string {
  if (['House', 'Townhouse', 'Vacant Land', 'Student Accommodation'].includes(propertyType)) {
    return 'Main'
  }
  return '1'
}

function totalAreaFromRooms(rooms: RoomDraft[]): number {
  return rooms.reduce((sum, room) => sum + (Number(room.areaSqm) || 0), 0)
}

function roomCountsForKind(
  kind: RoomKind,
  current: { beds: number; baths: number },
): { beds: number; baths: number } {
  if (kind === 'bedroom') {
    return { beds: current.beds > 0 ? current.beds : 1, baths: 0 }
  }
  if (kind === 'bathroom') {
    return { beds: 0, baths: current.baths > 0 ? current.baths : 1 }
  }
  return { beds: 0, baths: 0 }
}

function defaultRooms(): RoomDraft[] {
  return defaultWizardRooms()
}

export function PropertyWizardPage({ editPropertyId }: { editPropertyId?: string }) {
  const isEdit = Boolean(editPropertyId)
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const editReturnTo = editPropertyId ? `/workspace/properties/${editPropertyId}` : '/workspace/properties'
  const returnTo = readReturnTo(searchParams) ?? editReturnTo
  const queryAgencyId = searchParams.get('agencyId') ?? ''

  const { state, createPropertyBundle, publishProperty, updateProperty, setPropertyRooms, createUser } = useStore()
  const { user, agencyId, has, role } = useAuth()
  const { scopeAgency } = useAgencyScope()
  const isLandlord = role === 'landlord'
  const landlordVerified = isVerificationApproved(user.verification, user.role)
  const canPublish = has('listings.publish') && landlordVerified

  const isPlatformAdmin = has('platform.manage')
  const isAgencyManager = role === 'agent_admin' || role === 'client_admin'
  const isAgentCreator = isFieldAgent(role)
  const showAgencyPicker = isPlatformAdmin && !queryAgencyId
  const showAgentPicker = (isPlatformAdmin || isAgencyManager) && !isAgentCreator
  const showLandlordPicker = !isLandlord && (isPlatformAdmin || isAgencyManager || isAgentCreator)

  const agencies = state.agencies.filter(
    (a) => (scopeAgency(a.id) || has('platform.manage')) && a.status !== 'Cancelled',
  )
  const scopedBuildings = state.buildings.filter(
    (b) => has('platform.manage') || b.clientId === (queryAgencyId || agencyId),
  )

  const defaultAgencyId = queryAgencyId || (isLandlord ? user.agencyId ?? '' : agencyId ?? agencies[0]?.id ?? '')

  const propertyTypes = useLookupOptions('PROPERTY_TYPE', agencyId)
  const listingModes = useLookupOptions('LISTING_MODE', agencyId)

  const editProperty = isEdit
    ? state.properties.find((p) => p.id === editPropertyId)
    : undefined
  const editBuilding = editProperty?.buildingId
    ? state.buildings.find((b) => b.id === editProperty.buildingId)
    : undefined
  const editInfraRooms =
    editProperty?.unitId != null
      ? state.infraRooms.filter((r) => r.unitId === editProperty.unitId)
      : []

  const createInitialDraft: PropertyDraft = {
    listingMode: 'rent',
    propertyType: 'Apartment',
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
    title: '',
    parking: 1,
    rooms: defaultRooms(),
    amenities: ['Fibre', 'Parking'],
    price: '',
    rent: '',
    depositHint: '',
    minStayDays: '30',
    instantBook: false,
    description: '',
    agencyId: defaultAgencyId,
    landlordId: isLandlord ? user.id : '',
    linkLandlord: false,
    landlordManualName: '',
    landlordManualEmail: '',
    landlordManualPhone: '',
    landlordEntryMode: 'search',
    // P0-agent: never pre-select a person. A field agent lists under their own
    // name; everyone else starts explicitly unassigned and staff assign an
    // agent on purpose (a defaulted "first agent" invented assignments that
    // nobody made).
    agentId: isLandlord ? '' : isFieldAgent(role) ? user.id : '',
    publishAfterSave: isLandlord,
    draftPropertyId: '',
    starterAssets: [],
    listingUnfurnished: false,
  }

  const seedDraft =
    isEdit && editProperty
      ? draftFromProperty(editProperty, editBuilding, editInfraRooms)
      : createInitialDraft

  const wizardScopeKey = queryAgencyId || user.agencyId || user.id || 'none'
  const wizardStorageKey = isEdit
    ? `${DRAFT_KEY}:edit:${editPropertyId}`
    : `${DRAFT_KEY}:${wizardScopeKey}`

  const { draft, setDraft, clearDraft } = useWizardDraft<PropertyDraft>(wizardStorageKey, seedDraft)

  // P0-collision (R10): a leftover wizard draft (sessionStorage) carries a
  // draftPropertyId from a PREVIOUS listing. Submit treated it as "existing
  // draft" and overwrote that listing in place — the rent/sale both landing on
  // unt-ljn8sf. A fresh wizard visit (no ?edit=, no explicit resume) must
  // never inherit it: clear the id once on mount so this wizard's first submit
  // mints a NEW listing. The in-session ref below still lets "Save & continue
  // later" → re-entry within the same mount reuse the id it just created.
  const sessionDraftPropertyIdRef = useRef('')
  const pendingCreateIdsRef = useRef<PropertyDraft['pendingCreateIds']>(undefined)
  const submitLockRef = useRef(false)

  function wizardOwnedDraftId(): string {
    if (sessionDraftPropertyIdRef.current) return sessionDraftPropertyIdRef.current
    if (shouldRetainWizardDraftPropertyId(draft, state.properties) && draft.draftPropertyId) {
      return draft.draftPropertyId
    }
    return ''
  }

  function ensurePendingCreateIds(): NonNullable<PropertyDraft['pendingCreateIds']> {
    const fromDraft = draft.pendingCreateIds ?? pendingCreateIdsRef.current
    const roomIds = draft.rooms.map((r, i) => fromDraft?.roomIds?.[i] ?? r.id ?? uid('rm'))
    if (fromDraft?.propertyId) {
      const ids = {
        propertyId: fromDraft.propertyId,
        buildingId: draft.existingBuildingId ? undefined : fromDraft.buildingId ?? uid('bld'),
        roomIds,
      }
      pendingCreateIdsRef.current = ids
      if (!draft.createIdempotencyKey || draft.pendingCreateIds !== ids) {
        setDraft((d) => ({
          ...d,
          pendingCreateIds: ids,
          createIdempotencyKey: d.createIdempotencyKey ?? `create:${wizardStorageKey}`,
        }))
      }
      return ids
    }
    const propertyId = nextUniquePropertyId(state.properties.map((p) => p.id), () => uid('unt'))
    const ids = {
      propertyId,
      buildingId: draft.existingBuildingId ? undefined : uid('bld'),
      roomIds,
    }
    pendingCreateIdsRef.current = ids
    setDraft((d) => ({
      ...d,
      pendingCreateIds: ids,
      createIdempotencyKey: d.createIdempotencyKey ?? `create:${wizardStorageKey}`,
    }))
    return ids
  }

  function bundleIdempotencyOpts() {
    const pendingIds = ensurePendingCreateIds()
    return {
      ids: pendingIds,
      idempotencyKey: draft.createIdempotencyKey ?? `create:${wizardStorageKey}`,
    }
  }

  useEffect(() => {
    if (isEdit) return
    const retain = shouldRetainWizardDraftPropertyId(draft, state.properties)
    if (retain && draft.resumeDraftPropertyId) {
      sessionDraftPropertyIdRef.current = draft.resumeDraftPropertyId
      if (draft.pendingCreateIds) pendingCreateIdsRef.current = draft.pendingCreateIds
      return
    }
    // P0-5 residual: FA Draft default must not imply live — a leftover
    // sessionStorage draft may revive publishAfterSave:true from a prior run.
    if (draft.draftPropertyId || draft.resumeDraftPropertyId || (isAgentCreator && draft.publishAfterSave)) {
      setDraft((d) => ({
        ...d,
        draftPropertyId: '',
        resumeDraftPropertyId: '',
        pendingCreateIds: undefined,
        ...(isAgentCreator ? { publishAfterSave: false } : {}),
      }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const { stepIndex, maxReachableIndex, goNext, goBack, goTo, markReachable, isFirst, isLast } =
    useWizardSteps({ totalSteps: STEPS.length, storageKey: wizardStorageKey })

  const [busy, setBusy] = useState(false)
  const [busyMessage, setBusyMessage] = useState('Saving…')
  const [geocoding, setGeocoding] = useState(false)

  const locationPreviewCoords = useMemo(() => {
    const hasLocationText = Boolean(
      draft.address.trim() || draft.suburb.trim() || draft.city.trim() || draft.placeId,
    )
    if (!hasLocationText) return { lat: null as number | null, lng: null as number | null }
    return { lat: draft.lat, lng: draft.lng }
  }, [
    draft.address,
    draft.suburb,
    draft.city,
    draft.placeId,
    draft.lat,
    draft.lng,
  ])

  useEffect(() => {
    if (stepIndex !== 1) return
    const address = draft.address.trim()
    const suburb = draft.suburb.trim()
    const city = draft.city.trim()
    if (!address && !suburb && !city) return

    const key = `${address}|${suburb}|${city}`
    const timer = window.setTimeout(() => {
      setGeocoding(true)
      void geocodeAddress({ address, suburb, city })
        .then((result) => {
          setDraft((d) => {
            if (`${d.address.trim()}|${d.suburb.trim()}|${d.city.trim()}` !== key) return d
            return {
              ...d,
              lat: result.lat,
              lng: result.lng,
              placeId: result.placeId ?? d.placeId,
              formattedAddress: result.formattedAddress || d.formattedAddress,
            }
          })
        })
        .finally(() => setGeocoding(false))
    }, 650)
    return () => {
      window.clearTimeout(timer)
      setGeocoding(false)
    }
  }, [stepIndex, draft.address, draft.suburb, draft.city, setDraft])

  useEffect(() => {
    if (isEdit) return
    if (queryAgencyId && draft.agencyId !== queryAgencyId) {
      setDraft((d) => ({ ...d, agencyId: queryAgencyId }))
    }
  }, [queryAgencyId, draft.agencyId, setDraft])

  useEffect(() => {
    if (isEdit) return
    if (isLandlord) return
    if (isAgentCreator) {
      setDraft((d) => ({
        ...d,
        agentId: user.id,
        agencyId: queryAgencyId || user.agencyId || d.agencyId,
      }))
      return
    }
    if (isAgencyManager && !isPlatformAdmin) {
      setDraft((d) => ({
        ...d,
        agencyId: queryAgencyId || user.agencyId || d.agencyId,
      }))
    }
  }, [
    isLandlord,
    isAgentCreator,
    isAgencyManager,
    isPlatformAdmin,
    user.id,
    user.agencyId,
    queryAgencyId,
    setDraft,
  ])

  const listingAgencyId = draft.agencyId || queryAgencyId || agencyId || ''
  const landlordsForAgency = useMemo(
    () =>
      state.users.filter(
        (u) =>
          u.role === 'landlord' &&
          (isPlatformAdmin || u.agencyId === listingAgencyId),
      ),
    [state.users, listingAgencyId, isPlatformAdmin],
  )
  const agentsForAgency = useMemo(
    () =>
      state.users.filter(
        (u) =>
          (u.role === 'ground_agent' || u.role === 'agent_admin' || u.role === 'agent') &&
          (isPlatformAdmin || u.agencyId === listingAgencyId),
      ),
    [state.users, listingAgencyId, isPlatformAdmin],
  )
  const assetTypeOptions = useLookupOptions('ASSET_TYPE', listingAgencyId || null)
  const assetTypes = assetTypeOptions.length ? assetTypeOptions : ASSET_TYPES

  const addStarterAsset = () =>
    setDraft((d) => ({
      ...d,
      starterAssets: [...d.starterAssets, emptyWizardAsset(d.rooms[0]?.name ?? '')],
    }))

  const patchStarterAsset = (id: string, patch: Partial<WizardAssetDraft>) =>
    setDraft((d) => ({
      ...d,
      starterAssets: d.starterAssets.map((a) => (a.id === id ? { ...a, ...patch } : a)),
    }))

  const removeStarterAsset = (id: string) =>
    setDraft((d) => ({ ...d, starterAssets: d.starterAssets.filter((a) => a.id !== id) }))
  const assignedAgencyName =
    agencies.find((a) => a.id === listingAgencyId)?.name ??
    state.agencies.find((a) => a.id === agencyId)?.name

  const roomSummary = useMemo(
    () => summarizeRooms(draft.rooms.map((r) => ({ kind: r.kind, beds: r.beds, baths: r.baths }))),
    [draft.rooms],
  )
  const totalAreaSqm = useMemo(() => totalAreaFromRooms(draft.rooms), [draft.rooms])

  const listingDescriptionContext = useMemo(
    () => ({
      propertyType: draft.propertyType,
      listingMode: draft.listingMode,
      suburb: draft.suburb,
      city: draft.city,
      beds: roomSummary.bedrooms,
      baths: roomSummary.bathrooms,
      parking: draft.parking,
      garages: roomSummary.garages,
      areaSqm: totalAreaSqm > 0 ? totalAreaSqm : undefined,
      rent: draft.rent ? Number(draft.rent) : null,
      price: draft.price ? Number(draft.price) : null,
      amenities: draft.amenities,
      unfurnished: draft.listingUnfurnished,
      title: draft.title,
    }),
    [draft, roomSummary, totalAreaSqm],
  )

  const computedGrading = useMemo(
    () =>
      resolveBuildingGrading({
        hasBorehole: draft.hasBorehole,
        amenities: draft.amenities,
        propertyType: draft.propertyType,
      }),
    [draft.hasBorehole, draft.amenities, draft.propertyType],
  )

  const computedSolarKw = useMemo(() => inferSolarCapacityKw(draft.amenities), [draft.amenities])

  // P0-4 (R4): listing photos must be this listing's own uploads only.
  // Inheriting an existing building's images published another listing's
  // wizard screenshots on the guest sale gallery, so the fallback is gone —
  // the gallery shows a clean empty state until real photos are uploaded.
  const previewImages = useMemo(() => draft.buildingImages, [draft.buildingImages])

  function listingImagesForSubmit(): string[] {
    return draft.buildingImages
  }

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
        // P0-4 (R4): require this listing's own photos — no building fallback.
        if (draft.buildingImages.length === 0) {
          return 'Add at least one listing photo.'
        }
        return null
      case 3: {
        if (draft.rooms.length === 0) return 'Add at least one room.'
        const unnamed = draft.rooms.find((room) => !room.name.trim())
        if (unnamed) return 'Every room needs a name.'
        return null
      }
      case 5:
        if (draft.listingMode !== 'sale' && !draft.rent.trim()) return 'Monthly rent is required for rental listings.'
        if (draft.listingMode !== 'rent' && !draft.price.trim()) return 'Sale price is required for sale listings.'
        return null
      case 6: {
        const resolvedAgency = isLandlord ? user.agencyId ?? draft.agencyId : draft.agencyId
        if (!resolvedAgency) return 'Agency is required.'
        const landlordErr = validateLandlordAssignment(landlordDraftFrom(draft), isLandlord)
        if (landlordErr) return landlordErr
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
      void sweetWarning('Check this step', err)
      return
    }
    markReachable(stepIndex + 1)
    goNext()
  }

  function saveDraftOnly() {
    void submitProperty('Draft', false)
  }

  function canSyncServerDraft(): boolean {
    return Boolean(
      draft.propertyType &&
        (draft.existingBuildingId || draft.buildingName.trim() || draft.address.trim()),
    )
  }

  function landlordDraftFrom(d: PropertyDraft): LandlordDraft {
    return {
      linkLandlord: d.linkLandlord,
      landlordId: d.landlordId,
      landlordManualName: d.landlordManualName,
      landlordManualEmail: d.landlordManualEmail,
      landlordManualPhone: d.landlordManualPhone,
      landlordEntryMode: d.landlordEntryMode,
    }
  }

  function patchLandlordDraft(partial: Partial<LandlordDraft>) {
    setDraft((d) => ({ ...d, ...partial }))
  }

  function buildSubmitContext() {
    const resolvedAgencyId = isLandlord ? user.agencyId ?? draft.agencyId : draft.agencyId
    const resolvedLandlordId = resolveLandlordAssignment(landlordDraftFrom(draft), {
      isLandlordUser: isLandlord,
      currentUserId: user.id,
      agencyId: resolvedAgencyId,
      users: state.users,
      createUser,
      onTempPassword: (pw) => showTempPasswordOnce(pw, 'Landlord created: temporary password'),
    })
    const title = draft.title.trim() || `${draft.propertyType} in ${draft.suburb || draft.city || 'draft'}`
    const unitNumber = defaultUnitNumber(draft.propertyType)
    const listingImages = listingImagesForSubmit()
    const roomRows = draft.rooms.length > 0 ? draft.rooms : defaultRooms()
    const starterAssets = draft.starterAssets
      .filter((a) => a.itemName.trim())
      .map((a) => ({
        roomName: a.roomName,
        itemName: a.itemName.trim(),
        assetTypeKey: a.assetTypeKey,
        brand: a.brand.trim() || undefined,
        condition: a.condition,
      }))

    return { resolvedAgencyId, resolvedLandlordId, title, unitNumber, listingImages, roomRows, starterAssets }
  }

  function buildPropertyPatch(listingImages: string[]) {
    const { resolvedAgencyId, resolvedLandlordId, title, unitNumber, roomRows } = buildSubmitContext()
    return {
      agencyId: resolvedAgencyId,
      landlordId: resolvedLandlordId,
      // P0-5: FA always persists resolvable agentId (self); managers may leave Unassigned.
      agentId: isLandlord
        ? null
        : isAgentCreator
          ? draft.agentId || user.id
          : draft.agentId || null,
      title,
      type: draft.propertyType,
      listingMode: draft.listingMode,
      price: draft.price ? Number(draft.price) : null,
      rent: draft.rent ? Number(draft.rent) : null,
      parking: draft.parking,
      area: totalAreaSqm,
      city: draft.city.trim() || 'Port Elizabeth',
      suburb: draft.suburb.trim() || 'Central',
      address: draft.address.trim() || draft.suburb || 'Address pending',
      lat: draft.lat,
      lng: draft.lng,
      placeId: draft.placeId || null,
      formattedAddress: draft.formattedAddress || null,
      amenities: draft.amenities,
      description: draft.description.trim() || `${draft.propertyType} in ${draft.suburb || draft.city || 'draft'}`,
      images: listingImages,
      solarCapacityKw: computedSolarKw,
      hasBorehole: draft.hasBorehole,
      grading: computedGrading,
      unitNumber,
      beds: roomSummary.bedrooms,
      baths: roomSummary.bathrooms,
      garages: roomSummary.garages,
      rooms: roomRows.map((r) => {
        const clean = sanitizeRoomCounts(r)
        return {
          id: r.id,
          name: clean.name,
          kind: clean.kind,
          beds: clean.beds,
          baths: clean.baths,
          area: clean.areaSqm ? Number(clean.areaSqm) : undefined,
        }
      }),
    }
  }

  async function syncServerDraft(): Promise<string> {
    const { resolvedAgencyId, resolvedLandlordId, title, unitNumber, listingImages, roomRows, starterAssets } =
      buildSubmitContext()

    const persistExisting = (id: string) => {
      const patch = buildPropertyPatch(listingImages)
      const { rooms, ...rest } = patch
      updateProperty(id, rest)
      if (rooms?.length) {
        setPropertyRooms(
          id,
          rooms.map((r) => ({
            id: r.id,
            name: r.name,
            beds: r.beds,
            baths: r.baths,
            area: r.area,
            kind: r.kind,
          })),
        )
      }
      return id
    }

    if (isEdit && editPropertyId) {
      return persistExisting(editPropertyId)
    }

    // P0-collision (R10): same session-scoped rule as submitProperty — a
    // draftPropertyId from leftover sessionStorage belongs to a previous
    // listing; only one recorded during this mount may be updated in place.
    const sessionOwnedId = wizardOwnedDraftId()
    if (sessionOwnedId) {
      return persistExisting(sessionOwnedId)
    }

    const { ids, idempotencyKey } = bundleIdempotencyOpts()
    const created = await createPropertyBundle({
      ids,
      idempotencyKey,
      existingBuildingId: draft.existingBuildingId || undefined,
      building: draft.existingBuildingId
        ? undefined
        : {
            clientId: resolvedAgencyId,
            landlordId: resolvedLandlordId || null,
            name: draft.buildingName.trim() || 'Draft building',
            addressLine1: draft.address.trim() || 'Address pending',
            suburb: draft.suburb.trim() || 'Central',
            city: draft.city.trim() || 'Port Elizabeth',
            province: draft.province.trim() || 'Eastern Cape',
            grading: computedGrading,
            solarCapacityKw: computedSolarKw,
            hasBorehole: draft.hasBorehole,
            lat: draft.lat,
            lng: draft.lng,
            images: draft.buildingImages,
          },
      unitTemplateId: 'custom',
      unit: {
        unitNumber,
        title,
        listingType: draft.listingMode,
        price: draft.price ? Number(draft.price) : null,
        rent: draft.rent ? Number(draft.rent) : null,
        agentId: isLandlord
          ? null
          : isAgentCreator
            ? draft.agentId || user.id
            : draft.agentId || null,
        squareMeters: totalAreaSqm,
        bedrooms: roomSummary.bedrooms,
        bathrooms: roomSummary.bathrooms,
        parking: draft.parking,
        description: draft.description.trim(),
        amenities: draft.amenities,
      },
      rooms: roomRows.map((r) => {
        const clean = sanitizeRoomCounts(r)
        return {
          name: clean.name,
          kind: clean.kind,
          beds: clean.beds,
          baths: clean.baths,
          areaSqm: clean.areaSqm ? Number(clean.areaSqm) : undefined,
        }
      }),
      starterAssets: starterAssets.length ? starterAssets : undefined,
      property: {
        ...buildPropertyPatch(listingImages),
        status: 'Draft',
        featured: false,
      },
    })

    return created.id
  }

  async function handleSaveAndContinueLater() {
    if (!acquireSubmitLock(submitLockRef)) return
    setBusyMessage('Saving progress…')
    setBusy(true)
    try {
      if (canSyncServerDraft()) {
        const id = await syncServerDraft()
        setDraft((d) => ({
          ...d,
          draftPropertyId: id,
          resumeDraftPropertyId: id,
          pendingCreateIds: pendingCreateIdsRef.current ?? d.pendingCreateIds,
        }))
        sessionDraftPropertyIdRef.current = id
      }
      await sweetSuccess('Progress saved', 'You can pick up where you left off.')
      navigate(returnTo)
    } catch (err) {
      const recoveredId = propertyIdFromCreateError(err)
      if (recoveredId) {
        sessionDraftPropertyIdRef.current = recoveredId
        setDraft((d) => ({
          ...d,
          draftPropertyId: recoveredId,
          pendingCreateIds: pendingCreateIdsRef.current ?? d.pendingCreateIds,
        }))
      }
      const message =
        err instanceof Error && err.message
          ? err.message
          : 'Could not save your progress. Try again.'
      await sweetError('Could not save progress', message)
    } finally {
      setBusy(false)
      releaseSubmitLock(submitLockRef)
    }
  }

  /** Assets step: finish the listing as a Draft now, add inventory on the detail page. */
  async function handleAddAssetsLater() {
    if (!canSyncServerDraft()) {
      void sweetWarning(
        'Location required',
        'Add a building name or street address first so the listing can be saved.',
      )
      goTo(1)
      return
    }
    if (!acquireSubmitLock(submitLockRef)) return
    setBusyMessage('Saving draft…')
    setBusy(true)
    try {
      const id = await syncServerDraft()
      setDraft((d) => ({
        ...d,
        draftPropertyId: id,
        resumeDraftPropertyId: id,
        pendingCreateIds: pendingCreateIdsRef.current ?? d.pendingCreateIds,
      }))
      sessionDraftPropertyIdRef.current = id
      clearDraft()
      try {
        sessionStorage.removeItem(`${wizardStorageKey}:step`)
      } catch {
        /* ignore */
      }
      await sweetSuccess('Draft saved', 'Add inventory from the property detail page.')
      navigate(`/workspace/properties/${id}?tab=inventory`)
    } catch (err) {
      const recoveredId = propertyIdFromCreateError(err)
      if (recoveredId) {
        sessionDraftPropertyIdRef.current = recoveredId
        setDraft((d) => ({
          ...d,
          draftPropertyId: recoveredId,
          pendingCreateIds: pendingCreateIdsRef.current ?? d.pendingCreateIds,
        }))
      }
      await sweetError('Could not save listing', 'Try again in a moment.')
    } finally {
      setBusy(false)
      releaseSubmitLock(submitLockRef)
    }
  }

  async function submitProperty(status: 'Draft' | 'Published', fromReview: boolean) {
    if (!acquireSubmitLock(submitLockRef)) return
    const willPublish =
      (fromReview && draft.publishAfterSave && canPublish) || (status === 'Published' && canPublish)
    setBusyMessage(
      willPublish
        ? 'Publishing listing…'
        : isEdit
          ? 'Saving changes…'
          : 'Saving draft…',
    )
    setBusy(true)
    try {
    const err = validateStep(6)
    if (err) {
      await sweetWarning('Check assignment & title', err)
      if (fromReview) goTo(6)
      return
    }
    const listingImages = listingImagesForSubmit()
    if (listingImages.length === 0) {
      await sweetWarning('Photos required', 'Add at least one listing photo.')
      goTo(2)
      return
    }
    const patch = buildPropertyPatch(listingImages)
    // P0-collision (R10): only a draftPropertyId recorded during THIS wizard
    // session is a legitimate "existing draft" to update. A value restored
    // from leftover sessionStorage belongs to a previous listing — reusing it
    // overwrote that listing (the unt-ljn8sf rent/sale collision).
    const existingDraftId = isEdit ? editPropertyId! : wizardOwnedDraftId() || null

    let propertyId: string
    // P0-publish (R7): snapshot of a property created in this same tick —
    // lets publishProperty resolve it before React re-renders.
    let createdProperty: PropertyAsset | undefined
    if (existingDraftId) {
      const { rooms, ...rest } = patch
      updateProperty(existingDraftId, rest)
      if (rooms?.length) {
        setPropertyRooms(
          existingDraftId,
          rooms.map((r) => ({
            id: r.id,
            name: r.name,
            beds: r.beds,
            baths: r.baths,
            area: r.area,
            kind: r.kind,
          })),
        )
      }
      propertyId = existingDraftId
    } else {
      const { resolvedAgencyId, resolvedLandlordId, title, unitNumber, roomRows, starterAssets } = buildSubmitContext()
      const { ids, idempotencyKey } = bundleIdempotencyOpts()
      const created = await createPropertyBundle({
        ids,
        idempotencyKey,
        existingBuildingId: draft.existingBuildingId || undefined,
        building: draft.existingBuildingId
          ? undefined
          : {
              clientId: resolvedAgencyId,
              landlordId: resolvedLandlordId || null,
              name: draft.buildingName.trim(),
              addressLine1: draft.address.trim(),
              suburb: draft.suburb.trim() || 'Central',
              city: draft.city.trim() || 'Port Elizabeth',
              province: draft.province.trim() || 'Eastern Cape',
              grading: computedGrading,
              solarCapacityKw: computedSolarKw,
              hasBorehole: draft.hasBorehole,
              lat: draft.lat,
              lng: draft.lng,
              images: draft.buildingImages,
            },
        unitTemplateId: 'custom',
        unit: {
          unitNumber,
          title,
          listingType: draft.listingMode,
          price: draft.price ? Number(draft.price) : null,
          rent: draft.rent ? Number(draft.rent) : null,
          agentId: isLandlord
          ? null
          : isAgentCreator
            ? draft.agentId || user.id
            : draft.agentId || null,
          squareMeters: totalAreaSqm,
          bedrooms: roomSummary.bedrooms,
          bathrooms: roomSummary.bathrooms,
          parking: draft.parking,
          description: draft.description.trim(),
          amenities: draft.amenities,
        },
        rooms: roomRows.map((r) => {
          const clean = sanitizeRoomCounts(r)
          return {
            name: clean.name,
            kind: clean.kind,
            beds: clean.beds,
            baths: clean.baths,
            areaSqm: clean.areaSqm ? Number(clean.areaSqm) : undefined,
          }
        }),
        starterAssets: starterAssets.length ? starterAssets : undefined,
        property: {
          ...patch,
          status: 'Draft',
          featured: false,
        },
      })
      // P0-publish (R7): remember the created snapshot — publishProperty runs
      // in the same tick, before React has re-rendered the new property into
      // committed state.
      createdProperty = created
      propertyId = created.id
      // P0-collision (R10): this mount now owns a real listing id — later
      // saves in the same session update THIS listing, not a new one.
      sessionDraftPropertyIdRef.current = created.id
    }

    const shouldPublish = willPublish
    if (shouldPublish) {
      // P0-5: await durable publish; do not navigate "live" until committed.
      // P0-publish (R7): pass the same-tick created snapshot so publish can
      // resolve the new property before React re-renders; a false result
      // means the listing did not go live.
      const published = await publishProperty(propertyId, 'Published', createdProperty)
      if (!published) {
        await sweetWarning(
          'Saved as draft',
          'Could not publish the listing. It was saved as a draft — retry from the listing page.',
        )
        return
      }
    }

    clearDraft()
    try {
      sessionStorage.removeItem(`${wizardStorageKey}:step`)
    } catch {
      /* ignore */
    }
    // P0-collision (R10): a detail URL the current store can't resolve yet
    // (the async bootstrap refresh may not have landed the new row) renders a
    // "not found" dead end — fall back to the list, which is always valid.
    const targetInStore =
      state.properties.some((p) => p.id === propertyId) || Boolean(createdProperty)
    const detailPath = `/workspace/properties/${propertyId}`
    const detailTarget = targetInStore ? detailPath : returnTo
    const successTitle = shouldPublish
      ? 'Listing published'
      : isEdit
        ? 'Changes saved'
        : 'Draft saved'
    await sweetSuccess(successTitle)
    navigate(detailTarget)
    } catch (err) {
      const recoveredId = propertyIdFromCreateError(err)
      if (recoveredId) {
        sessionDraftPropertyIdRef.current = recoveredId
        setDraft((d) => ({
          ...d,
          draftPropertyId: recoveredId,
          pendingCreateIds: pendingCreateIdsRef.current ?? d.pendingCreateIds,
        }))
      }
      const message =
        err instanceof Error && err.message
          ? err.message
          : 'Could not save the listing. Try again.'
      await sweetError('Could not save listing', message)
    } finally {
      setBusy(false)
      releaseSubmitLock(submitLockRef)
    }
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
                    hasBorehole: b?.hasBorehole ?? d.hasBorehole,
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
            {geocoding ? (
              <div className="mt-1 flex items-center gap-2 text-sm text-ink-500">
                <PropertyLoader size="sm" inline label="Updating map location" />
                Updating map location…
              </div>
            ) : null}
            <LocationMapPreview
              lat={locationPreviewCoords.lat}
              lng={locationPreviewCoords.lng}
              className="mt-1"
            />
          </WizardSectionCard>
        )
      case 2:
        return (
          <WizardSectionCard title="Building details" description="Sustainability features and listing photos for the marketplace.">
            <div className="flex flex-wrap items-start gap-4">
              <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-primary-100 px-3 text-sm">
                <input
                  type="checkbox"
                  checked={draft.hasBorehole}
                  onChange={(e) => setDraft((d) => ({ ...d, hasBorehole: e.target.checked }))}
                />
                Borehole on site
              </label>
              <div className="rounded-lg border border-primary-100 bg-primary-50/40 px-4 py-3">
                <p className="text-xs font-medium text-ink-500">Building grade</p>
                <p className="mt-1 text-sm font-semibold text-ink">{gradingLabel(computedGrading)}</p>
                <p className="mt-1 text-xs text-ink-400">
                  Calculated from borehole, amenities, and property type — updates as you complete the wizard.
                </p>
              </div>
            </div>
            <ImageDropzone
              label={listingPhotosLabel(draft.buildingImages.length)}
              value={draft.buildingImages}
              onChange={(buildingImages) => setDraft((d) => ({ ...d, buildingImages }))}
              max={MAX_LISTING_PHOTOS}
              maxBytes={MAX_LISTING_PHOTO_BYTES}
              reorderable
            />
          </WizardSectionCard>
        )
      case 3:
        return (
          <WizardSectionCard
            title="Unit & rooms"
            description="Add each room by name and kind. Bedrooms, bathrooms, and garages are counted automatically for listing features."
          >
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { icon: BedDouble, label: 'Bedrooms', value: roomSummary.bedrooms },
                { icon: Bath, label: 'Bathrooms', value: roomSummary.bathrooms },
                { icon: Warehouse, label: 'Garages', value: roomSummary.garages },
                { icon: Car, label: 'Parking bays', value: draft.parking },
              ].map((item) => (
                <div
                  key={item.label}
                  className="rounded-xl border border-primary-100 bg-primary-50/50 px-4 py-3"
                >
                  <item.icon className="h-4 w-4 text-primary" strokeWidth={1.6} aria-hidden />
                  <p className="mt-2 text-xs text-ink-500">{item.label}</p>
                  <p className="tabular text-lg font-semibold text-ink">{item.value}</p>
                </div>
              ))}
            </div>
            <p className="text-xs text-ink-400">
              Add bedroom, bathroom, and garage rooms below — other room kinds (kitchen, lounge, etc.) do not affect these counts.
            </p>
            <label className="flex min-h-11 cursor-pointer items-start gap-2 rounded-xl border border-primary-100 bg-primary-50/40 px-3 py-3 text-sm text-ink-700">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={Boolean(draft.listingUnfurnished)}
                onChange={(e) => {
                  const on = e.target.checked
                  setDraft((d) =>
                    on
                      ? applyUnfurnishedListingPreset(d, d.listingMode)
                      : clearUnfurnishedListingPreset(d),
                  )
                }}
              />
              <span>
                {draft.listingMode === 'sale'
                  ? 'No bedrooms (open plan)'
                  : 'Unfurnished (no bedrooms)'}
                <span className="mt-0.5 block text-xs font-normal text-ink-500">
                  {draft.listingMode === 'sale'
                    ? 'Uses an open-plan room layout with 0 bedrooms on the listing.'
                    : 'Sets the Unfurnished feature, clears starter inventory, and uses 0 bedrooms.'}
                </span>
              </span>
            </label>
            <CounterPillRow label="Open parking bays" value={draft.parking} onChange={(parking) => setDraft((d) => ({ ...d, parking }))} />
            <div className="overflow-x-auto rounded-lg border border-primary-100">
              <table className="min-w-full text-sm">
                <thead className="bg-primary-50/60 text-left text-xs uppercase tracking-wide text-ink-500">
                  <tr>
                    <th className="px-3 py-2">Room name</th>
                    <th className="px-3 py-2">Kind</th>
                    <th className="px-3 py-2">Beds</th>
                    <th className="px-3 py-2">Baths</th>
                    <th className="px-3 py-2">m² (optional)</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {draft.rooms.map((room, idx) => (
                    <tr key={room.id} className="border-t border-primary-50">
                      <td className="px-2 py-2">
                        <Input
                          className="min-h-10"
                          placeholder="Room name"
                          value={room.name}
                          required
                          aria-required
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
                          onChange={(e) => {
                            const kind = e.target.value as RoomKind
                            setDraft((d) => ({
                              ...d,
                              rooms: d.rooms.map((r, i) =>
                                i === idx ? { ...r, kind, ...roomCountsForKind(kind, r) } : r,
                              ),
                            }))
                          }}
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
                        {room.kind === 'bedroom' ? (
                          <Input
                            className="min-h-10 w-16"
                            type="number"
                            min={1}
                            value={room.beds}
                            aria-label={`Beds in ${room.name || 'room'}`}
                            onChange={(e) =>
                              setDraft((d) => ({
                                ...d,
                                rooms: d.rooms.map((r, i) =>
                                  i === idx ? { ...r, beds: Math.max(1, Number(e.target.value) || 1) } : r,
                                ),
                              }))
                            }
                          />
                        ) : (
                          <span className="block px-2 text-ink-300" aria-hidden>
                            —
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-2">
                        {room.kind === 'bathroom' ? (
                          <Input
                            className="min-h-10 w-16"
                            type="number"
                            min={1}
                            step={0.5}
                            value={room.baths}
                            aria-label={`Baths in ${room.name || 'room'}`}
                            onChange={(e) =>
                              setDraft((d) => ({
                                ...d,
                                rooms: d.rooms.map((r, i) =>
                                  i === idx ? { ...r, baths: Math.max(1, Number(e.target.value) || 1) } : r,
                                ),
                              }))
                            }
                          />
                        ) : (
                          <span className="block px-2 text-ink-300" aria-hidden>
                            —
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-2">
                        <Input
                          className="min-h-10 w-20"
                          type="number"
                          min={0}
                          placeholder="Optional"
                          value={room.areaSqm}
                          aria-label={`Size of ${room.name || 'room'} in square metres`}
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
              onChange={(amenities) => setDraft((d) => draftAfterAmenitiesChange(d, amenities))}
            />
          </WizardSectionCard>
        )
      case 5:
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
      case 6:
        return (
          <WizardSectionCard title="Assignment" description="Who owns and manages this listing?">
            {!isLandlord ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-3 text-sm text-emerald-950">
                <p className="font-semibold">Landlord is optional</p>
                <p className="mt-1 text-emerald-900/90">
                  Choose <strong>Agency-owned</strong> below if this is your agency’s stock — you do not need a landlord
                  on file to save. Use <strong>People → Landlords</strong> in the sidebar to manage owners separately.
                </p>
              </div>
            ) : null}
            <Input
              className="min-h-11"
              placeholder="Listing title"
              value={draft.title}
              onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
              required
            />
            <ListingDescriptionEditor
              id="property-create-description"
              value={draft.description}
              onChange={(description) => setDraft((d) => ({ ...d, description }))}
              listingContext={listingDescriptionContext}
            />
            {draft.description.trim() ? (
              <div className="rounded-xl border border-primary-100 bg-primary-50/40 p-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-400">Listing preview</p>
                <ExpandableDescription text={draft.description} fadeFromClassName="from-primary-50/40" />
              </div>
            ) : null}
            {!isLandlord ? (
              <>
                {isAgentCreator ? (
                  <div className="rounded-xl border border-primary-100 bg-primary-50/50 px-4 py-3 text-sm">
                    <p className="text-xs font-medium text-ink-500">Assigned to you</p>
                    <p className="mt-1 font-semibold text-ink">{user.name}</p>
                    <p className="mt-1 text-ink-500">{assignedAgencyName ?? 'Your agency'}</p>
                  </div>
                ) : null}
                {showAgencyPicker ? (
                  <div>
                    <FormLabel className="mb-1.5">Agency</FormLabel>
                    <Select
                      className="min-h-11"
                      value={draft.agencyId}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          agencyId: e.target.value,
                          landlordId: '',
                          linkLandlord: false,
                          landlordManualName: '',
                          landlordManualEmail: '',
                          landlordManualPhone: '',
                          agentId: '',
                        }))
                      }
                    >
                      {agencies.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                ) : null}
                {showLandlordPicker ? (
                  <div>
                    <FormLabel className="mb-1.5">Landlord</FormLabel>
                    <LandlordPicker
                      landlords={landlordsForAgency}
                      value={landlordDraftFrom(draft)}
                      onChange={patchLandlordDraft}
                    />
                  </div>
                ) : null}
                {showAgentPicker ? (
                  <div>
                    <FormLabel className="mb-1.5">Field agent</FormLabel>
                    <Select
                      className="min-h-11"
                      value={draft.agentId}
                      onChange={(e) => setDraft((d) => ({ ...d, agentId: e.target.value }))}
                    >
                      <option value="">Unassigned agent</option>
                      {agentsForAgency.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                ) : null}
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
      case 7:
        return (
          <WizardSectionCard
            title="Assets (optional)"
            description="List furniture, appliances, and other in-unit items now — they appear on the property's inventory tab for maintenance and inspections."
          >
            <div className="space-y-4">
              {draft.starterAssets.length === 0 ? (
                <p className="text-sm text-ink-500">
                  No inventory items yet. Adding them now saves a trip to the property detail page later.
                </p>
              ) : null}
              <div className="space-y-3">
                {draft.starterAssets.map((asset) => (
                  <div
                    key={asset.id}
                    className="grid gap-2 rounded-2xl border border-primary-100 bg-white p-3 sm:grid-cols-[1.4fr_1fr_1fr_1fr_auto]"
                  >
                    <Input
                      aria-label="Item name"
                      placeholder="Item name (e.g. Fridge-freezer)"
                      value={asset.itemName}
                      onChange={(e) => patchStarterAsset(asset.id, { itemName: e.target.value })}
                    />
                    <Select
                      aria-label="Asset type"
                      value={asset.assetTypeKey}
                      onChange={(e) => patchStarterAsset(asset.id, { assetTypeKey: e.target.value })}
                    >
                      {assetTypes.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </Select>
                    <Select
                      aria-label="Room"
                      value={asset.roomName}
                      onChange={(e) => patchStarterAsset(asset.id, { roomName: e.target.value })}
                    >
                      <option value="">Unassigned room</option>
                      {draft.rooms.map((r) => (
                        <option key={r.id} value={r.name}>
                          {r.name || 'Unnamed room'}
                        </option>
                      ))}
                    </Select>
                    <Input
                      aria-label="Brand (optional)"
                      placeholder="Brand (optional)"
                      value={asset.brand}
                      onChange={(e) => patchStarterAsset(asset.id, { brand: e.target.value })}
                    />
                    <div className="flex items-center gap-2">
                      <Select
                        aria-label="Condition"
                        className="min-w-0 flex-1"
                        value={asset.condition}
                        onChange={(e) =>
                          patchStarterAsset(asset.id, { condition: e.target.value as AssetCondition })
                        }
                      >
                        {ASSET_CONDITIONS.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </Select>
                      <Button
                        type="button"
                        variant="secondary"
                        aria-label={`Remove ${asset.itemName || 'asset'}`}
                        className="min-h-11 shrink-0 cursor-pointer px-3"
                        onClick={() => removeStarterAsset(asset.id)}
                      >
                        <Trash2 className="h-4 w-4 text-ink-500" strokeWidth={1.6} aria-hidden />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-3">
                <Button type="button" className="cursor-pointer" onClick={addStarterAsset}>
                  <Plus className="h-4 w-4" strokeWidth={1.6} aria-hidden />
                  Add asset
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  className="cursor-pointer"
                  onClick={() => goTo(stepIndex + 1)}
                >
                  Skip for now
                </Button>
                {!isEdit ? (
                  <Button
                    type="button"
                    variant="secondary"
                    className="cursor-pointer"
                    disabled={busy}
                    onClick={handleAddAssetsLater}
                  >
                    Add assets later in property detail
                  </Button>
                ) : null}
              </div>
            </div>
          </WizardSectionCard>
        )
      case 8:
        return (
          <WizardSectionCard title="Review & submit" description="Confirm details before creating the listing.">
            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-ink-400">Title</dt>
                <dd className="font-medium text-ink">{draft.title || '—'}</dd>
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
                  {roomSummary.bedrooms} bed · {roomSummary.bathrooms} bath
                  {roomSummary.garages > 0 ? ` · ${roomSummary.garages} garage` : ''}
                  {draft.parking > 0 ? ` · ${draft.parking} parking` : ''}
                </dd>
              </div>
              <div>
                <dt className="text-ink-400">Total size</dt>
                <dd className="font-medium text-ink">
                  {totalAreaSqm > 0 ? `${totalAreaSqm.toLocaleString()} m²` : '—'}
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
                <dd className="font-medium text-ink">{previewImages.length} uploaded</dd>
              </div>
              <div>
                <dt className="text-ink-400">Landlord</dt>
                <dd className="font-medium text-ink">
                  {isLandlord
                    ? user.name
                    : draft.linkLandlord
                      ? draft.landlordId
                        ? (landlordsForAgency.find((u) => u.id === draft.landlordId)?.name ?? 'Linked landlord')
                        : draft.landlordManualName.trim() || 'New landlord (on save)'
                      : 'Agency-owned'}
                </dd>
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
          title={isEdit ? 'Edit property' : isLandlord ? 'List a property' : 'Add property'}
          subtitle={
            isEdit
              ? 'Update listing details across the same steps as create. Progress is saved until you finish.'
              : 'Multi-step wizard — save and continue later at any time. Your progress is kept until you finish.'
          }
          steps={STEPS}
          stepIndex={stepIndex}
          maxReachableIndex={maxReachableIndex}
          onStepSelect={goTo}
          preview={
            <LiveListingPreview
              title={draft.title}
              type={draft.propertyType}
              buildingName={draft.buildingName}
              address={draft.address}
              suburb={draft.suburb}
              city={draft.city}
              beds={roomSummary.bedrooms}
              baths={roomSummary.bathrooms}
              garages={roomSummary.garages}
              parking={draft.parking}
              area={totalAreaSqm}
              rent={draft.rent ? Number(draft.rent) : null}
              price={draft.price ? Number(draft.price) : null}
              listingMode={draft.listingMode}
              images={previewImages}
              amenities={draft.amenities}
              description={draft.description}
              grading={computedGrading}
              solarCapacityKw={computedSolarKw}
              hasBorehole={draft.hasBorehole}
              instantBook={draft.instantBook}
              minStayDays={draft.minStayDays ? Number(draft.minStayDays) : null}
              depositHint={draft.depositHint}
            />
          }
          footer={
            <WizardFooter
              showBack={!isFirst}
              onBack={goBack}
              showSaveAndContinueLater
              onSaveAndContinueLater={handleSaveAndContinueLater}
              showContinue={!isLast}
              onContinue={handleContinue}
              showSaveDraft={isLast && !isEdit && !(draft.publishAfterSave && canPublish)}
              onSaveDraft={saveDraftOnly}
              showSubmit={isLast && (isEdit || (draft.publishAfterSave && canPublish))}
              submitLabel={
                isEdit
                  ? draft.publishAfterSave && canPublish
                    ? 'Save & publish'
                    : 'Save changes'
                  : draft.publishAfterSave && canPublish
                    ? 'Publish listing'
                    : 'Save as draft'
              }
              onSubmit={() =>
                void submitProperty(
                  !isEdit && draft.publishAfterSave && canPublish ? 'Published' : 'Draft',
                  true,
                )
              }
              busy={busy}
              submitBusyLabel={
                isEdit
                  ? draft.publishAfterSave && canPublish
                    ? 'Publishing…'
                    : 'Saving…'
                  : draft.publishAfterSave && canPublish
                    ? 'Publishing…'
                    : 'Saving draft…'
              }
              saveDraftBusyLabel="Saving draft…"
              saveAndContinueLaterBusyLabel="Saving…"
            />
          }
        >
          <div className="relative">
            {(stepIndex > 0 || draft.draftPropertyId) && (
              <p className="mb-4 rounded-lg border border-primary-100 bg-primary-50/60 px-3 py-2 text-sm text-ink-600">
                Progress is saved automatically. Use <strong>Save &amp; continue later</strong> to exit and pick up where you left off.
              </p>
            )}
            <div className={busy ? 'pointer-events-none select-none opacity-60' : undefined}>
              {renderStep()}
            </div>
            {busy ? (
              <div
                className="absolute inset-0 z-10 flex items-center justify-center bg-white/75"
                aria-live="polite"
              >
                <PropertyLoader size="md" label={busyMessage} />
              </div>
            ) : null}
          </div>
        </CreateWizardShell>
      </div>
    </RequirePermission>
  )
}

export default function PropertyCreatePage() {
  return <PropertyWizardPage />
}
