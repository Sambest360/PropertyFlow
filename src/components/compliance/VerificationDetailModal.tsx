/** Everything a landlord / contractor submitted for verification: details and documents. */
import { FileText, ExternalLink } from 'lucide-react'
import type { AppUser } from '../../types/domain'
import { roleLabels } from '../../lib/permissions'
import { Badge, Button, Modal } from '../ui'

function label(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/^./, (c) => c.toUpperCase())
}

function show(v: unknown): string {
  if (v == null || v === '') return '—'
  if (Array.isArray(v)) return v.map(show).join(', ')
  if (typeof v === 'boolean') return v ? 'Yes' : 'No'
  if (typeof v === 'object') return Object.entries(v as Record<string, unknown>).map(([k, x]) => `${label(k)}: ${show(x)}`).join('; ')
  return String(v)
}

export function VerificationDetailModal({
  user,
  canDecide,
  busy,
  onClose,
  onApprove,
  onReject,
}: {
  user: AppUser
  canDecide: boolean
  busy: boolean
  onClose: () => void
  onApprove: () => void
  onReject: () => void
}) {
  const v = user.verification
  const profile = (v?.profile ?? {}) as Record<string, unknown>
  const docs = v?.documents ?? []
  const contact: Array<[string, unknown]> = [
    ['Email', user.email],
    ['Phone', user.phone],
    ['ID or passport', user.idNumberOrPassport],
    ['Date of birth', user.dateOfBirth],
    ['Company', user.company],
  ]
  return (
    <Modal
      open
      size="lg"
      onClose={onClose}
      title={user.name}
      description={`${roleLabels[user.role]} · submitted ${v?.submittedAt ? new Date(v.submittedAt).toLocaleString('en-ZA') : 'recently'}`}
      footer={
        canDecide ? (
          <>
            <Button variant="secondary" disabled={busy} onClick={onReject}>
              Reject
            </Button>
            <Button disabled={busy} onClick={onApprove}>
              Approve
            </Button>
          </>
        ) : (
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        )
      }
    >
      <div className="space-y-5">
        <section>
          <h3 className="text-sm font-semibold text-ink">Contact and identity</h3>
          <dl className="mt-2 grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
            {contact.map(([k, val]) => (
              <div key={k}>
                <dt className="text-xs text-ink-400">{k}</dt>
                <dd className="text-ink-700">{show(val)}</dd>
              </div>
            ))}
          </dl>
        </section>
        {Object.keys(profile).length ? (
          <section>
            <h3 className="text-sm font-semibold text-ink">Details they gave</h3>
            <dl className="mt-2 grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
              {Object.entries(profile).map(([k, val]) => (
                <div key={k}>
                  <dt className="text-xs text-ink-400">{label(k)}</dt>
                  <dd className="break-words text-ink-700">{show(val)}</dd>
                </div>
              ))}
            </dl>
          </section>
        ) : null}
        <section>
          <h3 className="text-sm font-semibold text-ink">Documents ({docs.length})</h3>
          {docs.length === 0 ? <p className="mt-2 text-sm text-ink-500">No documents uploaded.</p> : null}
          <ul className="mt-2 grid gap-3 sm:grid-cols-2">
            {docs.map((d) => (
              <li key={d.key} className="rounded-xl border border-primary-100 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-ink">{d.label}</p>
                  {d.lookedAt ? <Badge tone="neutral">Opened</Badge> : null}
                </div>
                <p className="truncate text-xs text-ink-500">{d.name}</p>
                {d.mimeType.startsWith('image/') ? (
                  <img src={d.dataUrl} alt={d.label} className="mt-2 max-h-56 w-full rounded-lg border border-primary-50 object-contain" />
                ) : (
                  <p className="mt-2 inline-flex items-center gap-1 text-xs text-ink-500">
                    <FileText className="h-4 w-4" aria-hidden /> {d.mimeType}
                  </p>
                )}
                <a href={d.dataUrl} target="_blank" rel="noopener noreferrer" download={d.name} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
                  Open full document <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                </a>
              </li>
            ))}
          </ul>
        </section>
        {!canDecide ? <p className="text-xs text-ink-500">The platform team approves landlord and contractor documents.</p> : null}
      </div>
    </Modal>
  )
}
