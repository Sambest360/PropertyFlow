import { useEffect, useState } from 'react'
import { Landmark } from 'lucide-react'
import type { Agency, DepositBanking } from '../../types/domain'
import { Button, Card, Input, Textarea } from '../ui'

const FIELDS: Array<{ key: keyof DepositBanking; label: string; placeholder: string }> = [
  { key: 'bankName', label: 'Bank', placeholder: 'e.g. FNB' },
  { key: 'accountName', label: 'Account name', placeholder: 'e.g. Acme Properties Trust Account' },
  { key: 'accountNumber', label: 'Account number', placeholder: 'e.g. 62000000000' },
  { key: 'branchCode', label: 'Branch code', placeholder: 'e.g. 250655' },
  { key: 'accountType', label: 'Account type', placeholder: 'e.g. Trust / Cheque' },
  { key: 'referenceHint', label: 'Payment reference', placeholder: 'e.g. Use your application number' },
]

/** Agency admin: the bank account tenants pay their deposit into. */
export function DepositBankingCard({ agency, onSave }: { agency: Agency; onSave: (banking: DepositBanking) => void }) {
  const [draft, setDraft] = useState<DepositBanking>(agency.settings?.depositBanking ?? {})
  const [saved, setSaved] = useState(false)
  useEffect(() => setDraft(agency.settings?.depositBanking ?? {}), [agency.id, agency.settings?.depositBanking])
  return (
    <Card className="space-y-3 p-4" data-tip-target="deposit-banking">
      <h2 className="inline-flex items-center gap-2 font-display text-lg font-semibold text-ink">
        <Landmark className="h-5 w-5 text-primary" aria-hidden /> Deposit bank details
      </h2>
      <p className="text-sm text-ink-500">Sent to applicants with their deposit invoice so they know where to pay. Use the agency trust account.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {FIELDS.map((f) => (
          <label key={f.key} className="block text-sm">
            <span className="mb-1 block text-xs font-semibold text-ink-500">{f.label}</span>
            <Input value={draft[f.key] ?? ''} placeholder={f.placeholder} onChange={(e) => { setSaved(false); setDraft((d) => ({ ...d, [f.key]: e.target.value })) }} />
          </label>
        ))}
      </div>
      <label className="block text-sm">
        <span className="mb-1 block text-xs font-semibold text-ink-500">Notes for tenants (optional)</span>
        <Textarea rows={2} value={draft.notes ?? ''} placeholder="e.g. Deposits are held in an interest-bearing account as the Rental Housing Act requires." onChange={(e) => { setSaved(false); setDraft((d) => ({ ...d, notes: e.target.value })) }} />
      </label>
      <div className="flex items-center gap-3">
        <Button type="button" onClick={() => { onSave(draft); setSaved(true) }}>Save bank details</Button>
        {saved ? <span className="text-xs text-ink-500" role="status">Saved.</span> : null}
      </div>
    </Card>
  )
}

export function bankingIsComplete(b: DepositBanking | undefined): boolean {
  return Boolean(b?.bankName?.trim() && b?.accountNumber?.trim() && b?.accountName?.trim())
}

/** Read-only bank details block (staff and tenant views). */
export function BankingDetails({ banking, reference }: { banking: DepositBanking; reference?: string }) {
  const rows: Array<[string, string | undefined]> = [
    ['Bank', banking.bankName],
    ['Account name', banking.accountName],
    ['Account number', banking.accountNumber],
    ['Branch code', banking.branchCode],
    ['Account type', banking.accountType],
    ['Reference', reference || banking.referenceHint],
  ]
  return (
    <dl className="grid gap-x-4 gap-y-1 rounded-xl border border-primary-100 bg-white p-3 text-sm sm:grid-cols-2">
      {rows
        .filter(([, v]) => v && v.trim())
        .map(([k, v]) => (
          <div key={k} className="flex justify-between gap-2 sm:block">
            <dt className="text-xs text-ink-500">{k}</dt>
            <dd className="font-semibold tabular-nums text-ink">{v}</dd>
          </div>
        ))}
      {banking.notes ? <p className="text-xs text-ink-500 sm:col-span-2">{banking.notes}</p> : null}
    </dl>
  )
}
