import { useEffect, useMemo, useState, type FormEvent } from 'react'
import type { InternalAsset, LookupConfig } from '../../data/infrastructure'
import type { MaintenanceTicket } from '../../types/domain'
import { ticketAttachmentTarget } from '../../lib/storage/targets'
import { ImageDropzone } from '../ImageDropzone'
import { ContractorPicker } from '../contractors/ContractorPicker'
import { Button, Input, Modal, Select, Textarea } from '../ui'

const TAGS = ['leak', 'no hot water', 'electrical', 'access', 'safety', 'noise', 'pest', 'structural']

type Priority = MaintenanceTicket['priority']

export function EditTicketModal({
  open,
  ticket,
  agencyId,
  assets,
  categories,
  onClose,
  onSave,
  onAssignContractor,
}: {
  open: boolean
  ticket: MaintenanceTicket | null
  agencyId: string | null
  assets: InternalAsset[]
  categories: LookupConfig[]
  onClose: () => void
  onSave: (patch: Partial<MaintenanceTicket>) => void
  onAssignContractor?: (contractorUserId: string | null) => boolean
}) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<Priority>('Medium')
  const [categoryKey, setCategoryKey] = useState('GENERAL')
  const [locationDetail, setLocationDetail] = useState('')
  const [accessNotes, setAccessNotes] = useState('')
  const [preferredSchedule, setPreferredSchedule] = useState('')
  const [assetId, setAssetId] = useState('')
  const [contractorId, setContractorId] = useState('')
  const [estimatedCost, setEstimatedCost] = useState('')
  const [issueTags, setIssueTags] = useState<string[]>([])
  const [photoUrls, setPhotoUrls] = useState<string[]>([])
  const [error, setError] = useState('')

  const unitAssets = useMemo(
    () => assets.filter((a) => a.unitId && a.unitId === ticket?.unitId),
    [assets, ticket?.unitId],
  )

  useEffect(() => {
    if (!open || !ticket) return
    setTitle(ticket.title)
    setDescription(ticket.description)
    setPriority(ticket.priority)
    setCategoryKey(ticket.categoryKey ?? 'GENERAL')
    setLocationDetail(ticket.locationDetail ?? '')
    setAccessNotes(ticket.accessNotes ?? '')
    setPreferredSchedule(ticket.preferredSchedule ?? '')
    setAssetId(ticket.internalAssetId ?? '')
    setContractorId(ticket.contractorId ?? '')
    setEstimatedCost(ticket.estimatedCost ? String(ticket.estimatedCost) : '')
    setIssueTags(ticket.issueTags ?? [])
    setPhotoUrls(ticket.photoUrls ?? [])
    setError('')
  }, [open, ticket])

  if (!ticket) return null

  const toggleTag = (tag: string) => {
    setIssueTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]))
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!title.trim()) {
      setError('Title is required.')
      return
    }
    const selectedAsset = unitAssets.find((a) => a.id === assetId)
    onSave({
      title: title.trim(),
      description: description.trim(),
      priority,
      categoryKey,
      locationDetail: locationDetail.trim() || undefined,
      accessNotes: accessNotes.trim() || undefined,
      preferredSchedule: preferredSchedule.trim() || undefined,
      internalAssetId: assetId || null,
      assetLabel: selectedAsset?.itemName ?? ticket.assetLabel,
      estimatedCost: estimatedCost ? Number(estimatedCost) : null,
      issueTags,
      photoUrls,
      photos: photoUrls.length,
    })
    if (onAssignContractor && contractorId !== (ticket.contractorId ?? '')) {
      const ok = onAssignContractor(contractorId || null)
      if (!ok && contractorId) {
        setError('That contractor is not on the agency approved roster.')
        return
      }
    }
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Edit maintenance record"
      description="Capture location, access, photos, linked assets, and assign an approved contractor."
      size="lg"
      footer={
        <>
          <Button variant="secondary" className="min-h-11" onClick={onClose}>
            Cancel
          </Button>
          <Button className="min-h-11" form="edit-ticket-form" type="submit">
            Save changes
          </Button>
        </>
      }
    >
      <form id="edit-ticket-form" className="grid gap-4 sm:grid-cols-2" onSubmit={submit}>
        <label className="block text-xs font-medium text-ink-500 sm:col-span-2">
          Title
          <Input className="mt-1 min-h-11" value={title} onChange={(e) => setTitle(e.target.value)} required />
        </label>
        <label className="block text-xs font-medium text-ink-500 sm:col-span-2">
          Description
          <Textarea
            className="mt-1 min-h-[6rem]"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Symptoms, when it started, what was tried…"
          />
        </label>
        <label className="block text-xs font-medium text-ink-500">
          Priority
          <Select className="mt-1 min-h-11 w-full" value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
            {(['Low', 'Medium', 'High', 'Urgent', 'Emergency'] as Priority[]).map((p) => (
              <option key={p}>{p}</option>
            ))}
          </Select>
        </label>
        <label className="block text-xs font-medium text-ink-500">
          Category
          <Select className="mt-1 min-h-11 w-full" value={categoryKey} onChange={(e) => setCategoryKey(e.target.value)}>
            {(categories.length ? categories : [{ keyValue: 'GENERAL', displayLabel: 'General' } as LookupConfig]).map(
              (c) => (
                <option key={c.keyValue} value={c.keyValue}>
                  {c.displayLabel}
                </option>
              ),
            )}
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
            onChange={(e) => setAccessNotes(e.target.value)}
            placeholder="Gate code, pets, concierge, best time…"
          />
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
          Linked internal asset
          <Select className="mt-1 min-h-11 w-full" value={assetId} onChange={(e) => setAssetId(e.target.value)}>
            <option value="">No asset linked</option>
            {unitAssets.map((a) => (
              <option key={a.id} value={a.id}>
                {a.itemName}
                {a.serialNumber ? ` · ${a.serialNumber}` : ''}
              </option>
            ))}
          </Select>
        </label>
        <label className="block text-xs font-medium text-ink-500">
          Approved contractor
          <div className="mt-1">
            <ContractorPicker
              agencyId={agencyId}
              categoryKey={categoryKey}
              value={contractorId}
              onChange={setContractorId}
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
                className={`rounded-full border px-3 py-1 text-xs font-medium capitalize ${
                  issueTags.includes(tag)
                    ? 'border-primary bg-primary-50 text-primary'
                    : 'border-primary-100 text-ink-500'
                }`}
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
            hint="JPEG, PNG, or WebP, up to 10 MB"
            storage={
              ticket && (ticket.agencyId || agencyId)
                ? ticketAttachmentTarget(ticket.agencyId || agencyId || '', ticket.id)
                : undefined
            }
          />
        </div>
        {error ? (
          <p role="alert" className="rounded-xl bg-accent-50 px-3 py-2 text-sm text-accent-800 sm:col-span-2">
            {error}
          </p>
        ) : null}
      </form>
    </Modal>
  )
}
