import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { FileText, History } from 'lucide-react'
import { useStore } from '../context/AppStore'
import { usePropertyScope } from '../context/AuthContext'
import { RequirePermission } from '../components/RequirePermission'
import { Badge, Card, Input, PageHeader, Select, statusTone } from '../components/ui'
import { ResponsiveDataList } from '../components/data/ResponsiveDataList'
import type { PropertyDocument } from '../types/domain'
import { resolveDocumentUrl } from '../lib/api/documents'

const ICON_STROKE = 1.6

const CATEGORIES: Array<PropertyDocument['category'] | 'all'> = [
  'all',
  'Title',
  'Compliance',
  'Lease',
  'Inspection',
  'Marketing',
  'Other',
]

export default function Documents() {
  const { state } = useStore()
  const { allowedPropertyIds } = usePropertyScope()
  const [q, setQ] = useState('')
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>('all')

  const propertyTitle = useMemo(
    () => Object.fromEntries(state.properties.map((p) => [p.id, p.title])),
    [state.properties],
  )

  const scoped = useMemo(
    () => state.propertyDocuments.filter((d) => allowedPropertyIds.has(d.propertyId)),
    [state.propertyDocuments, allowedPropertyIds],
  )

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return scoped
      .filter((d) => {
        if (category !== 'all' && d.category !== category) return false
        if (!needle) return true
        const hay = [
          d.name,
          d.category,
          d.status,
          d.note ?? '',
          propertyTitle[d.propertyId] ?? '',
          d.applicantName ?? '',
        ]
          .join(' ')
          .toLowerCase()
        return hay.includes(needle)
      })
      .sort((a, b) => {
        const aAt = a.uploadedAt ?? ''
        const bAt = b.uploadedAt ?? ''
        return bAt.localeCompare(aAt) || a.name.localeCompare(b.name)
      })
  }, [scoped, q, category, propertyTitle])

  return (
    <RequirePermission permission="documents.view">
      <div className="animate-fade-in space-y-4">
        <PageHeader
          title="Documents"
          subtitle="Property register — title, compliance, leases, and inspections for assets in your scope."
        />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Input
            className="min-h-11 flex-1"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search documents or properties…"
            aria-label="Search documents"
          />
          <Select
            className="min-h-11 cursor-pointer sm:w-44"
            value={category}
            onChange={(e) => setCategory(e.target.value as (typeof CATEGORIES)[number])}
            aria-label="Filter by category"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c === 'all' ? 'All categories' : c}
              </option>
            ))}
          </Select>
        </div>

        <ResponsiveDataList
          rows={filtered}
          rowKey={(d) => d.id}
          minTableWidth="800px"
          columns={[
            {
              key: 'document',
              header: 'Document',
              render: (d) => (
                <div className="flex items-center gap-2">
                  <FileText
                    className="h-4 w-4 shrink-0 text-primary"
                    strokeWidth={ICON_STROKE}
                    aria-hidden
                  />
                  <div className="min-w-0">
                    <p className="font-medium text-ink">{d.name}</p>
                    {d.note ? <p className="truncate text-xs text-ink-400">{d.note}</p> : null}
                  </div>
                </div>
              ),
            },
            {
              key: 'type',
              header: 'Type',
              render: (d) => <span className="text-ink-600">{d.category}</span>,
            },
            {
              key: 'property',
              header: 'Property',
              render: (d) => (
                <Link
                  to={`/workspace/properties/${d.propertyId}?tab=documents`}
                  className="cursor-pointer font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  {propertyTitle[d.propertyId] ?? d.propertyId}
                </Link>
              ),
            },
            {
              key: 'status',
              header: 'Status',
              render: (d) => <Badge tone={statusTone(d.status)}>{d.status}</Badge>,
            },
            {
              key: 'updated',
              header: 'Updated',
              cellClassName: 'tabular text-ink-500',
              render: (d) => (
                <span className="inline-flex items-center gap-1">
                  <History
                    className="h-3.5 w-3.5 text-ink-400"
                    strokeWidth={ICON_STROKE}
                    aria-hidden
                  />
                  {d.uploadedAt ?? '—'}
                </span>
              ),
            },
            {
              key: 'file',
              header: 'File',
              render: (d) => {
                const href = resolveDocumentUrl(d)
                return href ? (
                  <a
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex min-h-11 cursor-pointer items-center text-sm font-semibold text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    Open
                  </a>
                ) : (
                  <span className="text-xs text-ink-400">—</span>
                )
              },
            },
          ]}
          renderMobileCard={(d) => {
            const href = resolveDocumentUrl(d)
            return (
              <Card className="p-4">
                <div className="flex items-start gap-2">
                  <FileText className="mt-0.5 h-4 w-4 shrink-0 text-primary" strokeWidth={ICON_STROKE} />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-ink">{d.name}</p>
                    {d.note ? <p className="mt-0.5 text-xs text-ink-400">{d.note}</p> : null}
                    <p className="mt-1 text-xs text-ink-500">{d.category}</p>
                    <Link
                      to={`/workspace/properties/${d.propertyId}?tab=documents`}
                      className="mt-1 inline-block text-xs font-semibold text-primary hover:underline"
                    >
                      {propertyTitle[d.propertyId] ?? d.propertyId}
                    </Link>
                  </div>
                  <Badge tone={statusTone(d.status)}>{d.status}</Badge>
                </div>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <span className="text-xs tabular text-ink-500">{d.uploadedAt ?? '—'}</span>
                  {href ? (
                    <a
                      href={href}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex min-h-11 items-center text-sm font-semibold text-primary hover:underline"
                    >
                      Open file
                    </a>
                  ) : null}
                </div>
              </Card>
            )
          }}
          empty={
            <Card className="p-10 text-center text-sm text-ink-500">
              {scoped.length === 0
                ? 'No documents in your agency or property scope.'
                : 'No documents match these filters.'}
            </Card>
          }
        />
      </div>
    </RequirePermission>
  )
}
