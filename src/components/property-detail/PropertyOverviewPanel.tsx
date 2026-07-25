import { useEffect, useState } from 'react'
import { Bath, BedDouble, Car, ChevronLeft, ChevronRight, MapPin } from 'lucide-react'
import type { PropertyAsset, AppUser } from '../../types/domain'
import { ImageDropzone } from '../ImageDropzone'
import { PropertyFeaturePicker } from '../property-features/PropertyFeaturePicker'
import { PropertyFeaturesDisplay } from '../property-features/PropertyFeaturesDisplay'
import { Badge, Button, Input, Modal, Select, Textarea, cn } from '../ui'
import { formatZAR } from '../../data/seed'
import { pruneAmenitiesForMode } from '../../lib/propertyFeatures'
import { resolvePortfolioStatus } from '../../lib/propertyStatus'
import { ICON_STROKE } from './types'

const STATUSES: PropertyAsset['status'][] = [
  'Draft',
  'Published',
  'Featured',
  'Under Offer',
  'Sold',
  'Rented',
  'Archived',
  'Maintenance',
]

export function PropertyOverviewPanel({
  property,
  occupancy,
  agent,
  landlord,
  agents,
  landlords,
  roomCount,
  assetCount,
  appCount,
  editOpen,
  onEditOpenChange,
  onSave,
}: {
  property: PropertyAsset
  occupancy?: string | null
  agent?: AppUser
  landlord?: AppUser
  agents: AppUser[]
  landlords: AppUser[]
  roomCount: number
  assetCount: number
  appCount: number
  editOpen: boolean
  onEditOpenChange: (open: boolean) => void
  onSave: (patch: Partial<PropertyAsset>) => void
}) {
  const [draft, setDraft] = useState(property)
  const [photoIndex, setPhotoIndex] = useState(0)
  const resolved = resolvePortfolioStatus(property.status, occupancy)
  const photos = property.images.length ? property.images : []
  const current = photos[photoIndex] ?? null

  useEffect(() => {
    setPhotoIndex(0)
  }, [property.id])

  useEffect(() => {
    if (editOpen) setDraft(property)
  }, [editOpen, property])

  const prevPhoto = () => {
    if (photos.length < 2) return
    setPhotoIndex((i) => (i - 1 + photos.length) % photos.length)
  }
  const nextPhoto = () => {
    if (photos.length < 2) return
    setPhotoIndex((i) => (i + 1) % photos.length)
  }

  const save = () => {
    onSave({
      title: draft.title.trim(),
      description: draft.description.trim(),
      address: draft.address.trim(),
      suburb: draft.suburb.trim(),
      city: draft.city.trim(),
      type: draft.type,
      listingMode: draft.listingMode,
      status: draft.status,
      price: draft.price,
      rent: draft.rent,
      beds: draft.beds,
      baths: draft.baths,
      parking: draft.parking,
      area: draft.area,
      agentId: draft.agentId,
      landlordId: draft.landlordId,
      amenities: draft.amenities,
      images: draft.images,
      floorPlan: draft.floorPlan,
    })
    onEditOpenChange(false)
  }

  return (
    <div className="space-y-8">
      <div className="grid gap-8 lg:grid-cols-2">
        <div className="min-w-0">
          <div className="relative aspect-[16/9] w-full">
            {current ? (
              <img src={current} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-sm text-ink-400">
                No photos yet
              </div>
            )}
            {photos.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={prevPhoto}
                  aria-label="Previous photo"
                  className="absolute left-3 top-1/2 inline-flex min-h-11 min-w-11 -translate-y-1/2 cursor-pointer items-center justify-center bg-white/90 text-ink transition-colors duration-200 hover:bg-white hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <ChevronLeft className="h-5 w-5" strokeWidth={ICON_STROKE} aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={nextPhoto}
                  aria-label="Next photo"
                  className="absolute right-3 top-1/2 inline-flex min-h-11 min-w-11 -translate-y-1/2 cursor-pointer items-center justify-center bg-white/90 text-ink transition-colors duration-200 hover:bg-white hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <ChevronRight className="h-5 w-5" strokeWidth={ICON_STROKE} aria-hidden />
                </button>
                <p className="absolute bottom-3 right-3 bg-ink/70 px-2.5 py-1 text-[11px] tabular text-white">
                  {photoIndex + 1} / {photos.length}
                </p>
              </>
            )}
          </div>
          {photos.length > 1 && (
            <div className="mt-3 flex gap-2 overflow-x-auto [scrollbar-width:thin]">
              {photos.map((src, i) => (
                <button
                  key={`${src}-${i}`}
                  type="button"
                  onClick={() => setPhotoIndex(i)}
                  aria-label={`Show photo ${i + 1}`}
                  aria-pressed={i === photoIndex}
                  className={cn(
                    'h-14 w-20 shrink-0 cursor-pointer overflow-hidden transition-opacity duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                    i === photoIndex ? 'opacity-100' : 'opacity-50 hover:opacity-80',
                  )}
                >
                  <img src={src} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <section>
            <h2 className="font-semibold text-ink">About</h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-600">{property.description}</p>
            <div className="mt-4">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-400">
                Features
              </h3>
              <PropertyFeaturesDisplay amenities={property.amenities} compact />
            </div>
          </section>

          <section>
            <p className="tabular text-2xl font-bold text-ink">
              {property.listingMode === 'rent' || (property.listingMode === 'both' && !property.price)
                ? (
                    <>
                      {formatZAR(property.rent)}
                      <span className="text-base font-medium text-ink-500"> / mo</span>
                    </>
                  )
                : formatZAR(property.price)}
            </p>
            {property.listingMode === 'both' && property.price != null && property.rent != null && (
              <p className="mt-1 tabular text-sm font-medium text-ink-500">
                or {formatZAR(property.rent)} / mo to rent
              </p>
            )}
            <Badge className="mt-2" tone={resolved.tone}>
              {resolved.label}
            </Badge>
            <div className="mt-4 space-y-2 text-sm text-ink-600">
              <p className="flex flex-wrap items-center gap-2">
                <BedDouble className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
                <span className="tabular">{property.beds}</span> beds ·{' '}
                <Bath className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
                <span className="tabular">{property.baths}</span> baths ·{' '}
                <Car className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
                <span className="tabular">{property.parking}</span>
              </p>
              <p className="flex items-center gap-2">
                <MapPin className="h-4 w-4 shrink-0" strokeWidth={ICON_STROKE} aria-hidden />
                {property.address}
              </p>
              <p>
                Agent: <strong>{agent?.name ?? '—'}</strong>
              </p>
              <p>
                Landlord: <strong>{landlord?.name ?? '—'}</strong>
              </p>
            </div>
          </section>
        </div>
      </div>

      <section className="grid grid-cols-3 gap-2 border-t border-primary-100 pt-6 text-center">
        <div>
          <p className="tabular text-xl font-semibold sm:text-2xl">{roomCount}</p>
          <p className="text-[11px] text-ink-500">Rooms</p>
        </div>
        <div>
          <p className="tabular text-xl font-semibold sm:text-2xl">{assetCount}</p>
          <p className="text-[11px] text-ink-500">Assets</p>
        </div>
        <div>
          <p className="tabular text-xl font-semibold sm:text-2xl">{appCount}</p>
          <p className="text-[11px] text-ink-500">Apps</p>
        </div>
      </section>

      <Modal
        open={editOpen}
        onClose={() => onEditOpenChange(false)}
        title="Edit property"
        description="Update listing details and status."
        size="lg"
        footer={
          <>
            <Button variant="secondary" className="min-h-11" onClick={() => onEditOpenChange(false)}>
              Cancel
            </Button>
            <Button className="min-h-11" onClick={save}>
              Save changes
            </Button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-xs font-medium text-ink-500 sm:col-span-2">
            Status
            <Select
              className="mt-1 min-h-11 w-full"
              value={draft.status}
              onChange={(e) =>
                setDraft({ ...draft, status: e.target.value as PropertyAsset['status'] })
              }
            >
              {STATUSES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </Select>
          </label>
          <label className="block text-xs font-medium text-ink-500 sm:col-span-2">
            Title
            <Input
              className="mt-1 min-h-11"
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            />
          </label>
          <label className="block text-xs font-medium text-ink-500 sm:col-span-2">
            Description
            <Textarea
              className="mt-1 min-h-28"
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            />
          </label>
          <label className="block text-xs font-medium text-ink-500">
            Address
            <Input
              className="mt-1 min-h-11"
              value={draft.address}
              onChange={(e) => setDraft({ ...draft, address: e.target.value })}
            />
          </label>
          <label className="block text-xs font-medium text-ink-500">
            Suburb
            <Input
              className="mt-1 min-h-11"
              value={draft.suburb}
              onChange={(e) => setDraft({ ...draft, suburb: e.target.value })}
            />
          </label>
          <label className="block text-xs font-medium text-ink-500">
            City
            <Input
              className="mt-1 min-h-11"
              value={draft.city}
              onChange={(e) => setDraft({ ...draft, city: e.target.value })}
            />
          </label>
          <label className="block text-xs font-medium text-ink-500">
            Type
            <Input
              className="mt-1 min-h-11"
              value={draft.type}
              onChange={(e) => setDraft({ ...draft, type: e.target.value })}
            />
          </label>
          <label className="block text-xs font-medium text-ink-500">
            Listing mode
            <Select
              className="mt-1 min-h-11 w-full"
              value={draft.listingMode}
              onChange={(e) => {
                const listingMode = e.target.value as PropertyAsset['listingMode']
                setDraft({
                  ...draft,
                  listingMode,
                  amenities: pruneAmenitiesForMode(draft.amenities, listingMode),
                  price: listingMode === 'rent' ? null : draft.price,
                  rent: listingMode === 'sale' ? null : draft.rent,
                })
              }}
            >
              <option value="sale">For sale</option>
              <option value="rent">To rent</option>
              <option value="both">Sale or rent</option>
            </Select>
          </label>
          <div className="sm:col-span-2 rounded-2xl border border-primary-100 bg-primary-50/40 p-3">
            <PropertyFeaturePicker
              value={draft.amenities}
              onChange={(amenities) => setDraft({ ...draft, amenities })}
              listingMode={draft.listingMode}
            />
          </div>
          {(
            [
              ['beds', 'Beds'],
              ['baths', 'Baths'],
              ['parking', 'Parking'],
              ['area', 'Area m²'],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="block text-xs font-medium text-ink-500">
              {label}
              <Input
                type="number"
                className="mt-1 min-h-11 tabular"
                value={draft[key]}
                onChange={(e) => setDraft({ ...draft, [key]: Number(e.target.value) || 0 })}
              />
            </label>
          ))}
          {(draft.listingMode === 'sale' || draft.listingMode === 'both') && (
            <label className="block text-xs font-medium text-ink-500">
              Sale price (ZAR)
              <Input
                type="number"
                className="mt-1 min-h-11 tabular"
                value={draft.price ?? ''}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    price: e.target.value === '' ? null : Number(e.target.value),
                  })
                }
              />
            </label>
          )}
          {(draft.listingMode === 'rent' || draft.listingMode === 'both') && (
            <label className="block text-xs font-medium text-ink-500">
              Rent / mo (ZAR)
              <Input
                type="number"
                className="mt-1 min-h-11 tabular"
                value={draft.rent ?? ''}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    rent: e.target.value === '' ? null : Number(e.target.value),
                  })
                }
              />
            </label>
          )}
          <label className="block text-xs font-medium text-ink-500">
            Agent
            <Select
              className="mt-1 min-h-11 w-full"
              value={draft.agentId ?? ''}
              onChange={(e) => setDraft({ ...draft, agentId: e.target.value || null })}
            >
              <option value="">Unassigned</option>
              {agents.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </Select>
          </label>
          <label className="block text-xs font-medium text-ink-500">
            Landlord
            <Select
              className="mt-1 min-h-11 w-full"
              value={draft.landlordId}
              onChange={(e) => setDraft({ ...draft, landlordId: e.target.value })}
            >
              {landlords.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </Select>
          </label>
          <div className="sm:col-span-2">
            <ImageDropzone
              label="Property photos"
              value={draft.images}
              onChange={(images) => setDraft({ ...draft, images })}
              multiple
              max={12}
              hint="Drag & drop photos here, or click to open your gallery"
            />
          </div>
          <div className="sm:col-span-2">
            <ImageDropzone
              label="Floor plan (optional)"
              value={draft.floorPlan ? [draft.floorPlan] : []}
              onChange={(next) => setDraft({ ...draft, floorPlan: next[0] })}
              multiple={false}
              max={1}
              variant="cover"
              hint="Drag & drop a floor plan, or click to browse"
            />
          </div>
        </div>
      </Modal>
    </div>
  )
}
