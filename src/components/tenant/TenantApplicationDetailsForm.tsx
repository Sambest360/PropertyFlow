import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { Application } from '../../types/domain'
import { Button, Card, Input } from '../ui'
import { buildScreeningDraft } from '../../lib/applicationScreening'
import { centsToZarInput, formatCentsAsZar } from '../../lib/money/zarToCents'

function incomeFieldValue(application: Application): string {
  if (application.grossMonthlyIncomeCents != null) {
    return centsToZarInput(application.grossMonthlyIncomeCents)
  }
  if (Number.isInteger(application.income) && application.income > 0) {
    return centsToZarInput(Number(BigInt(application.income) * 100n))
  }
  return ''
}

export function TenantApplicationDetailsForm({
  application,
  onSave,
  autoSave = false,
}: {
  application: Application
  onSave: (patch: Partial<Application>) => void
  autoSave?: boolean
}) {
  const [phone, setPhone] = useState(application.phone ?? '')
  const [employment, setEmployment] = useState(application.employment ?? '')
  const [income, setIncome] = useState(() => incomeFieldValue(application))
  const [idNumber, setIdNumber] = useState(application.idNumberOrPassport ?? '')
  const [idError, setIdError] = useState<string | null>(null)
  const [incomeError, setIncomeError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const debounceRef = useRef<number | null>(null)

  useEffect(() => {
    setPhone(application.phone ?? '')
    setEmployment(application.employment ?? '')
    setIncome(incomeFieldValue(application))
    setIdNumber(application.idNumberOrPassport ?? '')
    setIdError(null)
    setIncomeError(null)
  }, [application.id, application.phone, application.employment, application.income, application.grossMonthlyIncomeCents, application.idNumberOrPassport])

  const save = () => {
    const draft = buildScreeningDraft(idNumber, income)
    if (draft.ok === false) {
      setIdError(draft.idMessage ?? null)
      setIncomeError(draft.incomeMessage ?? null)
      onSave({ phone: phone.trim(), employment: employment.trim() })
      return
    }
    setIdError(null)
    setIncomeError(null)
    onSave({
      phone: phone.trim(),
      employment: employment.trim(),
      income: draft.incomeRands,
      grossMonthlyIncomeCents: draft.grossMonthlyIncomeCents,
      idType: draft.idType,
      idNumberOrPassport: draft.idNumber,
    })
    setSaved(true)
    window.setTimeout(() => setSaved(false), 2500)
  }

  useEffect(() => {
    if (!autoSave) return
    if (debounceRef.current) window.clearTimeout(debounceRef.current)
    debounceRef.current = window.setTimeout(() => {
      const screeningTouched =
        idNumber.trim() !== (application.idNumberOrPassport ?? '') ||
        income.trim() !== incomeFieldValue(application)
      const draft = buildScreeningDraft(idNumber, income)
      if (draft.ok === false) {
        if (screeningTouched) {
          setIdError(draft.idMessage ?? null)
          setIncomeError(draft.incomeMessage ?? null)
        }
        const contactPatch: Partial<Application> = {
          phone: phone.trim(),
          employment: employment.trim(),
        }
        if (
          contactPatch.phone !== (application.phone ?? '') ||
          contactPatch.employment !== (application.employment ?? '')
        ) {
          onSave(contactPatch)
          setSaved(true)
          window.setTimeout(() => setSaved(false), 1500)
        }
        return
      }
      setIdError(null)
      setIncomeError(null)
      const patch: Partial<Application> = {
        phone: phone.trim(),
        employment: employment.trim(),
        income: draft.incomeRands,
        grossMonthlyIncomeCents: draft.grossMonthlyIncomeCents,
        idType: draft.idType,
        idNumberOrPassport: draft.idNumber,
      }
      const changed =
        patch.phone !== (application.phone ?? '') ||
        patch.employment !== (application.employment ?? '') ||
        patch.grossMonthlyIncomeCents !== application.grossMonthlyIncomeCents ||
        patch.idNumberOrPassport !== application.idNumberOrPassport ||
        patch.idType !== application.idType
      if (changed) {
        onSave(patch)
        setSaved(true)
        window.setTimeout(() => setSaved(false), 1500)
      }
    }, 450)
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current)
    }
  }, [phone, employment, income, idNumber, autoSave, application, onSave])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    save()
  }

  const onFile =
    application.grossMonthlyIncomeCents != null
      ? formatCentsAsZar(application.grossMonthlyIncomeCents)
      : null

  return (
    <Card className="p-5">
      <h2 className="font-display text-lg font-semibold text-ink">Your details</h2>
      <p className="mt-1 text-sm text-ink-500">
        {autoSave
          ? 'Changes save automatically as you type.'
          : 'Keep this information current — the agency uses it for screening and your lease.'}
      </p>
      <form onSubmit={submit} className="mt-4 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm" htmlFor="application-name">
            <span className="font-medium text-ink">Full name</span>
            <Input id="application-name" className="mt-1" value={application.applicantName} disabled />
          </label>
          <label className="block text-sm" htmlFor="application-email">
            <span className="font-medium text-ink">Email</span>
            <Input id="application-email" className="mt-1" value={application.email} disabled />
          </label>
          <label className="block text-sm" htmlFor="application-phone">
            <span className="font-medium text-ink">Phone</span>
            <Input
              id="application-phone"
              className="mt-1"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              autoComplete="tel"
              required
            />
          </label>
          <label className="block text-sm" htmlFor="application-id">
            <span className="font-medium text-ink">ID / passport</span>
            <Input
              id="application-id"
              className="mt-1"
              value={idNumber}
              onChange={(e) => setIdNumber(e.target.value)}
              autoComplete="off"
              aria-invalid={idError ? true : undefined}
              aria-describedby={idError ? 'application-id-error' : undefined}
              required
            />
            {idError ? (
              <span id="application-id-error" className="mt-1 block text-xs text-accent-700" role="alert">
                {idError}
              </span>
            ) : null}
          </label>
          <label className="block text-sm" htmlFor="application-employment">
            <span className="font-medium text-ink">Employment</span>
            <Input
              id="application-employment"
              className="mt-1"
              value={employment}
              onChange={(e) => setEmployment(e.target.value)}
              required
            />
          </label>
          <label className="block text-sm" htmlFor="application-income">
            <span className="font-medium text-ink">Gross monthly income (ZAR)</span>
            <Input
              id="application-income"
              className="mt-1"
              inputMode="decimal"
              value={income}
              onChange={(e) => setIncome(e.target.value)}
              aria-invalid={incomeError ? true : undefined}
              aria-describedby={incomeError ? 'application-income-error' : 'application-income-hint'}
              required
            />
            {incomeError ? (
              <span id="application-income-error" className="mt-1 block text-xs text-accent-700" role="alert">
                {incomeError}
              </span>
            ) : (
              <span id="application-income-hint" className="mt-1 block text-xs text-ink-400">
                Type rands, for example 12 345,67.
              </span>
            )}
          </label>
        </div>
        {onFile ? <p className="text-xs text-ink-500">On file: {onFile} / month</p> : null}
        {!autoSave ? (
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" className="min-h-11 cursor-pointer">
              Save details
            </Button>
            {saved ? <span className="text-sm font-medium text-emerald-700">Saved</span> : null}
          </div>
        ) : saved ? (
          <p className="text-sm font-medium text-emerald-700">Saved</p>
        ) : null}
      </form>
    </Card>
  )
}
