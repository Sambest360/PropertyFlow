/**
 * §5 Mode A — as-at rent roll CSV/PDF + soft audit pack download.
 * Reuses DQ-M3 owner statement PDF generator and Trust soft CSV — does not rebuild them.
 */
import { useMemo, useState } from 'react'
import { Download, FileArchive, FileSpreadsheet, FileText } from 'lucide-react'
import { useStore } from '../../context/AppStore'
import { Button } from '../ui'
import {
  RENT_ROLL_MODE_A_COPY,
  AUDIT_PACK_MODE_A_COPY,
  REMITTANCE_REFUSE_COPY,
  attemptLiveRemittance,
  buildSoftAuditPack,
  defaultRentRollAsAt,
  downloadRentRollPdf,
  downloadSoftAuditPackFiles,
  generateRentRollPdf,
  remittanceAdapterFromEnv,
  rentRollToCsv,
} from '../../lib/rentRoll'
import {
  defaultOwnerStatementPeriod,
  generateOwnerStatementPdf,
} from '../../lib/ownerStatement'

const ICON_STROKE = 1.6

function downloadText(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

type Props = {
  agencyId: string
  agencyName: string
  /** When set, scope rent roll + pack to this landlord (Owner Portal). */
  landlordUserId?: string | null
  landlordName?: string | null
  /** Compact single-row layout for directory cards. */
  compact?: boolean
  /** Include Mode A owner statement PDFs in soft pack (reuse DQ-M3). */
  includeOwnerStatements?: boolean
}

export function RentRollAuditPackPanel({
  agencyId,
  agencyName,
  landlordUserId = null,
  landlordName = null,
  compact = false,
  includeOwnerStatements = true,
}: Props) {
  const { state } = useStore()
  const defaults = useMemo(() => defaultRentRollAsAt(new Date()), [])
  const [asAt, setAsAt] = useState(defaults)
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const landlords = useMemo(
    () => state.users.filter((u) => u.role === 'landlord'),
    [state.users],
  )

  async function handleRentRollCsv() {
    setBusy('csv')
    setMessage(null)
    try {
      const pdf = await generateRentRollPdf({
        agencyId,
        agencyName,
        asAt,
        properties: state.properties,
        tenancies: state.tenancies,
        payments: state.payments,
        landlords,
        landlordUserId,
      })
      const csv = rentRollToCsv(pdf.book)
      downloadText(`rent-roll-as-at-${asAt}.csv`, csv, 'text/csv;charset=utf-8')
      setMessage(`Downloaded rent-roll-as-at-${asAt}.csv — Mode A in-app book only.`)
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Rent roll CSV failed')
    } finally {
      setBusy(null)
    }
  }

  async function handleRentRollPdf() {
    setBusy('pdf')
    setMessage(null)
    try {
      const pdf = await generateRentRollPdf({
        agencyId,
        agencyName,
        asAt,
        properties: state.properties,
        tenancies: state.tenancies,
        payments: state.payments,
        landlords,
        landlordUserId,
      })
      downloadRentRollPdf(pdf.fileName, pdf.bytes)
      setMessage(`Downloaded ${pdf.fileName} — still Mode A as-at book only.`)
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Rent roll PDF failed')
    } finally {
      setBusy(null)
    }
  }

  async function handleSoftAuditPack() {
    setBusy('pack')
    setMessage(null)
    try {
      const ownerStatementPdfs: Array<{
        landlordName: string
        fileName: string
        dataUrl: string
      }> = []

      if (includeOwnerStatements) {
        const period = defaultOwnerStatementPeriod(new Date())
        const landlordIds = landlordUserId
          ? [landlordUserId]
          : [
              ...new Set(
                state.properties
                  .filter((p) => p.agencyId === agencyId)
                  .map((p) => p.landlordId),
              ),
            ].slice(0, 5)

        for (const llId of landlordIds) {
          const ll = landlords.find((u) => u.id === llId)
          const name = ll?.name ?? landlordName ?? llId
          const pdf = await generateOwnerStatementPdf({
            landlordUserId: llId,
            landlordName: name,
            agencyId,
            agencyName,
            period,
            properties: state.properties,
            tenancies: state.tenancies,
            payments: state.payments,
            trustAllocations: state.trustAllocations,
            payoutInstructions: state.payoutInstructions,
          })
          ownerStatementPdfs.push({
            landlordName: name,
            fileName: pdf.fileName,
            dataUrl: pdf.dataUrl,
          })
        }
      }

      const pack = await buildSoftAuditPack({
        agencyId,
        agencyName,
        asAt,
        properties: state.properties,
        tenancies: state.tenancies,
        payments: state.payments,
        landlords,
        documents: state.propertyDocuments,
        trustTransactions: state.trustTransactions,
        landlordUserId,
        ownerStatementPdfs,
      })
      downloadSoftAuditPackFiles(pack.files)
      setMessage(
        `Downloaded soft audit pack (${pack.files.length} files). ${AUDIT_PACK_MODE_A_COPY}`,
      )
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Soft audit pack failed')
    } finally {
      setBusy(null)
    }
  }

  async function handleRefuseRemittance() {
    setBusy('remit')
    setMessage(null)
    try {
      const adapter = remittanceAdapterFromEnv('payprop')
      const result = await attemptLiveRemittance(adapter)
      if (result.ok === false) {
        setMessage(result.error)
      } else {
        setMessage(REMITTANCE_REFUSE_COPY)
      }
    } finally {
      setBusy(null)
    }
  }

  if (compact) {
    return (
      <div className="mt-3 space-y-2 border-t border-primary-50 pt-3" data-testid="rent-roll-audit-pack-panel">
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-ink-500">
            As-at
            <input
              type="date"
              className="mt-0.5 block rounded-lg border border-primary-100 px-2 py-1 text-sm"
              value={asAt}
              onChange={(e) => setAsAt(e.target.value)}
            />
          </label>
          <Button
            size="sm"
            variant="ghost"
            disabled={Boolean(busy) || !asAt}
            onClick={() => void handleRentRollCsv()}
            title={RENT_ROLL_MODE_A_COPY}
          >
            <FileSpreadsheet className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
            {busy === 'csv' ? '…' : 'Rent roll CSV'}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={Boolean(busy) || !asAt}
            onClick={() => void handleRentRollPdf()}
            title={RENT_ROLL_MODE_A_COPY}
          >
            <FileText className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
            {busy === 'pdf' ? '…' : 'Rent roll PDF'}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={Boolean(busy) || !asAt}
            onClick={() => void handleSoftAuditPack()}
            title={AUDIT_PACK_MODE_A_COPY}
          >
            <FileArchive className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
            {busy === 'pack' ? '…' : 'Soft audit pack'}
          </Button>
        </div>
        {message ? <p className="text-xs text-ink-500">{message}</p> : null}
      </div>
    )
  }

  return (
    <div
      className="space-y-3 rounded-2xl border border-primary-100 bg-white p-4 shadow-sm"
      data-testid="rent-roll-audit-pack-panel"
    >
      <div className="flex items-start gap-3">
        <FileArchive className="mt-0.5 h-5 w-5 shrink-0 text-ink-500" strokeWidth={ICON_STROKE} aria-hidden />
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-ink" title={`${RENT_ROLL_MODE_A_COPY} ${AUDIT_PACK_MODE_A_COPY}`}>
              As-at rent roll + soft audit pack
            </h3>
            <p className="mt-1 text-xs text-ink-500">
              Point-in-time rent roll (CSV/PDF) and a soft pack that reuses Trust soft CSV + owner
              statements. Live remittance stays refuse-closed.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-xs font-medium text-ink-600">
              As-at date
              <input
                type="date"
                className="mt-1 block rounded-xl border border-primary-100 bg-white px-3 py-2 text-sm"
                value={asAt}
                onChange={(e) => setAsAt(e.target.value)}
              />
            </label>
            <Button
              disabled={Boolean(busy) || !asAt}
              onClick={() => void handleRentRollCsv()}
              title={RENT_ROLL_MODE_A_COPY}
            >
              <Download className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
              {busy === 'csv' ? 'Preparing…' : 'Download rent roll CSV'}
            </Button>
            <Button
              variant="secondary"
              disabled={Boolean(busy) || !asAt}
              onClick={() => void handleRentRollPdf()}
              title={RENT_ROLL_MODE_A_COPY}
            >
              <FileText className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
              {busy === 'pdf' ? 'Preparing…' : 'Download rent roll PDF'}
            </Button>
            <Button
              variant="secondary"
              disabled={Boolean(busy) || !asAt}
              onClick={() => void handleSoftAuditPack()}
              title={AUDIT_PACK_MODE_A_COPY}
            >
              <FileArchive className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
              {busy === 'pack' ? 'Preparing…' : 'Download soft audit pack'}
            </Button>
            <Button
              variant="ghost"
              disabled={Boolean(busy)}
              onClick={() => void handleRefuseRemittance()}
              title={REMITTANCE_REFUSE_COPY}
            >
              {busy === 'remit' ? '…' : 'Try live remittance (refuses)'}
            </Button>
          </div>
          {message ? <p className="text-xs text-ink-600">{message}</p> : null}
        </div>
      </div>
    </div>
  )
}
