/**
 * Rent roll as a table (Reports → Rent roll). Read-only over buildRentRollAsAt;
 * filters and visible columns live in local state / localStorage.
 * Export: CSV with on-screen columns, plus the existing rent roll PDF.
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
  RENT_ROLL_TABLE_COLUMNS,
  buildRentRollAsAt,
  defaultRentRollAsAt,
  downloadRentRollPdf,
  generateRentRollPdf,
  rentRollCellText,
  rentRollTableToCsv,
  type RentRollColumnKey,
  type RentRollRow,
} from '../../lib/rentRoll'

const ICON_STROKE = 1.6
const ALL_KEYS = RENT_ROLL_TABLE_COLUMNS.map((c) => c.key)

type Props = {
  agencyId: string
  agencyName: string
  /** Owner audience: fixed to the signed-in landlord. */
  fixedLandlord?: { id: string; name: string } | null
}

export function RentRollReport({ agencyId, agencyName, fixedLandlord = null }: Props) {
  const { state } = useStore()
  const [asAt, setAsAt] = useState(() => defaultRentRollAsAt(new Date()))
  const [landlordId, setLandlordId] = useState('')
  const [propertyId, setPropertyId] = useState('')
  const [visible, toggleColumn] = useColumnPrefs<RentRollColumnKey>(
    'pf-report-rent-roll-columns-v1',
    ALL_KEYS,
  )
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const landlordUsers = useMemo(() => state.users.filter((u) => u.role === 'landlord'), [state.users])
  const landlordOptions = useMemo(() => {
    const ids = new Set(
      state.properties.filter((p) => p.agencyId === agencyId).map((p) => p.landlordId),
    )
    return landlordUsers
      .filter((u) => ids.has(u.id))
      .map((u) => ({ id: u.id, name: u.name }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [landlordUsers, state.properties, agencyId])

  const scopeLandlordId = fixedLandlord?.id ?? (landlordId || null)

  const input = {
    agencyId,
    agencyName,
    asAt,
    properties: state.properties,
    tenancies: state.tenancies,
    payments: state.payments,
    landlords: landlordUsers,
    landlordUserId: scopeLandlordId,
  }
  const book = buildRentRollAsAt(input)

  const propertyOptions = useMemo(() => {
    const seen = new Map<string, string>()
    for (const r of book.rows) seen.set(r.propertyId, r.propertyTitle)
    return [...seen.entries()].map(([id, title]) => ({ id, title }))
  }, [book.rows])
  const propertyFilter = propertyOptions.some((p) => p.id === propertyId) ? propertyId : ''
  const rows = propertyFilter ? book.rows.filter((r) => r.propertyId === propertyFilter) : book.rows

  const columns = RENT_ROLL_TABLE_COLUMNS.filter((c) => visible.includes(c.key))

  const cell = (r: RentRollRow, key: RentRollColumnKey) =>
    key === 'charged'
      ? formatZAR(r.rentZar)
      : key === 'outstanding'
        ? formatZAR(r.arrearsZar)
        : rentRollCellText(r, key)

  function exportCsv() {
    downloadCsvText(`rent-roll-${asAt}.csv`, rentRollTableToCsv(rows, visible))
  }

  async function downloadPdf() {
    setBusy(true)
    setMessage(null)
    try {
      const pdf = await generateRentRollPdf(input)
      downloadRentRollPdf(pdf.fileName, pdf.bytes)
      setMessage(`Downloaded ${pdf.fileName}.`)
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Rent roll PDF failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <ReportSectionCard
      title="Rent roll"
      subtitle={`As at ${asAt} · ${rows.length} tenanc${rows.length === 1 ? 'y' : 'ies'}`}
      action={
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" className="min-h-11" onClick={exportCsv}>
            <Download className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
            CSV
          </Button>
          <Button className="min-h-11" onClick={() => void downloadPdf()} disabled={busy}>
            <FileText className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
            {busy ? 'Preparing…' : 'Rent roll PDF'}
          </Button>
        </div>
      }
    >
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="text-xs font-medium text-ink-600">
          As at
          <Input type="date" className="mt-1 min-h-11" value={asAt} onChange={(e) => setAsAt(e.target.value)} />
        </label>
        {!fixedLandlord ? (
          <label className="text-xs font-medium text-ink-600">
            Landlord
            <Select
              className="mt-1 min-h-11"
              value={landlordId}
              onChange={(e) => setLandlordId(e.target.value)}
              aria-label="Landlord"
            >
              <option value="">All landlords</option>
              {landlordOptions.map((l) => (
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
            onChange={(e) => setPropertyId(e.target.value)}
            aria-label="Property"
          >
            <option value="">All properties</option>
            {propertyOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </Select>
        </label>
      </div>

      <div className="mb-4">
        <ColumnPicker columns={RENT_ROLL_TABLE_COLUMNS} visible={visible} onToggle={toggleColumn} />
      </div>

      <ResponsiveDataList<RentRollRow>
        embedded
        minTableWidth="48rem"
        rows={rows}
        rowKey={(r) => r.tenancyId}
        empty={<p className="py-6 text-center text-sm text-ink-500">No tenancies on the roll at this date.</p>}
        columns={columns.map((c) => ({
          key: c.key,
          header: c.label,
          headerClassName: c.numeric ? 'text-right' : undefined,
          cellClassName: c.numeric ? 'text-right tabular' : undefined,
          render: (r: RentRollRow) => cell(r, c.key),
        }))}
        renderMobileCard={(r) => (
          <Card className="p-4 text-sm">
            <dl className="grid grid-cols-2 gap-1">
              {columns.map((c) => (
                <div key={c.key}>
                  <dt className="text-[11px] text-ink-400">{c.label}</dt>
                  <dd className={c.numeric ? 'tabular' : undefined}>{cell(r, c.key) || '—'}</dd>
                </div>
              ))}
            </dl>
          </Card>
        )}
      />
      {message ? <p className="mt-2 text-xs text-ink-600">{message}</p> : null}
    </ReportSectionCard>
  )
}
