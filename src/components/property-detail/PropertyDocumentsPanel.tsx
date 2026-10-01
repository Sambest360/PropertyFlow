import { useMemo, useState } from 'react'
import { ChevronDown, Download, Eye, FileText, Pencil, Search } from 'lucide-react'
import type {
  Application,
  ApplicationDocument,
  PropertyDocument,
} from '../../types/domain'
import { Badge, Button, Card, Input, Modal, Select, Textarea, cn, statusTone } from '../ui'
import {
  categoryFilterOptionsForRole,
  documentCategoryVisibleToRole,
  resolveDocumentUrl,
} from '../../lib/api/documents'
import { useAuth } from '../../context/AuthContext'
import { ICON_STROKE } from './types'

const ACCEPTED_STAGES: string[] = [
  'Approved',
  'Awaiting Payment',
  'Deposit Paid',
  'Lease Signed',
  'Move-In Scheduled',
  'Keys Handed Over',
  'Active Tenancy',
]

export type AcceptedDocRow = {
  key: string
  applicationId: string
  applicantName: string
  email: string
  stage: string
  label: string
  status: ApplicationDocument['status']
  note?: string
  uploaded: boolean
}

export function PropertyDocumentsPanel({
  propertyDocuments,
  applications,
  canManage,
  onUpdateDoc,
}: {
  propertyDocuments: PropertyDocument[]
  applications: Application[]
  canManage: boolean
  onUpdateDoc: (
    applicationId: string,
    key: string,
    status: ApplicationDocument['status'],
    note?: string,
  ) => void
}) {
  const { role } = useAuth()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<PropertyDocument['category'] | 'all'>('all')
  const categories = useMemo(() => categoryFilterOptionsForRole(role), [role])
  const [expandedKey, setExpandedKey] = useState<string | null>(null)
  const [editRow, setEditRow] = useState<AcceptedDocRow | null>(null)
  const [viewRow, setViewRow] = useState<AcceptedDocRow | null>(null)
  const [editStatus, setEditStatus] = useState<ApplicationDocument['status']>('uploaded')
  const [editNote, setEditNote] = useState('')

  const registerRows = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const activeCategory = categories.includes(category) ? category : 'all'
    return propertyDocuments
      .filter((d) => documentCategoryVisibleToRole(d.category, role))
      .filter((d) => (activeCategory === 'all' ? true : d.category === activeCategory))
      .filter((d) => {
        if (!needle) return true
        return [d.name, d.category, d.status, d.note ?? '', d.applicantName ?? '']
          .join(' ')
          .toLowerCase()
          .includes(needle)
      })
      .sort((a, b) => (b.uploadedAt ?? '').localeCompare(a.uploadedAt ?? ''))
  }, [propertyDocuments, query, category, categories, role])

  const applicantRows = useMemo(() => {
    const accepted = applications.filter((a) => ACCEPTED_STAGES.includes(a.stage))
    const list: AcceptedDocRow[] = []
    for (const a of accepted) {
      for (const d of a.documents) {
        list.push({
          key: `${a.id}:${d.key}`,
          applicationId: a.id,
          applicantName: a.applicantName,
          email: a.email,
          stage: a.stage,
          label: d.label,
          status: d.status,
          note: d.note,
          uploaded: d.status !== 'required',
        })
      }
    }
    const q = query.trim().toLowerCase()
    if (!q) return list
    return list.filter(
      (r) =>
        r.applicantName.toLowerCase().includes(q) ||
        r.label.toLowerCase().includes(q) ||
        r.status.toLowerCase().includes(q),
    )
  }, [applications, query])

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-ink-500" strokeWidth={ICON_STROKE} aria-hidden />
              <h2 className="font-semibold text-ink">Property document register</h2>
            </div>
            <p className="mt-0.5 text-xs text-ink-500">
              Title, compliance, leases, marketing, and other files linked to this asset.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative min-w-[12rem] flex-1 sm:max-w-xs">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400"
                strokeWidth={ICON_STROKE}
                aria-hidden
              />
              <Input
                className="min-h-11 pl-9"
                placeholder="Filter documents…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <Select
              className="min-h-11 cursor-pointer sm:w-40"
              value={categories.includes(category) ? category : 'all'}
              onChange={(e) => setCategory(e.target.value as typeof category)}
              aria-label="Filter by category"
            >
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c === 'all' ? 'All categories' : c}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-primary-100 bg-primary-50/40 text-xs uppercase tracking-wide text-ink-500">
              <tr>
                <th className="px-3 py-2 font-medium">Document</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Updated</th>
                <th className="px-3 py-2 font-medium">File</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-primary-50">
              {registerRows.map((d) => {
                const href = resolveDocumentUrl(d)
                return (
                  <tr key={d.id} className="hover:bg-primary-50/30">
                    <td className="px-3 py-3">
                      <p className="font-medium text-ink">{d.name}</p>
                      {d.note ? <p className="text-xs text-ink-400">{d.note}</p> : null}
                      {d.applicantName ? (
                        <p className="text-xs text-ink-400">{d.applicantName}</p>
                      ) : null}
                    </td>
                    <td className="px-3 py-3 text-ink-600">{d.category}</td>
                    <td className="px-3 py-3">
                      <Badge tone={statusTone(d.status)}>{d.status}</Badge>
                    </td>
                    <td className="px-3 py-3 tabular text-ink-500">{d.uploadedAt ?? '—'}</td>
                    <td className="px-3 py-3">
                      {href ? (
                        <a
                          href={href}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex min-h-11 cursor-pointer items-center text-sm font-semibold text-primary underline-offset-2 hover:underline"
                        >
                          Open
                        </a>
                      ) : (
                        <span className="text-xs text-ink-400">—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
              {!registerRows.length && (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-sm text-ink-500">
                    No register documents for this property yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {role !== 'landlord' && role !== 'tenant' ? (
      <Card className="p-5">
        <div className="mb-4">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-ink-500" strokeWidth={ICON_STROKE} aria-hidden />
            <h2 className="font-semibold text-ink">Accepted applicant packs</h2>
          </div>
          <p className="mt-0.5 text-xs text-ink-500">
            Checklist items from approved / active applicants. Uploaded files can be edited, not
            deleted.
          </p>
        </div>

        <ul className="space-y-2">
          {applicantRows.map((r) => {
            const open = expandedKey === r.key
            return (
              <li
                key={r.key}
                className={cn(
                  'overflow-hidden rounded-2xl border',
                  open ? 'border-primary-200 bg-primary-50' : 'border-primary-100 bg-white',
                )}
              >
                <button
                  type="button"
                  onClick={() => setExpandedKey(open ? null : r.key)}
                  aria-expanded={open}
                  className="flex w-full min-h-11 cursor-pointer items-center gap-3 px-4 py-3 text-left"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-ink">{r.label}</span>
                    <span className="text-xs text-ink-500">
                      {r.applicantName} · {r.stage}
                    </span>
                  </span>
                  <Badge tone={statusTone(r.status)}>{r.status}</Badge>
                  <ChevronDown
                    className={cn(
                      'h-4 w-4 shrink-0 text-ink-400 transition-transform duration-200',
                      open && 'rotate-180',
                    )}
                    strokeWidth={ICON_STROKE}
                    aria-hidden
                  />
                </button>
                {open && (
                  <div className="space-y-3 border-t border-primary-100/80 bg-white px-4 py-4">
                    <dl className="grid gap-2 text-sm sm:grid-cols-2">
                      <div>
                        <dt className="text-xs text-ink-400">Applicant</dt>
                        <dd className="font-medium">{r.applicantName}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-ink-400">Email</dt>
                        <dd className="font-medium">{r.email}</dd>
                      </div>
                      <div className="sm:col-span-2">
                        <dt className="text-xs text-ink-400">Note</dt>
                        <dd className="font-medium text-ink-600">{r.note ?? '—'}</dd>
                      </div>
                    </dl>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="secondary"
                        className="min-h-11"
                        onClick={() => setViewRow(r)}
                      >
                        <Eye className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
                        View
                      </Button>
                      <Button
                        variant="secondary"
                        className="min-h-11"
                        onClick={() => {
                          const blob = new Blob(
                            [
                              `Document: ${r.label}\nApplicant: ${r.applicantName}\nEmail: ${r.email}\nStatus: ${r.status}\n`,
                            ],
                            { type: 'text/plain' },
                          )
                          const url = URL.createObjectURL(blob)
                          const a = document.createElement('a')
                          a.href = url
                          a.download = `${r.applicantName.replace(/\s+/g, '_')}-${r.label.slice(0, 24)}.txt`
                          a.click()
                          URL.revokeObjectURL(url)
                        }}
                      >
                        <Download className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
                        Download
                      </Button>
                      {canManage && r.uploaded && (
                        <Button
                          className="min-h-11"
                          onClick={() => {
                            setEditRow(r)
                            setEditStatus(r.status)
                            setEditNote(r.note ?? '')
                          }}
                        >
                          <Pencil className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
                          Edit
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </li>
            )
          })}
          {!applicantRows.length && (
            <li className="py-8 text-center text-sm text-ink-500">
              No documents from accepted applicants yet.
            </li>
          )}
        </ul>
      </Card>
      ) : null}

      <Modal
        open={!!viewRow}
        onClose={() => setViewRow(null)}
        title={viewRow?.label ?? 'Document'}
        description={viewRow ? `${viewRow.applicantName} · ${viewRow.email}` : undefined}
        footer={
          <Button className="min-h-11" onClick={() => setViewRow(null)}>
            Close
          </Button>
        }
      >
        {viewRow && (
          <div className="space-y-3 text-sm">
            <p>
              <span className="text-ink-400">Status: </span>
              <Badge tone={statusTone(viewRow.status)}>{viewRow.status}</Badge>
            </p>
            <p>
              <span className="text-ink-400">Applicant stage: </span>
              <strong>{viewRow.stage}</strong>
            </p>
            <p className="rounded-xl bg-primary-50 p-3 text-ink-600">
              {viewRow.note ||
                'Demo preview — linked file would render here for the accepted applicant pack.'}
            </p>
          </div>
        )}
      </Modal>

      <Modal
        open={!!editRow}
        onClose={() => setEditRow(null)}
        title="Edit document"
        description="Uploaded documents can be updated but not removed."
        footer={
          <>
            <Button variant="secondary" className="min-h-11" onClick={() => setEditRow(null)}>
              Cancel
            </Button>
            <Button
              className="min-h-11"
              onClick={() => {
                if (!editRow) return
                const docKey = editRow.key.split(':')[1]
                onUpdateDoc(editRow.applicationId, docKey, editStatus, editNote.trim() || undefined)
                setEditRow(null)
              }}
            >
              Save
            </Button>
          </>
        }
      >
        {editRow && (
          <div className="space-y-3">
            <p className="text-sm text-ink-600">
              <strong>{editRow.label}</strong> · {editRow.applicantName}
            </p>
            <label className="block text-xs font-medium text-ink-500">
              Status
              <Select
                className="mt-1 min-h-11 w-full"
                value={editStatus}
                onChange={(e) => setEditStatus(e.target.value as ApplicationDocument['status'])}
              >
                {['uploaded', 'verified', 'rejected'].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </Select>
            </label>
            <label className="block text-xs font-medium text-ink-500">
              Note
              <Textarea
                className="mt-1 min-h-20"
                value={editNote}
                onChange={(e) => setEditNote(e.target.value)}
              />
            </label>
          </div>
        )}
      </Modal>
    </div>
  )
}
