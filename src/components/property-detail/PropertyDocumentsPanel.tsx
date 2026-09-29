import { useMemo, useRef, useState } from 'react'
import { ChevronDown, Download, Eye, FileText, Pencil, Search, Upload } from 'lucide-react'
import type {
  Application,
  ApplicationDocument,
  PropertyDocument,
} from '../../types/domain'
import { Badge, Button, Card, Input, Modal, Select, Textarea, cn, statusTone } from '../ui'
import { resolveDocumentUrl } from '../../lib/api/documents'
import { toStorageRef } from '../../lib/storage/contract'
import { getFileStorage } from '../../lib/storage'
import { propertyDocumentTarget } from '../../lib/storage/targets'
import { MediaLink } from '../media/MediaImage'
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
  propertyId,
  agencyId,
  onAddDocument,
}: {
  propertyDocuments: PropertyDocument[]
  applications: Application[]
  canManage: boolean
  propertyId?: string
  agencyId?: string
  onAddDocument?: (doc: Omit<PropertyDocument, 'id'>) => void
  onUpdateDoc: (
    applicationId: string,
    key: string,
    status: ApplicationDocument['status'],
    note?: string,
  ) => void
}) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<PropertyDocument['category'] | 'all'>('all')
  const [expandedKey, setExpandedKey] = useState<string | null>(null)
  const [editRow, setEditRow] = useState<AcceptedDocRow | null>(null)
  const [viewRow, setViewRow] = useState<AcceptedDocRow | null>(null)
  const [editStatus, setEditStatus] = useState<ApplicationDocument['status']>('uploaded')
  const [editNote, setEditNote] = useState('')
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [categoryPick, setCategoryPick] = useState<PropertyDocument['category']>('Other')
  const fileRef = useRef<HTMLInputElement>(null)

  const uploadRegisterFile = async (file: File | null) => {
    if (!file || !propertyId || !agencyId || !onAddDocument) return
    setUploadError(null)
    setUploading(true)
    try {
      const uploaded = await getFileStorage().upload({
        ...propertyDocumentTarget(agencyId, propertyId, categoryPick.toLowerCase()),
        file,
      })
      onAddDocument({
        agencyId,
        propertyId,
        name: file.name,
        category: categoryPick,
        status: 'uploaded',
        uploadedAt: new Date().toISOString().slice(0, 10),
        fileUrl: toStorageRef(uploaded.file_id),
      })
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Could not upload that document.')
    } finally {
      setUploading(false)
    }
  }

  const registerRows = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return propertyDocuments
      .filter((d) => (category === 'all' ? true : d.category === category))
      .filter((d) => {
        if (!needle) return true
        return [d.name, d.category, d.status, d.note ?? '', d.applicantName ?? '']
          .join(' ')
          .toLowerCase()
          .includes(needle)
      })
      .sort((a, b) => (b.uploadedAt ?? '').localeCompare(a.uploadedAt ?? ''))
  }, [propertyDocuments, query, category])

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

  const categories: Array<PropertyDocument['category'] | 'all'> = [
    'all',
    'Title',
    'Compliance',
    'Lease',
    'Inspection',
    'Marketing',
    'Other',
  ]

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
              New files are stored privately. Older links still open.
            </p>
          </div>
          {canManage && propertyId && agencyId && onAddDocument ? (
            <div className="flex flex-wrap items-center gap-2">
              <Select
                className="min-h-11 cursor-pointer"
                value={categoryPick}
                onChange={(e) => setCategoryPick(e.target.value as PropertyDocument['category'])}
                aria-label="Document category"
              >
                {categories.filter((c) => c !== 'all').map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
              <Button
                type="button"
                variant="secondary"
                className="min-h-11"
                disabled={uploading}
                onClick={() => fileRef.current?.click()}
              >
                <Upload className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
                {uploading ? 'Uploading…' : 'Upload document'}
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png"
                className="sr-only"
                onChange={(e) => {
                  void uploadRegisterFile(e.target.files?.[0] ?? null)
                  e.target.value = ''
                }}
              />
            </div>
          ) : null}
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
              value={category}
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

        {uploadError ? (
          <p role="alert" className="mb-3 text-sm font-medium text-accent">
            {uploadError}
          </p>
        ) : null}

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
                        <MediaLink
                          href={href}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex min-h-11 cursor-pointer items-center text-sm font-semibold text-primary underline-offset-2 hover:underline"
                        >
                          Open
                        </MediaLink>
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
