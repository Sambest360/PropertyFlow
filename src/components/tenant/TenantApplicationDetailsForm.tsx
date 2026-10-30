import { useEffect, useState, type FormEvent } from 'react'
import type { Application } from '../../types/domain'
import { formatZAR } from '../../data/seed'
import { formatEmploymentSummary } from '../../lib/employmentDisplay'
import { Button, Card, Input } from '../ui'
import { JobTitleSelect } from '../JobTitleSelect'

/** T1: shown under a field the application has no value for. */
function NotProvided({ value }: { value: string | null | undefined }) {
  if (value?.trim()) return null
  return <span className="mt-1 block text-xs text-ink-400">Not provided</span>
}

export function TenantApplicationDetailsForm({
  application,
  onSave,
}: {
  application: Application
  onSave: (patch: Partial<Application>) => void
}) {
  const [phone, setPhone] = useState(application.phone ?? '')
  const [employerName, setEmployerName] = useState(application.employerName ?? '')
  const [jobTitle, setJobTitle] = useState(application.jobTitle ?? '')
  const [income, setIncome] = useState(String(application.income || ''))
  const [idNumber, setIdNumber] = useState(application.idNumberOrPassport ?? '')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setPhone(application.phone ?? '')
    setEmployerName(application.employerName ?? '')
    setJobTitle(application.jobTitle ?? '')
    setIncome(String(application.income || ''))
    setIdNumber(application.idNumberOrPassport ?? '')
  }, [
    application.id,
    application.phone,
    application.employerName,
    application.jobTitle,
    application.income,
    application.idNumberOrPassport,
  ])

  const buildPatch = (): Partial<Application> => {
    const employer = employerName.trim()
    const title = jobTitle.trim()
    return {
      phone: phone.trim(),
      employerName: employer || undefined,
      jobTitle: title || undefined,
      employment: formatEmploymentSummary(employer, title, application.employment ?? 'To be completed'),
      income: Number(income) || 0,
      idNumberOrPassport: idNumber.trim() || undefined,
    }
  }

  // Saved only when the applicant presses Save (auto-save re-saved on every
  // render and made the status flicker).
  const dirty =
    phone.trim() !== (application.phone ?? '') ||
    employerName.trim() !== (application.employerName ?? '') ||
    jobTitle.trim() !== (application.jobTitle ?? '') ||
    (Number(income) || 0) !== (application.income || 0) ||
    idNumber.trim() !== (application.idNumberOrPassport ?? '')

  const save = () => {
    if (!dirty) return
    onSave(buildPatch())
    setSaved(true)
  }

  useEffect(() => {
    if (dirty) setSaved(false)
  }, [dirty])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    save()
  }

  return (
    <Card className="p-5">
      <h2 className="font-display text-lg font-semibold text-ink">Your details</h2>
      <p className="mt-1 text-sm text-ink-500">
        Keep this information current — the agency uses it for screening and your lease.
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
            <NotProvided value={application.phone} />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-ink">ID / passport</span>
            <Input
              className="mt-1"
              value={idNumber}
              onChange={(e) => setIdNumber(e.target.value)}
              placeholder="SA ID or passport number"
            />
            <NotProvided value={application.idNumberOrPassport} />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-ink">Employer (optional)</span>
            <Input
              className="mt-1"
              value={employerName}
              onChange={(e) => setEmployerName(e.target.value)}
              placeholder="Company or organisation"
            />
            <NotProvided value={application.employerName} />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-ink">Job title</span>
            <JobTitleSelect
              className="mt-1"
              value={jobTitle}
              onChange={setJobTitle}
              agencyId={application.agencyId}
            />
            <NotProvided value={application.jobTitle} />
          </label>
          <label className="block text-sm sm:col-span-2">
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
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" className="min-h-11 cursor-pointer" disabled={!dirty}>
            Save details
          </Button>
          {dirty ? (
            <span className="text-sm text-ink-500">You have unsaved changes</span>
          ) : saved ? (
            <span className="text-sm font-medium text-emerald-700">Saved</span>
          ) : null}
        </div>
      </form>
    </Card>
  )
}
