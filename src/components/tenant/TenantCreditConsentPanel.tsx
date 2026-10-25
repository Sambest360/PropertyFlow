import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Application } from '../../types/domain'
import { creditConsentAdultsRequired, hasAllAdultCreditConsents } from '../../lib/screening/creditConsent'
import {
  CHECK_TYPE_LABELS,
  POPIA_RIGHTS_TEXT,
  maskIdNumber,
  providerDisplayName,
  retentionText,
} from '../../lib/screening/consentTerms'
import { screeningApi, screeningApiAvailable, type ScreeningConsentTerms } from '../../lib/api/screeningApi'
import { Button, Card, Input } from '../ui'

type AdultDraft = {
  name: string
  idNumber: string
  signatureText: string
  /** Consent already on file (read-only row). */
  consented: boolean
  /** The applicant ticked the consent box for this row. */
  agreed: boolean
}

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
      agreed: Boolean(match?.signatureText?.trim() && match.grantedAt),
    }
  })
}

/**
 * Consent for the server-run checks (POST /api/screening/consents). Lists each
 * check, its providers and retention, and the POPIA rights; signed with a
 * checkbox and the applicant's typed name.
 */
function ScreeningConsentSection({ applicationId }: { applicationId: string }) {
  const [terms, setTerms] = useState<ScreeningConsentTerms | null>(null)
  const [agreed, setAgreed] = useState(false)
  const [typedName, setTypedName] = useState('')
  const [showText, setShowText] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setTerms(await screeningApi.consentTerms(applicationId))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the consent wording')
    }
  }, [applicationId])

  useEffect(() => {
    void load()
  }, [load])

  if (!terms) return error ? <p className="text-sm text-red-600">{error}</p> : null

  const active = terms.consents.filter((c) => c.active)
  const submit = async () => {
    setError(null)
    setSaving(true)
    try {
      await screeningApi.giveConsent({
        applicationId,
        checkTypes: terms.checkTypes,
        typedName,
        consentTextVersion: terms.version,
      })
      setAgreed(false)
      setTypedName('')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save consent')
    } finally {
      setSaving(false)
    }
  }
  const withdraw = async (id: string) => {
    if (!window.confirm('Withdraw this consent? Checks already run are not undone.')) return
    try {
      await screeningApi.withdrawConsent(id)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not withdraw consent')
    }
  }

  return (
    <div className="mt-6 space-y-3 border-t border-primary-100 pt-5">
      <h3 className="font-display text-base font-semibold text-ink">Screening checks consent</h3>
      <p className="text-sm text-ink-500">
        {terms.agencyName} will run these checks. Consent lasts {terms.validDays} days.
      </p>
      <ul className="space-y-2 text-sm">
        {terms.checkTypes.map((type) => (
          <li key={type} className="rounded-xl border border-primary-100 p-3">
            <p className="font-medium text-ink">{CHECK_TYPE_LABELS[type]}</p>
            <p className="text-xs text-ink-500">
              Provider: {(terms.providers[type] ?? []).map(providerDisplayName).join(' or ') || 'not set up yet'}
            </p>
            <p className="text-xs text-ink-500">Kept: {retentionText(type, terms.creditRetentionMonths)}</p>
          </li>
        ))}
      </ul>
      <p className="text-xs text-ink-500">{POPIA_RIGHTS_TEXT}</p>
      <button
        type="button"
        className="text-xs font-semibold text-ink-500 hover:text-ink"
        onClick={() => setShowText((v) => !v)}
      >
        {showText ? 'Hide full consent wording' : 'Read full consent wording'}
      </button>
      {showText ? (
        <pre className="whitespace-pre-wrap rounded-xl bg-primary-50 p-3 text-xs text-ink">{terms.text}</pre>
      ) : null}

      {active.length ? (
        <ul className="space-y-2">
          {active.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="text-emerald-700">
                Consent given by {c.subjectName}
                {c.subjectId ? ` (ID ${c.subjectId})` : ''} on {new Date(c.acceptedAt).toLocaleDateString()}
              </span>
              <button
                type="button"
                className="text-xs font-semibold text-ink-500 hover:text-ink"
                onClick={() => void withdraw(c.id)}
              >
                Withdraw
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
            <span>I have read the wording above and consent to these checks.</span>
          </label>
          <label className="block text-sm">
            <span className="font-medium text-ink">Type your full name to sign ({terms.applicantName})</span>
            <Input
              className="mt-1"
              placeholder="Type full legal name"
              value={typedName}
              onChange={(e) => setTypedName(e.target.value)}
            />
          </label>
          <Button
            type="button"
            className="min-h-11"
            disabled={!agreed || typedName.trim().length < 2 || saving}
            onClick={() => void submit()}
          >
            {saving ? 'Saving…' : 'Give screening consent'}
          </Button>
        </>
      )}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  )
}

