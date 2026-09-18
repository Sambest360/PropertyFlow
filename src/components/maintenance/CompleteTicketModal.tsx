import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { AssetCondition } from '../../data/infrastructure'
import type { AppUser, MaintenanceTicket } from '../../types/domain'
import {
  validateTicketCompletion,
  type TicketCompletionFields,
} from '../../lib/maintenanceApi'
import { ImageDropzone } from '../ImageDropzone'
import { ContractorPicker } from '../contractors/ContractorPicker'
import { Button, Input, Modal, Select, Textarea } from '../ui'

const CONDITIONS: AssetCondition[] = [
  'Excellent',
  'Good',
  'Fair',
  'Damaged',
  'Needs replacement',
]

export function CompleteTicketModal({
  open,
  ticket,
  propertyTitle,
  contractors,
  agencyId,
  defaultCondition,
  onClose,
  onComplete,
}: {
  open: boolean
  ticket: MaintenanceTicket | null
  propertyTitle?: string
  contractors: AppUser[]
  agencyId?: string | null
  defaultCondition?: AssetCondition | null
  onClose: () => void
  onComplete: (fields: TicketCompletionFields) => string | null
}) {
  const [cost, setCost] = useState('')
  const [workNotes, setWorkNotes] = useState('')
  const [contractorId, setContractorId] = useState('')
  const [completionPhotoUrls, setCompletionPhotoUrls] = useState<string[]>([])
  const [condition, setCondition] = useState<AssetCondition>('Good')
  const [error, setError] = useState('')
  const wasOpen = useRef(false)

  useEffect(() => {
    // Reseed only on the closed→open transition: while open, background store
    // refreshes replace the ticket object identity and must NOT wipe edits.
    if (!open || !ticket) {
      wasOpen.current = false
      return
    }
    if (wasOpen.current) return
    wasOpen.current = true
    setCost(ticket.cost ? String(ticket.cost) : '')
    setWorkNotes(ticket.resolutionNotes ?? '')
    setContractorId(ticket.contractorId ?? '')
    setCompletionPhotoUrls([])
    setCondition(defaultCondition || 'Good')
    setError('')
  }, [open, ticket, defaultCondition])

  if (!ticket) return null

  const submit = (e?: FormEvent) => {
    e?.preventDefault()
    const fields: TicketCompletionFields = {
      cost: Number(cost),
      workNotes,
      contractorId,
      photos: completionPhotoUrls.length,
      completionPhotoUrls,
      condition,
    }
    const local = validateTicketCompletion(ticket, fields)
    if (local) {
      setError(local)
      return
    }
    const err = onComplete(fields)
    if (err) {
      setError(err)
      return
    }
    onClose()
  }

  const useRosterPicker = agencyId != null

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="Complete maintenance"
      description={
        propertyTitle
          ? `Record what was done on “${ticket.title}” at ${propertyTitle} before marking Resolved.`
          : `Record what was done on “${ticket.title}” before marking Resolved.`
      }
      footer={
        <>
          <Button variant="secondary" className="min-h-11" onClick={onClose}>
            Cancel
          </Button>
          <Button className="min-h-11" onClick={() => submit()}>
            Mark resolved
          </Button>
        </>
      }
    >
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={submit}>
        <label className="block text-xs font-medium text-ink-500 sm:col-span-2">
          Work performed <span className="text-accent">*</span>
          <Textarea
            className="mt-1 min-h-[6rem]"
            value={workNotes}
            onChange={(e) => setWorkNotes(e.target.value)}
            placeholder="What did the technician fix or replace? Include parts used and access notes…"
            required
          />
        </label>

        <label className="block text-xs font-medium text-ink-500">
          Actual cost (ZAR) <span className="text-accent">*</span>
          <Input
            className="mt-1 min-h-11 tabular"
            type="number"
            min={0}
            step="0.01"
            value={cost}
            onChange={(e) => setCost(e.target.value)}
            placeholder="0"
            required
          />
        </label>

        <label className="block text-xs font-medium text-ink-500 sm:col-span-2">
          Technician / contractor <span className="text-accent">*</span>
          {useRosterPicker ? (
            <div className="mt-1">
              <ContractorPicker
                agencyId={agencyId ?? null}
                categoryKey={ticket.categoryKey}
                value={contractorId}
                onChange={setContractorId}
                allowEmpty={false}
                placeholder="Select who completed the work…"
              />
            </div>
          ) : (
            <Select
              className="mt-1 min-h-11 w-full"
              value={contractorId}
              onChange={(e) => setContractorId(e.target.value)}
              required
            >
              <option value="">Select who completed the work…</option>
              {contractors.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          )}
        </label>

        <div className="sm:col-span-2">
          <ImageDropzone
            value={completionPhotoUrls}
            onChange={setCompletionPhotoUrls}
            max={6}
            label="Photos of completed work"
            hint="Upload clear after photos — required before resolving"
          />
        </div>

        <label className="block text-xs font-medium text-ink-500 sm:col-span-2">
          Asset condition after work
          {ticket.internalAssetId ? (
            <span className="text-accent"> *</span>
          ) : (
            <span className="font-normal text-ink-400"> (optional)</span>
          )}
          <Select
            className="mt-1 min-h-11 w-full"
            value={condition}
            onChange={(e) => setCondition(e.target.value as AssetCondition)}
          >
            {CONDITIONS.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </label>

        {error && (
          <p className="rounded-xl bg-accent-50 px-3 py-2 text-sm text-accent-800 sm:col-span-2">
            {error}
          </p>
        )}
      </form>
    </Modal>
  )
}
