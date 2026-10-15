import { accessNotesFieldState, useTicketAccessNotesSupported } from '../../lib/ticketAccessNotes'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import type { PropertyAsset, Tenancy } from '../../types/domain'
import type { InternalAsset, LookupConfig } from '../../data/infrastructure'
import type { MaintenanceTicket } from '../../types/domain'
import { PropertySearchPicker } from '../PropertySearchPicker'
import { ImageDropzone } from '../ImageDropzone'
import { MAX_TICKET_PHOTOS, checkTicketPhotos } from '../../lib/photoLimits'
import { ContractorPicker } from '../contractors/ContractorPicker'
import { SmartTextEditor } from '../editor/SmartTextEditor'
import { Input, Select, Textarea, cn } from '../ui'

export const ISSUE_TAGS = ['leak', 'no hot water', 'electrical', 'access', 'safety', 'noise', 'pest', 'structural']

type Priority = MaintenanceTicket['priority']

const LINKABLE_LEASE_STATUSES = new Set(['active', 'pending', 'notice'])

/**
 * Tenancies staff may link a new ticket to on the property: raw lease status
 * active / pending / notice (the server refuses the rest). The display label
 * folds ended leases into "Pending Move-In", so it is only used when the raw
 * status is absent (local demo data).
 */
export function linkableTenancies(tenancies: Tenancy[], propertyId: string): Tenancy[] {
  return tenancies.filter((t) => {
    if (t.propertyId !== propertyId) return false
    if (t.leaseStatus) return LINKABLE_LEASE_STATUSES.has(t.leaseStatus)
    return t.status === 'Active' || t.status === 'Pending Move-In'
  })
}

export type CreateTicketInput = {
  propertyId: string
  title: string
  description: string
  priority: Priority
  categoryKey: string
  assetId: string | null
  contractorId?: string | null
  /** Staff: tenancy (Active / Pending Move-In on this property) the ticket is for. */
  tenancyId?: string | null
  locationDetail?: string
  accessNotes?: string
  preferredSchedule?: string
  issueTags?: string[]
  photoUrls?: string[]
  estimatedCost?: number | null
}

export type EditTicketInput = {
  title: string
  description: string
  priority: Priority
  categoryKey: string
  assetId: string | null
  contractorId?: string | null
  locationDetail?: string
  accessNotes?: string
  preferredSchedule?: string
  issueTags?: string[]
  photoUrls?: string[]
  estimatedCost?: number | null
}