export function TenantCreditConsentPanel({
  application,
  onCapture,
}: {
  application: Application
  onCapture: (adults: Array<{ name: string; idNumber: string; signatureText: string }>) => Promise<void>
}) {
  const [adults, setAdults] = useState<AdultDraft[]>(() => draftsFromApp(application))
  // Reset the rows only when the saved consents (or the application) change —
  // not on every refresh of the application object, which wiped what the
  // applicant was typing (e.g. the ID number).
  const savedKey = `${application.id}|${JSON.stringify(application.creditCheckConsents?.adults ?? [])}`
  useEffect(() => {
    setAdults(draftsFromApp(application))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedKey])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedMessage, setSavedMessage] = useState<string | null>(null)

  const complete = useMemo(() => hasAllAdultCreditConsents(application), [application])

  const updateRow = (index: number, patch: Partial<AdultDraft>) => {
    setAdults((rows) => rows.map((r, i) => (i === index ? { ...r, ...patch } : r)))
    setError(null)
    setSavedMessage(null)
  }

  const addAdult = () => {
    setAdults((rows) => [...rows, { name: '', idNumber: '', signatureText: '', consented: false, agreed: false }])
  }

  const removeAdult = (index: number) => {
    if (adults.length <= 1) return
    setAdults((rows) => rows.filter((_, i) => i !== index))
  }

  const submit = async () => {
    setError(null)
    setSavedMessage(null)
    const open = adults.filter((a) => !a.consented)
    if (!open.length) return
    for (const row of open) {
      const who = adults.length > 1 ? `Adult ${adults.indexOf(row) + 1}: ` : ''
      if (!row.name.trim()) return setError(`${who}enter the full name.`)
      if (!/^\d{13}$/.test(row.idNumber.replace(/\s+/g, ''))) {
        return setError(`${who}enter a 13-digit SA ID number.`)
      }
      if (!row.agreed) return setError(`${who}tick the consent box.`)
      if (row.signatureText.trim().length < 2) return setError(`${who}type your full legal name as your signature.`)
    }
    setSaving(true)
    try {
      await onCapture(
        open.map((row) => ({
          name: row.name.trim(),
          idNumber: row.idNumber.replace(/\s+/g, ''),
          signatureText: row.signatureText.trim(),
        })),
      )
      setSavedMessage('Consent saved.')
    } catch {
      setError('Could not save your consent. Check your connection and try again.')
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
                value={row.consented ? maskIdNumber(row.idNumber) : row.idNumber}
                disabled={row.consented}
                inputMode="numeric"
                autoComplete="off"
                maxLength={16}
                placeholder="13-digit ID number"
                onChange={(e) => updateRow(index, { idNumber: e.target.value })}
              />
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 cursor-pointer accent-primary"
                checked={row.agreed}
                disabled={row.consented || saving}
                onChange={(e) => updateRow(index, { agreed: e.target.checked })}
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
        {error ? (
          <p className="text-sm text-red-600" role="alert">
            {error}
          </p>
        ) : null}
        {savedMessage && !complete ? <p className="text-sm font-medium text-emerald-700">{savedMessage}</p> : null}
        {complete ? (
          <p className="text-sm font-medium text-emerald-700">All required consents are on file.</p>
        ) : (
          <Button type="button" className="min-h-11" disabled={saving} onClick={() => void submit()}>
            {saving ? 'Saving…' : 'Save consent'}
          </Button>
        )}
      </div>
      {screeningApiAvailable ? <ScreeningConsentSection applicationId={application.id} /> : null}
    </Card>
  )
}
