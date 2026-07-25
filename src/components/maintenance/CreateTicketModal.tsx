import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Plus } from 'lucide-react'
import type { PropertyAsset } from '../../types/domain'
import type { InternalAsset, LookupConfig } from '../../data/infrastructure'
import { PropertySearchPicker } from '../PropertySearchPicker'
import { Button, Input, Modal, Select, Textarea } from '../ui'

const ICON_STROKE = 1.6

type Priority = 'Low' | 'Medium' | 'High' | 'Urgent' | 'Emergency'

export function CreateTicketModal({
  open,
  onClose,
  properties,
  assets,
  categories,
  onCreate,
}: {
  open: boolean
  onClose: () => void
  properties: PropertyAsset[]
  assets: InternalAsset[]
  categories: LookupConfig[]
  onCreate: (input: {
    propertyId: string
    title: string
    description: string
    priority: Priority
    categoryKey: string
    assetId: string | null
  }) => string | null
}) {
  const [propertyId, setPropertyId] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<Priority>('Medium')
  const [category, setCategory] = useState('GENERAL')
  const [assetId, setAssetId] = useState('')
  const [error, setError] = useState('')

  const selected = properties.find((p) => p.id === propertyId)
  const unitAssets = useMemo(
    () => assets.filter((a) => a.unitId && a.unitId === selected?.unitId),
    [assets, selected?.unitId],
  )

  useEffect(() => {
    if (!open) return
    setPropertyId('')
    setTitle('')
    setDescription('')
    setPriority('Medium')
    setCategory('GENERAL')
    setAssetId('')
    setError('')
  }, [open])

  const reset = () => {
    setPropertyId('')
    setTitle('')
    setDescription('')
    setPriority('Medium')
    setCategory('GENERAL')
    setAssetId('')
    setError('')
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
      description="Link the issue to a property and optional internal asset so ops can route warranty and vendors."
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
            placeholder="What failed, where, and any access notes…"
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
