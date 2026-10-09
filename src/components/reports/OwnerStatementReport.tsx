/**
 * Owner statement as a table (Reports → Owner statement). Read-only over the
 * in-app book; filters and visible columns live in local state / localStorage.
 * Export: CSV with on-screen columns, plus the existing statement PDF, which is
 * still filed under Documents.
 */
import { useMemo, useState } from 'react'
import { Download, FileText } from 'lucide-react'
import { useStore } from '../../context/AppStore'
import { Button, Card, Input, Select } from '../ui'
import { ResponsiveDataList } from '../data/ResponsiveDataList'
import { ReportSectionCard } from './ReportShell'
import { ColumnPicker } from './ColumnPicker'
import { downloadCsvText, useColumnPrefs } from './useColumnPrefs'
import { formatZAR } from '../../data/seed'
import {
  OWNER_STATEMENT_TABLE_COLUMNS,
  OWNER_STATEMENT_TABLE_FOOTER,
  buildOwnerStatementBook,
  buildOwnerStatementTable,
  defaultOwnerStatementPeriod,
  downloadOwnerStatementPdf,
  generateOwnerStatementPdf,
  ownerStatementCellText,
  ownerStatementDocumentDraft,
  ownerStatementTableToCsv,
  type OwnerStatementColumnKey,
  type OwnerStatementTableRow,
} from '../../lib/ownerStatement'

const ICON_STROKE = 1.6
const ALL_KEYS = OWNER_STATEMENT_TABLE_COLUMNS.map((c) => c.key)

type Props = {
  agencyId: string
  agencyName: string
  /** Owner audience: fixed to the signed-in landlord. Agency audience: pick a landlord. */
  fixedLandlord?: { id: string; name: string } | null
}

