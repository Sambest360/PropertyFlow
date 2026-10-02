/**
 * Mode A portal lead CSV → CRM import with source + external_id dedupe.
 */
import { useState } from 'react'
import { FileUp } from 'lucide-react'
import type { Lead, PropertyAsset } from '../../types/domain'
import { Button, Card } from '../ui'
import { FieldHelp } from '../onboarding/FieldHelp'
import {
  LEAD_CSV_HONESTY,
  LEAD_CSV_TEMPLATE_HEADER,
  filterNewPortalLeads,
  parsePortalLeadCsv,
  portalLeadCsvTemplateSample,
  portalLeadToLeadDraft,
} from '../../lib/syndication'
import { sweetSuccess, sweetWarning } from '../../lib/sweetAlert'

const ICON_STROKE = 1.6

export function LeadCsvImportPanel({
  canImport,
  leads,
  properties,
  agencyId,
  onCreateLead,
}: {
  canImport: boolean
  leads: Lead[]
  properties: PropertyAsset[]
  agencyId: string | null | undefined
  onCreateLead: (draft: ReturnType<typeof portalLeadToLeadDraft>) => Lead
}) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)

  if (!canImport) return null

  const runImport = async () => {
    if (!agencyId) {
      await sweetWarning('No agency', 'Select an agency context before importing leads.')
      return
    }
    setBusy(true)
    try {
      const parsed = parsePortalLeadCsv(text)
      if (parsed.errors.length && parsed.rows.length === 0) {
        await sweetWarning('CSV invalid', parsed.errors[0] ?? 'Could not parse CSV')
        return
      }
      const { fresh, duplicates } = filterNewPortalLeads(parsed.rows, leads)
      let created = 0
      const skip: string[] = []
      for (const row of fresh) {
        const listingId = row.listingId || row.propertyId || ''
        const prop =
          properties.find((p) => p.id === listingId) ??
          properties.find((p) => p.agencyId === agencyId)
        if (!prop) {
          skip.push(`${row.externalId}: no matching property`)
          continue
        }
        const draft = portalLeadToLeadDraft(row, {
          agencyId,
          propertyId: prop.id,
          agentId: prop.agentId,
          value: prop.price ?? prop.rent ?? 0,
          defaultType: prop.listingMode === 'sale' ? 'Buy' : 'Rent',
        })
        onCreateLead(draft)
        created++
      }
      const parts = [
        `Created ${created} lead(s).`,
        duplicates.length ? `Skipped ${duplicates.length} duplicate(s) (external_id / contact+listing).` : null,
        skip.length ? `Skipped ${skip.length}: ${skip.slice(0, 3).join('; ')}` : null,
        parsed.errors.length ? `Row errors: ${parsed.errors.length}` : null,
      ].filter(Boolean)
      await sweetSuccess('Lead CSV import', parts.join(' '))
      if (created > 0) setText('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="space-y-3 p-4" data-testid="lead-csv-import-panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="inline-flex items-center gap-1.5 font-semibold text-ink-900">
            Portal lead CSV
            <FieldHelp title="Lead CSV import" body={LEAD_CSV_HONESTY} />
          </h3>
        </div>
        <Button className="min-h-10" variant="secondary" onClick={() => setOpen((v) => !v)}>
          <FileUp className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
          {open ? 'Hide import' : 'Import CSV'}
        </Button>
      </div>
      {open ? (
        <div className="space-y-3">
          <p className="text-xs text-ink-500">
            Header: <code className="rounded bg-primary-50 px-1">{LEAD_CSV_TEMPLATE_HEADER}</code>
          </p>
          <textarea
            className="min-h-32 w-full rounded-xl border border-ink-200 bg-white p-3 font-mono text-xs"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={portalLeadCsvTemplateSample()}
            data-testid="lead-csv-textarea"
          />
          <div className="flex flex-wrap gap-2">
            <Button
              className="min-h-10"
              disabled={busy || !text.trim()}
              onClick={() => void runImport()}
              data-testid="lead-csv-import-run"
            >
              Import into CRM
            </Button>
            <Button
              className="min-h-10"
              variant="ghost"
              onClick={() => setText(portalLeadCsvTemplateSample())}
            >
              Load sample
            </Button>
          </div>
        </div>
      ) : null}
    </Card>
  )
}
