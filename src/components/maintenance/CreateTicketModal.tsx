import { accessNotesFieldState, useTicketAccessNotesSupported } from '../../lib/ticketAccessNotes'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Plus } from 'lucide-react'
import type { PropertyAsset } from '../../types/domain'
import type { InternalAsset, LookupConfig } from '../../data/infrastructure'
import { PropertySearchPicker } from '../PropertySearchPicker'
import { ImageDropzone } from '../ImageDropzone'
import { ContractorPicker } from '../contractors/ContractorPicker'
import { Button, Input, Modal, Select, Textarea, cn } from '../ui'

const ICON_STROKE = 1.6
const TAGS = ['leak', 'no hot water', 'electrical', 'access', 'safety', 'noise', 'pest', 'structural']

type Priority = 'Low' | 'Medium' | 'High' | 'Urgent' | 'Emergency'

export type CreateTicketInput = {
  propertyId: string
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

export function CreateTicketModal({
  open,
  onClose,
  properties,
  assets,
  categories,
  agencyId,
  onCreate,
}: {
  open: boolean
  onClose: () => void
  properties: PropertyAsset[]
  assets: InternalAsset[]
  categories: LookupConfig[]
  agencyId: string | null
  onCreate: (input: CreateTicketInput) => string | null
}) {
  const [propertyId, setPropertyId] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<Priority>('Medium')
  const [category, setCategory] = useState('GENERAL')
  const [assetId, setAssetId] = useState('')
  const [contractorId, setContractorId] = useState('')
  const [locationDetail, setLocationDetail] = useState('')
  const [accessNotes, setAccessNotes] = useState('')
  const accessNotesField = accessNotesFieldState(useTicketAccessNotesSupported())
  const [preferredSchedule, setPreferredSchedule] = useState('')
  const [estimatedCost, setEstimatedCost] = useState('')
  const [issueTags, setIssueTags] = useState<string[]>([])
  const [photoUrls, setPhotoUrls] = useState<string[]>([])
  const [error, setError] = useState('')

  const selected = properties.find((p) => p.id === propertyId)
  const unitAssets = useMemo(
    () => assets.filter((a) => a.unitId && a.unitId === selected?.unitId),
    [assets, selected?.unitId],
  )

  const reset = () => {
    setPropertyId('')
    setTitle('')
    setDescription('')
    setPriority('Medium')
    setCategory('GENERAL')
    setAssetId('')
    setContractorId('')
    setLocationDetail('')
    setAccessNotes('')
    setPreferredSchedule('')
    setEstimatedCost('')
    setIssueTags([])
    setPhotoUrls([])
    setError('')
  }

  useEffect(() => {
    if (!open) return
    reset()
  }, [open])

  const toggleTag = (tag: string) => {
    setIssueTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]))
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !propertyId) {
      setError('Title and property are required.')
      return
    }
    if (!selected?.unitId) {
      setError('Selected property has no linked unit — open the property and link infrastructure first.')
      return
    }
    const err = onCreate({
      propertyId,
      title: title.trim(),
      description: description.trim() || `Logged from maintenance desk: ${title.trim()}`,
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
    if (err) {
      setError(err)
      return
    }
    reset()
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        reset()
        onClose()
      }}
      title="Log maintenance"
      description="Capture the fault in detail — photos, location, linked assets, and book an approved contractor immediately."
      size="lg"
      footer={
        <>
          <Button
            variant="secondary"
            className="min-h-11"
            onClick={() => {
              reset()
              onClose()
            }}
          >
            Cancel
          </Button>
          <Button className="min-h-11" form="create-ticket-form" type="submit">
            <Plus className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
            Create maintenance
          </Button>
        </>
      }
    >
      <form id="create-ticket-form" className="grid gap-3 sm:grid-cols-2" onSubmit={submit}>
        <div className="sm:col-span-2">
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
        </div>
        <label className="block text-xs font-medium text-ink-500 sm:col-span-2">
          Title
          <Input
            className="mt-1 min-h-11"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Geyser not heating — Unit B12"
            required
          />
        </label>
        <label className="block text-xs font-medium text-ink-500 sm:col-span-2">
          Description
          <Textarea
            className="mt-1 min-h-[5rem]"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What failed, when it started, symptoms, and anything already tried…"
          />
        </label>
        <label className="block text-xs font-medium text-ink-500">
          Priority
          <Select
            className="mt-1 min-h-11 w-full"
            value={priority}
            onChange={(e) => setPriority(e.target.value as Priority)}
          >
            {['Low', 'Medium', 'High', 'Urgent', 'Emergency'].map((p) => (
              <option key={p}>{p}</option>
            ))}
          </Select>
        </label>
        <label className="block text-xs font-medium text-ink-500">
          Category
          <Select
            className="mt-1 min-h-11 w-full"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {(categories.length
              ? categories
              : [{ keyValue: 'GENERAL', displayLabel: 'General' } as LookupConfig]
            ).map((c) => (
              <option key={c.keyValue} value={c.keyValue}>
                {c.displayLabel}
              </option>
            ))}
          </Select>
        </label>
        <label className="block text-xs font-medium text-ink-500 sm:col-span-2">
          Location on site
          <Input
            className="mt-1 min-h-11"
            value={locationDetail}
            onChange={(e) => setLocationDetail(e.target.value)}
            placeholder="e.g. Main bathroom — geyser cupboard"
          />
        </label>
        <label className="block text-xs font-medium text-ink-500 sm:col-span-2">
          Access notes
          <Textarea
            className="mt-1 min-h-[4rem]"
            value={accessNotes}
            disabled={accessNotesField.disabled}
            onChange={(e) => setAccessNotes(e.target.value)}
            placeholder="Gate code, pets, concierge, best time to access…"
          />
          {accessNotesField.hint ? <span className="mt-1 block text-xs text-ink-500">{accessNotesField.hint}</span> : null}
        </label>
        <label className="block text-xs font-medium text-ink-500 sm:col-span-2">
          Preferred attendance
          <Input
            className="mt-1 min-h-11"
            value={preferredSchedule}
            onChange={(e) => setPreferredSchedule(e.target.value)}
            placeholder="e.g. Weekdays 09:00–12:00"
          />
        </label>
        <label className="block text-xs font-medium text-ink-500 sm:col-span-2">
          Internal asset (optional)
          <Select
            className="mt-1 min-h-11 w-full"
            value={assetId}
            onChange={(e) => setAssetId(e.target.value)}
            disabled={!selected?.unitId}
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
        <label className="block text-xs font-medium text-ink-500">
          Book contractor (optional)
          <div className="mt-1">
            <ContractorPicker
              agencyId={agencyId}
              categoryKey={category}
              value={contractorId}
              onChange={setContractorId}
              placeholder="Assign later…"
            />
          </div>
        </label>
        <label className="block text-xs font-medium text-ink-500">
          Estimated cost (ZAR)
          <Input
            className="mt-1 min-h-11 tabular"
            type="number"
            min={0}
            value={estimatedCost}
            onChange={(e) => setEstimatedCost(e.target.value)}
            placeholder="Optional quote"
          />
        </label>
        <div className="sm:col-span-2">
          <p className="text-xs font-medium text-ink-500">Issue tags</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {TAGS.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => toggleTag(tag)}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs font-medium capitalize',
                  issueTags.includes(tag)
                    ? 'border-primary bg-primary-50 text-primary'
                    : 'border-primary-100 text-ink-500',
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
            max={8}
            label="Issue photos"
            hint="Upload clear photos of the fault, damage, or meter readings"
          />
        </div>
        {error && (
          <p
            role="alert"
            className="rounded-xl bg-accent-50 px-3 py-2 text-sm text-accent-800 sm:col-span-2"
          >
            {error}
          </p>
        )}
      </form>
    </Modal>
  )
}
