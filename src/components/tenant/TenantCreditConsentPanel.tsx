import { useEffect, useMemo, useState } from 'react'
import type { Application } from '../../types/domain'
import { creditConsentAdultsRequired, hasAllAdultCreditConsents } from '../../lib/screening/creditConsent'
import { Button, Card, Input } from '../ui'

type AdultDraft = { name: string; idNumber: string; signatureText: string; consented: boolean }

function draftsFromApp(application: Application): AdultDraft[] {
  const required = creditConsentAdultsRequired(application)
  const granted = application.creditCheckConsents?.adults ?? []
  return required.map((adult) => {
    const match = granted.find(
      (g) => g.idNumber.replace(/\s+/g, '').toLowerCase() === adult.idNumber.replace(/\s+/g, '').toLowerCase(),
    )
    return {
      name: adult.name,
      idNumber: adult.idNumber,
      signatureText: match?.signatureText ?? '',
      consented: Boolean(match?.signatureText?.trim() && match.grantedAt),
    }
  })
}

export function TenantCreditConsentPanel({
  application,
  onCapture,
}: {
  application: Application
  onCapture: (adults: Array<{ name: string; idNumber: string; signatureText: string }>) => Promise<void>
}) {
  const [adults, setAdults] = useState<AdultDraft[]>(() => draftsFromApp(application))
  useEffect(() => {
    setAdults(draftsFromApp(application))
  }, [application])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const complete = useMemo(() => hasAllAdultCreditConsents(application), [application])

  const updateRow = (index: number, patch: Partial<AdultDraft>) => {
    setAdults((rows) => rows.map((r, i) => (i === index ? { ...r, ...patch } : r)))
  }

  const addAdult = () => {
    setAdults((rows) => [...rows, { name: '', idNumber: '', signatureText: '', consented: false }])
  }

  const removeAdult = (index: number) => {
    if (adults.length <= 1) return
    setAdults((rows) => rows.filter((_, i) => i !== index))
  }

  const submit = async () => {
    setError(null)
    setSaving(true)
    try {
      const pending = adults.filter((a) => !a.consented && a.signatureText.trim().length >= 2)
      if (!pending.length && complete) return
      for (const row of pending) {
        if (!row.name.trim() || !row.idNumber.trim()) {
          setError('Name and ID number are required for each adult.')
          return
        }
      }
      await onCapture(
        pending.map((row) => ({
          name: row.name.trim(),
          idNumber: row.idNumber.trim(),
          signatureText: row.signatureText.trim(),
        })),
      )
      setAdults(draftsFromApp(application))
    } finally {
      setSaving(false)
    }
  }

  if (application.type !== 'Rental') return null

  return (
    <Card className="p-5">
      <h2 className="font-display text-lg font-semibold text-ink">Credit-check consent (NCA)</h2>
      <p className="mt-1 text-sm text-ink-500">
        Regulation 18 requires written consent from every adult before a credit enquiry. Type your full name as
        signature for each person listed below.
      </p>
      <div className="mt-4 space-y-4">
        {adults.map((row, index) => (
          <div key={index} className="rounded-xl border border-primary-100 p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-ink">Adult {index + 1}</p>
              {adults.length > 1 ? (
                <button
                  type="button"
                  className="text-xs font-semibold text-ink-500 hover:text-ink"
                  onClick={() => removeAdult(index)}
                >
                  Remove
                </button>
              ) : null}
            </div>
            <label className="block text-sm">
              <span className="font-medium text-ink">Full name</span>
              <Input
                className="mt-1"
                value={row.name}
                disabled={row.consented}
                onChange={(e) => updateRow(index, { name: e.target.value })}
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-ink">SA ID number</span>
              <Input
                className="mt-1"
                value={row.idNumber}
                disabled={row.consented}
                onChange={(e) => updateRow(index, { idNumber: e.target.value })}
              />
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={row.consented || row.signatureText.length > 0}
                disabled={row.consented}
                onChange={() => undefined}
                readOnly={!row.consented}
              />
              <span>
                I consent to a credit check and understand my rights under POPIA and the National Credit Act.
              </span>
            </label>
            <label className="block text-sm">
              <span className="font-medium text-ink">Typed signature</span>
              <Input
                className="mt-1"
                placeholder="Type full legal name"
                value={row.signatureText}
                disabled={row.consented}
                onChange={(e) => updateRow(index, { signatureText: e.target.value })}
              />
            </label>
            {row.consented ? (
              <p className="text-xs font-medium text-emerald-700">Consent recorded</p>
            ) : null}
          </div>
        ))}
        <Button type="button" variant="secondary" className="min-h-11" onClick={addAdult}>
          Add another adult
        </Button>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        {complete ? (
          <p className="text-sm font-medium text-emerald-700">All required consents are on file.</p>
        ) : (
          <Button type="button" className="min-h-11" disabled={saving} onClick={() => void submit()}>
            {saving ? 'Saving…' : 'Save consent'}
          </Button>
        )}
      </div>
    </Card>
  )
}
