/**
 * DQ-M3 Mode A — download printable owner statement PDF from in-app book.
 * Optional PropertyDocument store (category Other). Honesty banner required.
 */

import { useMemo, useState } from 'react'
import { Download, FileText } from 'lucide-react'
import { useStore } from '../../context/AppStore'
import { Button } from '../ui'
import {
  OWNER_STATEMENT_MODE_A_COPY,
  defaultOwnerStatementPeriod,
  downloadOwnerStatementPdf,
  generateOwnerStatementPdf,
  ownerStatementDocumentDraft,
} from '../../lib/ownerStatement'

const ICON_STROKE = 1.6

type Props = {
  landlordUserId: string
  landlordName: string
  agencyId: string
  agencyName: string
  /** When true, persist PDF as PropertyDocument (Other) on first linked property. */
  storeDocument?: boolean
  /** Compact single-row layout for directory cards. */
  compact?: boolean
}

export function OwnerStatementDownloadPanel({
  landlordUserId,
  landlordName,
  agencyId,
  agencyName,
  storeDocument = true,
  compact = false,
}: Props) {
  const { state, addPropertyDocument } = useStore()
  const defaults = useMemo(() => defaultOwnerStatementPeriod(new Date()), [])
  const [periodStart, setPeriodStart] = useState(defaults.start)
  const [periodEnd, setPeriodEnd] = useState(defaults.end)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function handleDownload() {
    setBusy(true)
    setMessage(null)
    try {
      const pdf = await generateOwnerStatementPdf({
        landlordUserId,
        landlordName,
        agencyId,
        agencyName,
        period: { start: periodStart, end: periodEnd },
        properties: state.properties,
        tenancies: state.tenancies,
        payments: state.payments,
        trustAllocations: state.trustAllocations,
        payoutInstructions: state.payoutInstructions,
      })
      downloadOwnerStatementPdf(pdf.fileName, pdf.bytes)

      if (storeDocument) {
        const firstProp = state.properties.find(
          (p) => p.landlordId === landlordUserId && p.agencyId === agencyId,
        )
        if (firstProp) {
          addPropertyDocument(
            ownerStatementDocumentDraft({
              agencyId,
              propertyId: firstProp.id,
              landlordName,
              periodStart,
              periodEnd,
              fileUrl: pdf.dataUrl,
            }),
          )
          setMessage(
            `Downloaded ${pdf.fileName}. Stored under Documents (Other) — in-app book only.`,
          )
        } else {
          setMessage(`Downloaded ${pdf.fileName}. No linked property to store a document.`)
        }
      } else {
        setMessage(`Downloaded ${pdf.fileName}.`)
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Owner statement PDF failed')
    } finally {
      setBusy(false)
    }
  }

  if (compact) {
    return (
      <div className="mt-3 space-y-2 border-t border-primary-50 pt-3">
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-ink-500">
            From
            <input
              type="date"
              className="mt-0.5 block rounded-lg border border-primary-100 px-2 py-1 text-sm"
              value={periodStart}
              onChange={(e) => setPeriodStart(e.target.value)}
            />
          </label>
          <label className="text-xs text-ink-500">
            To
            <input
              type="date"
              className="mt-0.5 block rounded-lg border border-primary-100 px-2 py-1 text-sm"
              value={periodEnd}
              onChange={(e) => setPeriodEnd(e.target.value)}
            />
          </label>
          <Button
            size="sm"
            variant="ghost"
            disabled={busy || !periodStart || !periodEnd}
            onClick={() => void handleDownload()}
            title={OWNER_STATEMENT_MODE_A_COPY}
          >
            <Download className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
            {busy ? 'Preparing…' : 'Statement PDF'}
          </Button>
        </div>
        {message ? <p className="text-xs text-ink-500">{message}</p> : null}
      </div>
    )
  }

  return (
    <div
      className="rounded-2xl border border-primary-100 bg-white p-4 shadow-sm"
      data-testid="owner-statement-download-panel"
    >
      <div className="flex items-start gap-3">
        <FileText className="mt-0.5 h-5 w-5 shrink-0 text-ink-500" strokeWidth={ICON_STROKE} aria-hidden />
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-ink" title={OWNER_STATEMENT_MODE_A_COPY}>
              Owner statement PDF
            </h3>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-xs font-medium text-ink-600">
              Period start
              <input
                type="date"
                className="mt-1 block rounded-xl border border-primary-100 bg-white px-3 py-2 text-sm"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
              />
            </label>
            <label className="text-xs font-medium text-ink-600">
              Period end
              <input
                type="date"
                className="mt-1 block rounded-xl border border-primary-100 bg-white px-3 py-2 text-sm"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
              />
            </label>
            <Button
              disabled={busy || !periodStart || !periodEnd}
              onClick={() => void handleDownload()}
              title={OWNER_STATEMENT_MODE_A_COPY}
            >
              <Download className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
              {busy ? 'Preparing…' : 'Download statement PDF'}
            </Button>
          </div>
          {message ? <p className="text-xs text-ink-600">{message}</p> : null}
        </div>
      </div>
    </div>
  )
}
