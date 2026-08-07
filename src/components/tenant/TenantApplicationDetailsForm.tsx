import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { Application } from '../../types/domain'
import { formatZAR } from '../../data/seed'
import { Button, Card, Input } from '../ui'

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
  const [income, setIncome] = useState(String(application.income || ''))
  const [idNumber, setIdNumber] = useState(application.idNumberOrPassport ?? '')
  const [saved, setSaved] = useState(false)
  const debounceRef = useRef<number | null>(null)

  useEffect(() => {
    setPhone(application.phone ?? '')
    setEmployment(application.employment ?? '')
    setIncome(String(application.income || ''))
    setIdNumber(application.idNumberOrPassport ?? '')
  }, [application.id, application.phone, application.employment, application.income, application.idNumberOrPassport])

  const buildPatch = (): Partial<Application> => ({
    phone: phone.trim(),
    employment: employment.trim(),
    income: Number(income) || 0,
    idNumberOrPassport: idNumber.trim() || undefined,
  })

  const save = () => {
    onSave(buildPatch())
    setSaved(true)
    window.setTimeout(() => setSaved(false), 2500)
  }

  useEffect(() => {
    if (!autoSave) return
    if (debounceRef.current) window.clearTimeout(debounceRef.current)
    debounceRef.current = window.setTimeout(() => {
      const patch = buildPatch()
      const changed =
        patch.phone !== (application.phone ?? '') ||
        patch.employment !== (application.employment ?? '') ||
        patch.income !== application.income ||
        patch.idNumberOrPassport !== application.idNumberOrPassport
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
          <label className="block text-sm">
            <span className="font-medium text-ink">Full name</span>
            <Input className="mt-1" value={application.applicantName} disabled />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-ink">Email</span>
            <Input className="mt-1" value={application.email} disabled />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-ink">Phone</span>
            <Input
              className="mt-1"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Mobile number"
              required
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-ink">ID / passport</span>
            <Input
              className="mt-1"
              value={idNumber}
              onChange={(e) => setIdNumber(e.target.value)}
              placeholder="SA ID or passport number"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-ink">Employment</span>
            <Input
              className="mt-1"
              value={employment}
              onChange={(e) => setEmployment(e.target.value)}
              placeholder="Employer and role"
              required
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-ink">Monthly income (ZAR)</span>
            <Input
              className="mt-1"
              type="number"
              min={0}
              value={income}
              onChange={(e) => setIncome(e.target.value)}
              placeholder="Gross monthly income"
              required
            />
          </label>
        </div>
        {application.income > 0 ? (
          <p className="text-xs text-ink-500">On file: {formatZAR(application.income)}/mo</p>
        ) : null}
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