export function OwnerStatementReport({ agencyId, agencyName, fixedLandlord = null }: Props) {
  const { state, addPropertyDocument } = useStore()
  const defaults = useMemo(() => defaultOwnerStatementPeriod(new Date()), [])
  const [periodStart, setPeriodStart] = useState(defaults.start)
  const [periodEnd, setPeriodEnd] = useState(defaults.end)
  const [visible, toggleColumn] = useColumnPrefs<OwnerStatementColumnKey>(
    'pf-report-owner-statement-columns-v1',
    ALL_KEYS,
  )
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const landlords = useMemo(() => {
    if (fixedLandlord) return [fixedLandlord]
    const ids = new Set(
      state.properties.filter((p) => p.agencyId === agencyId).map((p) => p.landlordId),
    )
    return state.users
      .filter((u) => u.role === 'landlord' && ids.has(u.id))
      .map((u) => ({ id: u.id, name: u.name }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [fixedLandlord, state.properties, state.users, agencyId])

  const [landlordId, setLandlordId] = useState<string>(() => fixedLandlord?.id ?? '')
  const landlord = landlords.find((l) => l.id === landlordId) ?? landlords[0] ?? null

  const landlordProperties = useMemo(
    () =>
      landlord
        ? state.properties.filter((p) => p.agencyId === agencyId && p.landlordId === landlord.id)
        : [],
    [state.properties, agencyId, landlord],
  )
  const [propertyTitle, setPropertyTitle] = useState('')
  const propertyFilter = landlordProperties.some((p) => p.title === propertyTitle)
    ? propertyTitle
    : ''

  const period = { start: periodStart, end: periodEnd }
  const bookInput = landlord
    ? {
        landlordUserId: landlord.id,
        landlordName: landlord.name,
        agencyId,
        agencyName,
        period,
        properties: state.properties,
        tenancies: state.tenancies,
        payments: state.payments,
        trustAllocations: state.trustAllocations,
        payoutInstructions: state.payoutInstructions,
      }
    : null

  const table = bookInput
    ? buildOwnerStatementTable(buildOwnerStatementBook(bookInput), {
        propertyTitle: propertyFilter || null,
      })
    : { rows: [], totals: { rent: 0, commission: 0, otherAllocations: 0, netPaid: 0 } }

  const columns = OWNER_STATEMENT_TABLE_COLUMNS.filter((c) => visible.includes(c.key))

  const money = (v: number | null) => (v == null ? '' : formatZAR(v))

  function exportCsv() {
    if (!landlord) return
    const csv = ownerStatementTableToCsv(table.rows, table.totals, visible)
    downloadCsvText(`owner-statement-${landlord.name.replace(/\s+/g, '-')}-${periodStart}-to-${periodEnd}.csv`, csv)
  }

  async function downloadPdf() {
    if (!bookInput || !landlord) return
    setBusy(true)
    setMessage(null)
    try {
      const pdf = await generateOwnerStatementPdf(bookInput)
      downloadOwnerStatementPdf(pdf.fileName, pdf.bytes)
      const firstProp = landlordProperties[0]
      if (firstProp) {
        addPropertyDocument(
          ownerStatementDocumentDraft({
            agencyId,
            propertyId: firstProp.id,
            landlordName: landlord.name,
            periodStart,
            periodEnd,
            fileUrl: pdf.dataUrl,
          }),
        )
        setMessage(`Downloaded ${pdf.fileName}. Filed under Documents.`)
      } else {
        setMessage(`Downloaded ${pdf.fileName}. No linked property to file it under Documents.`)
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Owner statement PDF failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <ReportSectionCard
      title="Owner statement"
      subtitle={landlord ? `${landlord.name} · ${periodStart} to ${periodEnd}` : 'No landlords in scope yet.'}
      action={
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" className="min-h-11" onClick={exportCsv} disabled={!landlord}>
            <Download className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
            CSV
          </Button>
          <Button className="min-h-11" onClick={() => void downloadPdf()} disabled={!landlord || busy}>
            <FileText className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
            {busy ? 'Preparing…' : 'Statement PDF'}
          </Button>
        </div>
      }
    >
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="text-xs font-medium text-ink-600">
          From
          <Input type="date" className="mt-1 min-h-11" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
        </label>
        <label className="text-xs font-medium text-ink-600">
          To
          <Input type="date" className="mt-1 min-h-11" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
        </label>
        {!fixedLandlord ? (
          <label className="text-xs font-medium text-ink-600">
            Landlord
            <Select
              className="mt-1 min-h-11"
              value={landlord?.id ?? ''}
              onChange={(e) => setLandlordId(e.target.value)}
              aria-label="Landlord"
            >
              {landlords.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </Select>
          </label>
        ) : null}
        <label className="text-xs font-medium text-ink-600">
          Property
          <Select
            className="mt-1 min-h-11"
            value={propertyFilter}
            onChange={(e) => setPropertyTitle(e.target.value)}
            aria-label="Property"
          >
            <option value="">All properties</option>
            {landlordProperties.map((p) => (
              <option key={p.id} value={p.title}>
                {p.title}
              </option>
            ))}
          </Select>
        </label>
      </div>

      <div className="mb-4">
        <ColumnPicker columns={OWNER_STATEMENT_TABLE_COLUMNS} visible={visible} onToggle={toggleColumn} />
      </div>

      <ResponsiveDataList<OwnerStatementTableRow>
        embedded
        minTableWidth="44rem"
        rows={table.rows}
        rowKey={(r) => r.id}
        empty={<p className="py-6 text-center text-sm text-ink-500">No lines in this period.</p>}
        columns={columns.map((c) => ({
          key: c.key,
          header: c.label,
          headerClassName: c.numeric ? 'text-right' : undefined,
          cellClassName: c.numeric ? 'text-right tabular' : undefined,
          render: (r: OwnerStatementTableRow) =>
            c.numeric
              ? money(r[c.key as 'rent' | 'commission' | 'otherAllocations' | 'netPaid'])
              : ownerStatementCellText(r, c.key),
        }))}
        renderMobileCard={(r) => (
          <Card className="p-4 text-sm">
            <p className="font-semibold text-ink">{r.property}</p>
            <p className="text-xs text-ink-500">
              {r.date} · {r.description}
            </p>
            <dl className="mt-2 grid grid-cols-2 gap-1">
              {columns
                .filter((c) => c.numeric && r[c.key as 'rent'] != null)
                .map((c) => (
                  <div key={c.key}>
                    <dt className="text-[11px] text-ink-400">{c.label}</dt>
                    <dd className="tabular">{money(r[c.key as 'rent'])}</dd>
                  </div>
                ))}
            </dl>
          </Card>
        )}
      />

      {table.rows.length > 0 ? (
        <dl className="mt-4 flex flex-wrap justify-end gap-x-6 gap-y-1 border-t border-primary-50 pt-3 text-sm">
          {columns
            .filter((c) => c.numeric)
            .map((c) => (
              <div key={c.key} className="flex gap-2">
                <dt className="text-ink-500">{c.label}</dt>
                <dd className="font-semibold tabular text-ink">
                  {formatZAR(table.totals[c.key as keyof typeof table.totals])}
                </dd>
              </div>
            ))}
        </dl>
      ) : null}

      <p className="mt-4 text-xs text-ink-500">{OWNER_STATEMENT_TABLE_FOOTER}</p>
      {message ? <p className="mt-2 text-xs text-ink-600">{message}</p> : null}
    </ReportSectionCard>
  )
}
