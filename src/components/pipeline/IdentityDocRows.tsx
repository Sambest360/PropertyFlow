/**
 * Identity documents (ID, proof of address, FICA declaration) with view and
 * upload, for stages that need them in before approving.
 */
import { useState } from 'react'
import { CheckCircle2, Circle, Eye, Upload } from 'lucide-react'
import type { Application } from '../../types/domain'
import { readDocumentFile } from '../../lib/applicationDocDownscale'
import { APPLICATION_DOC_ACCEPT, applicationDocTypeError } from '../../lib/applicationDocUpload'
import { openApplicationDocumentFile } from '../../lib/applicationDocumentFile'

const KEYS = ['id', 'address', 'fica']

export function IdentityDocRows({
  application,
  onUpload,
}: {
  application: Application
  onUpload: (key: string, file: { name: string; mimeType: string; dataUrl: string }) => Promise<boolean> | void
}) {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const docs = KEYS.map((k) => application.documents.find((d) => d.key === k)).filter(Boolean) as Application['documents']
  if (docs.every((d) => d.status === 'uploaded' || d.status === 'verified')) return null
  const upload = async (key: string, f: File) => {
    const err = applicationDocTypeError(f)
    if (err) return setError(err)
    setBusy(key)
    try {
      const read = await readDocumentFile(f, 1_200_000)
      await onUpload(key, { name: read.name, mimeType: read.mimeType, dataUrl: read.dataUrl })
      setError('')
    } catch {
      setError('Could not read that file.')
    } finally {
      setBusy(null)
    }
  }
  return (
    <div>
      <p className="mb-1 text-xs font-semibold text-ink-500">Identity documents</p>
      <ul className="divide-y divide-primary-50 rounded-xl border border-primary-100 bg-white">
        {docs.map((d) => {
          const inFile = d.status === 'uploaded' || d.status === 'verified'
          return (
            <li key={d.key} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
              {inFile ? <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden /> : <Circle className="h-4 w-4 text-ink-300" aria-hidden />}
              <span className="min-w-0 flex-1 text-ink">{d.label}</span>
              {d.file ? (
                <button type="button" className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline" onClick={() => openApplicationDocumentFile(d.file!)}>
                  <Eye className="h-3.5 w-3.5" aria-hidden /> View
                </button>
              ) : null}
              {!inFile ? (
                <label className="inline-flex cursor-pointer items-center gap-1 text-xs font-semibold text-primary hover:underline">
                  <Upload className="h-3.5 w-3.5" aria-hidden /> {busy === d.key ? 'Uploading…' : 'Upload'}
                  <input type="file" accept={APPLICATION_DOC_ACCEPT} className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(d.key, f); e.target.value = '' }} />
                </label>
              ) : null}
            </li>
          )
        })}
      </ul>
      {error ? <p className="mt-1 text-sm text-red-700" role="alert">{error}</p> : null}
    </div>
  )
}