export function MaintenanceTicketForm({
  mode,
  properties,
  assets,
  categories,
  agencyId,
  initialPropertyId,
  lockProperty,
  ticket,
  formId,
  onSubmitCreate,
  onSubmitEdit,
  error,
  tenancies,
}: {
  mode: 'create' | 'edit'
  properties: PropertyAsset[]
  assets: InternalAsset[]
  categories: LookupConfig[]
  agencyId: string | null
  initialPropertyId?: string
  lockProperty?: boolean
  ticket?: MaintenanceTicket
  formId: string
  onSubmitCreate?: (input: CreateTicketInput) => void
  onSubmitEdit?: (input: EditTicketInput) => void
  error?: string | null
  /** Staff create: tenancies to offer in the optional "For tenant" select. */
  tenancies?: Tenancy[]
}) {
  const [propertyId, setPropertyId] = useState(initialPropertyId ?? ticket?.propertyId ?? '')
  const [title, setTitle] = useState(ticket?.title ?? '')
  const [description, setDescription] = useState(ticket?.description ?? '')
  const [priority, setPriority] = useState<Priority>(ticket?.priority ?? 'Medium')
  const [category, setCategory] = useState(ticket?.categoryKey ?? 'GENERAL')
  const [assetId, setAssetId] = useState(ticket?.internalAssetId ?? '')
  const [contractorId, setContractorId] = useState(ticket?.contractorId ?? '')
  const [locationDetail, setLocationDetail] = useState(ticket?.locationDetail ?? '')
  const [accessNotes, setAccessNotes] = useState(ticket?.accessNotes ?? '')
  const accessNotesField = accessNotesFieldState(useTicketAccessNotesSupported())
  const [preferredSchedule, setPreferredSchedule] = useState(ticket?.preferredSchedule ?? '')
  const [estimatedCost, setEstimatedCost] = useState(
    ticket?.estimatedCost ? String(ticket.estimatedCost) : '',
  )
  const [issueTags, setIssueTags] = useState<string[]>(ticket?.issueTags ?? [])
  const [photoUrls, setPhotoUrls] = useState<string[]>(ticket?.photoUrls ?? [])
  const [tenancyId, setTenancyId] = useState('')

  useEffect(() => {
    if (mode === 'create' && initialPropertyId) setPropertyId(initialPropertyId)
  }, [mode, initialPropertyId])

  const selected = properties.find((p) => p.id === propertyId) ?? properties.find((p) => p.id === ticket?.propertyId)
  const unitId = selected?.unitId ?? ticket?.unitId
  const unitAssets = useMemo(
    () => assets.filter((a) => a.unitId && a.unitId === unitId),
    [assets, unitId],
  )

  const tenancyOptions = useMemo(
    () => (mode === 'create' && tenancies ? linkableTenancies(tenancies, propertyId) : []),
    [mode, tenancies, propertyId],
  )
  const linkedTenancyId = tenancyOptions.some((t) => t.id === tenancyId) ? tenancyId : ''

  const [photoError, setPhotoError] = useState<string | null>(null)

  const toggleTag = (tag: string) => {
    setIssueTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]))
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    // Same rule as the server (TICKET_PHOTO_INVALID): JPEG / PNG / WebP,
    // 600 KB each, 3 MB total. Refuse here rather than lose the save.
    const photoCheck = checkTicketPhotos(photoUrls)
    if (photoCheck.ok === false) {
      setPhotoError(`Photos not saved: ${photoCheck.reason}. Remove that photo and try again.`)
      return
    }
    setPhotoError(null)
    if (mode === 'create') {
      if (!title.trim() || !propertyId) return
      onSubmitCreate?.({
        propertyId,
        title: title.trim(),
        description: description.trim() || `Logged from maintenance desk: ${title.trim()}`,
        priority,
        categoryKey: category,
        assetId: assetId || null,
        contractorId: contractorId || null,
        ...(linkedTenancyId ? { tenancyId: linkedTenancyId } : {}),
        locationDetail: locationDetail.trim() || undefined,
        accessNotes: accessNotes.trim() || undefined,
        preferredSchedule: preferredSchedule.trim() || undefined,
        issueTags,
        photoUrls,
        estimatedCost: estimatedCost ? Number(estimatedCost) : null,
      })
      return
    }
    if (!title.trim()) return
    onSubmitEdit?.({
      title: title.trim(),
      description: description.trim(),
      priority,
      categoryKey: category,
      assetId: assetId || null,
      contractorId: contractorId || null,
      locationDetail: locationDetail.trim() || undefined,
      accessNotes: accessNotes.trim() || undefined,
      preferredSchedule: preferredSchedule.trim() || undefined,
      issueTags,
      photoUrls,
      estimatedCost: estimatedCost ? Number(estimatedCost) : null,
    })
  }

  const categoryOptions =
    categories.length > 0 ? categories : [{ keyValue: 'GENERAL', displayLabel: 'General' } as LookupConfig]

  return (
    <form id={formId} className="grid gap-4 sm:grid-cols-2" onSubmit={submit}>
      {mode === 'create' ? (
        <div className="sm:col-span-2">
          {lockProperty && selected ? (
            <div className="rounded-2xl border border-primary-100 bg-primary-50/50 px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-wide text-ink-400">Property</p>
              <p className="mt-1 font-semibold text-ink">{selected.title}</p>
              <p className="text-sm text-ink-500">{selected.suburb}, {selected.city}</p>
            </div>
          ) : (
            <PropertySearchPicker
              properties={properties}
              value={propertyId}
              onChange={(id) => {
                setPropertyId(id)
                setAssetId('')
              }}
              required
              id="ticket-property-search"
            />
          )}
        </div>
      ) : null}

      {mode === 'create' && tenancyOptions.length > 0 ? (
        <label className="block text-sm font-medium text-ink sm:col-span-2">
          For tenant (optional)
          <Select
            className="mt-1.5 min-h-11"
            value={linkedTenancyId}
            onChange={(e) => setTenancyId(e.target.value)}
            aria-label="For tenant"
          >
            <option value="">No tenant — agency only</option>
            {tenancyOptions.map((t) => (
              <option key={t.id} value={t.id}>
                {t.tenantName} · {t.leaseStatus ?? t.status}
              </option>
            ))}
          </Select>
          <span className="mt-1 block text-xs font-normal text-ink-500">
            The tenant sees this ticket and its status in their portal (not costs, quotes or staff notes).
          </span>
        </label>
      ) : null}

      <label className="block text-sm font-medium text-ink sm:col-span-2">
        Title
        <Input
          className="mt-1.5 min-h-11"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Geyser not heating — Unit B12"
          required
        />
      </label>

      <div className="sm:col-span-2">
        <SmartTextEditor
          label="Description"
          variant="operational"
          value={description}
          onChange={setDescription}
        />
      </div>

      <label className="block text-sm font-medium text-ink">
        Priority
        <Select
          className="mt-1.5 min-h-11 w-full"
          value={priority}
          onChange={(e) => setPriority(e.target.value as Priority)}
        >
          {(['Low', 'Medium', 'High', 'Urgent', 'Emergency'] as Priority[]).map((p) => (
            <option key={p}>{p}</option>
          ))}
        </Select>
      </label>

      <label className="block text-sm font-medium text-ink">
        Category
        <Select
          className="mt-1.5 min-h-11 w-full"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          {categoryOptions.map((c) => (
            <option key={c.keyValue} value={c.keyValue}>
              {c.displayLabel}
            </option>
          ))}
        </Select>
      </label>

      <label className="block text-sm font-medium text-ink sm:col-span-2">
        Location on site
        <Input
          className="mt-1.5 min-h-11"
          value={locationDetail}
          onChange={(e) => setLocationDetail(e.target.value)}
          placeholder="e.g. Main bathroom — geyser cupboard"
        />
      </label>

      <label className="block text-sm font-medium text-ink sm:col-span-2">
        Access notes
        <Textarea
          className="mt-1.5 min-h-[4.5rem]"
          value={accessNotes}
          disabled={accessNotesField.disabled}
          maxLength={1000}
          onChange={(e) => setAccessNotes(e.target.value)}
          placeholder="Gate code, pets, concierge, best time to access…"
        />
        {accessNotesField.hint ? <span className="mt-1 block text-xs text-ink-500">{accessNotesField.hint}</span> : null}
      </label>

      <label className="block text-sm font-medium text-ink sm:col-span-2">
        Preferred attendance
        <Input
          className="mt-1.5 min-h-11"
          value={preferredSchedule}
          onChange={(e) => setPreferredSchedule(e.target.value)}
          placeholder="e.g. Weekdays 09:00–12:00"
        />
      </label>

      <label className="block text-sm font-medium text-ink sm:col-span-2">
        Internal asset (optional)
        <Select
          className="mt-1.5 min-h-11 w-full"
          value={assetId}
          onChange={(e) => setAssetId(e.target.value)}
          disabled={!unitId}
        >
          <option value="">No asset linked</option>
          {unitAssets.map((a) => (
            <option key={a.id} value={a.id}>
              {a.itemName}
              {a.warrantyExpiresAt ? ' · warranty' : ''}
            </option>
          ))}
        </Select>
      </label>

      <label className="block text-sm font-medium text-ink">
        Contractor (optional)
        <div className="mt-1.5">
          <ContractorPicker
            agencyId={agencyId}
            categoryKey={category}
            value={contractorId}
            onChange={setContractorId}
            placeholder="Assign later…"
          />
        </div>
      </label>

      <label className="block text-sm font-medium text-ink">
        Estimated cost (ZAR)
        <Input
          className="mt-1.5 min-h-11 tabular-nums"
          type="number"
          min={0}
          value={estimatedCost}
          onChange={(e) => setEstimatedCost(e.target.value)}
          placeholder="Optional quote"
        />
      </label>

      <div className="sm:col-span-2">
        <p className="text-sm font-medium text-ink">Issue tags</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {ISSUE_TAGS.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => toggleTag(tag)}
              className={cn(
                'rounded-full border px-3 py-1.5 text-xs font-medium capitalize transition-colors duration-200',
                issueTags.includes(tag)
                  ? 'border-primary bg-primary-50 text-primary'
                  : 'border-primary-100 text-ink-500 hover:border-primary-200',
              )}
            >
              {tag}
            </button>
          ))}
        </div>
      </div>

      <div className="sm:col-span-2">
        <ImageDropzone
          value={photoUrls}
          onChange={setPhotoUrls}
          max={MAX_TICKET_PHOTOS}
          label="Issue photos"
          hint="Upload clear photos of the fault, damage, or meter readings (JPEG, PNG or WebP, up to 600 KB each)"
        />
        {photoError ? (
          <p role="alert" className="mt-2 text-sm text-accent-800">
            {photoError}
          </p>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="rounded-xl bg-accent-50 px-3 py-2 text-sm text-accent-800 sm:col-span-2">
          {error}
        </p>
      ) : null}
    </form>
  )
}
