import { useEffect, useState, type FormEvent } from 'react'import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useStore } from '../../context/AppStore'
import { RequirePermission } from '../../components/RequirePermission'
import { AgencyCapabilityChecklist } from '../../components/admin/AgencyCapabilityChecklist'
import {
  CreateWizardShell,
  type WizardStepMeta,
} from '../../components/admin/CreateWizardShell'
import { WizardSectionCard } from '../../components/wizard/WizardSectionCard'
import { WizardFooter } from '../../components/wizard/WizardFooter'
import { LiveAgencyPreview } from '../../components/wizard/LiveAgencyPreview'
import { Button, Input, Select } from '../../components/ui'
import { DEFAULT_AGENCY_PERMISSIONS } from '../../lib/permissions'
import { readReturnTo } from '../../lib/returnTo'
import { useWizardDraft, useWizardSteps } from '../../hooks/useWizardSteps'
import type { Permission } from '../../types/domain'

const DRAFT_KEY = 'propertyflow:agency-create'

const STEPS: WizardStepMeta[] = [
  { id: 'identity', label: 'Identity', tip: 'Legal name, trading name, and URL slug for this agency.' },
  { id: 'contact', label: 'Contact', tip: 'Primary email and phone for agency communications.' },
  { id: 'location', label: 'Location', tip: 'City, province, country, and timezone defaults.' },
  { id: 'modules', label: 'Modules', tip: 'Choose which modules staff in this agency may use.' },
  { id: 'review', label: 'Review', tip: 'Confirm details before creating the agency.' },
]

type AgencyDraft = {
  name: string
  tradingAs: string
  slug: string
  email: string
  phone: string
  city: string
  province: string
  countryCode: string
  timezone: string
  perms: Permission[]
}

export default function AdminAgencyCreatePage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const returnTo = readReturnTo(searchParams) ?? '/workspace/admin/agencies'
  const { createAgency } = useStore()

  const initialDraft: AgencyDraft = {
    name: '',
    tradingAs: '',
    slug: '',
    email: '',
    phone: '',
    city: '',
    province: 'Eastern Cape',
    countryCode: 'ZA',
    timezone: 'Africa/Johannesburg',
    perms: [...DEFAULT_AGENCY_PERMISSIONS],
  }

  const { draft, setDraft, clearDraft } = useWizardDraft<AgencyDraft>(DRAFT_KEY, initialDraft)
  const { stepIndex, maxReachableIndex, goNext, goBack, goTo, markReachable, isFirst, isLast } =
    useWizardSteps({ totalSteps: STEPS.length, storageKey: DRAFT_KEY })

  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!draft.name.trim() || draft.slug) return
    setDraft((d) => ({
      ...d,
      slug: d.name.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
    }))
  }, [draft.name, draft.slug, setDraft])

  function validateStep(index: number): string | null {
    if (index === 0 && !draft.name.trim()) return 'Agency name is required.'
    if (index === 2 && !draft.city.trim()) return 'City is required.'
    return null
  }

  function handleContinue() {
    const err = validateStep(stepIndex)
    if (err) {
      setError(err)
      return
    }
    setError('')
    markReachable(stepIndex + 1)
    goNext()
  }

  function handleCreate() {
    const err = validateStep(0) ?? validateStep(2)
    if (err) {
      setError(err)
      return
    }
    setBusy(true)
    const created = createAgency({
      name: draft.name.trim(),
      tradingAs: draft.tradingAs.trim() || undefined,
      slug: draft.slug.trim() || draft.name.trim().toLowerCase().replace(/\s+/g, '-'),
      city: draft.city.trim() || 'Port Elizabeth',
      province: draft.province.trim() || undefined,
      countryCode: draft.countryCode || 'ZA',
      timezone: draft.timezone || 'Africa/Johannesburg',
      email: draft.email.trim() || undefined,
      phone: draft.phone.trim() || undefined,
      enabledPermissions: draft.perms,
    })
    clearDraft()
    setBusy(false)
    navigate(`/workspace/admin/agencies/${created.id}`)
  }

  function renderStep() {
    switch (stepIndex) {
      case 0:
        return (
          <WizardSectionCard title="Agency identity">
            <Input
              className="min-h-11"
              placeholder="Company / agency name"
              value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              required
            />
            <Input
              className="min-h-11"
              placeholder="Trading as (optional)"
              value={draft.tradingAs}
              onChange={(e) => setDraft((d) => ({ ...d, tradingAs: e.target.value }))}
            />
            <Input
              className="min-h-11"
              placeholder="Slug (url-friendly)"
              value={draft.slug}
              onChange={(e) => setDraft((d) => ({ ...d, slug: e.target.value }))}
            />
          </WizardSectionCard>
        )
      case 1:
        return (
          <WizardSectionCard title="Contact details">
            <Input
              className="min-h-11"
              type="email"
              placeholder="Primary email"
              value={draft.email}
              onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))}
            />
            <Input
              className="min-h-11"
              type="tel"
              placeholder="Phone"
              value={draft.phone}
              onChange={(e) => setDraft((d) => ({ ...d, phone: e.target.value }))}
            />
          </WizardSectionCard>
        )
      case 2:
        return (
          <WizardSectionCard title="Location">
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                className="min-h-11"
                placeholder="City"
                value={draft.city}
                onChange={(e) => setDraft((d) => ({ ...d, city: e.target.value }))}
              />
              <Input
                className="min-h-11"
                placeholder="Province"
                value={draft.province}
                onChange={(e) => setDraft((d) => ({ ...d, province: e.target.value }))}
              />
              <Input
                className="min-h-11"
                placeholder="Country code"
                value={draft.countryCode}
                onChange={(e) => setDraft((d) => ({ ...d, countryCode: e.target.value.toUpperCase() }))}
              />
              <Select
                className="min-h-11"
                value={draft.timezone}
                onChange={(e) => setDraft((d) => ({ ...d, timezone: e.target.value }))}
              >
                <option value="Africa/Johannesburg">Africa/Johannesburg</option>
                <option value="Africa/Cape_Town">Africa/Cape_Town</option>
              </Select>
            </div>
          </WizardSectionCard>
        )
      case 3:
        return (
          <WizardSectionCard
            title="Enabled modules"
            description="Users in this agency can only receive permissions that are enabled here."
          >
            <AgencyCapabilityChecklist
              value={draft.perms}
              onChange={(perms) => setDraft((d) => ({ ...d, perms }))}
            />
          </WizardSectionCard>
        )
      case 4:
        return (
          <WizardSectionCard title="Review">
            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-ink-400">Name</dt>
                <dd className="font-medium text-ink">{draft.name || '—'}</dd>
              </div>
              <div>
                <dt className="text-ink-400">Slug</dt>
                <dd className="font-medium text-ink">{draft.slug || '—'}</dd>
              </div>
              <div>
                <dt className="text-ink-400">Location</dt>
                <dd className="font-medium text-ink">
                  {[draft.city, draft.province].filter(Boolean).join(', ') || '—'}
                </dd>
              </div>
              <div>
                <dt className="text-ink-400">Modules</dt>
                <dd className="font-medium text-ink">{draft.perms.length} enabled</dd>
              </div>
            </dl>
          </WizardSectionCard>
        )
      default:
        return null
    }
  }

  return (
    <RequirePermission permission="platform.manage">
      <div className="animate-fade-in space-y-4">
        <div className="flex justify-end">
          <Link to={returnTo}>
            <Button type="button" variant="secondary" className="min-h-11 cursor-pointer">
              Cancel
            </Button>
          </Link>
        </div>

        <CreateWizardShell
          title="Add agency"
          subtitle="Create a brokerage with contact details, location, and module access."
          steps={STEPS}
          stepIndex={stepIndex}
          maxReachableIndex={maxReachableIndex}
          onStepSelect={goTo}
          preview={
            <LiveAgencyPreview
              name={draft.tradingAs || draft.name}
              slug={draft.slug}
              city={draft.city}
              province={draft.province}
              email={draft.email}
              phone={draft.phone}
              moduleCount={draft.perms.length}
            />
          }
          footer={
            <WizardFooter
              showBack={!isFirst}
              onBack={goBack}
              showContinue={!isLast}
              onContinue={handleContinue}
              showSubmit={isLast}
              submitLabel="Create agency"
              onSubmit={handleCreate}
              busy={busy}
            />
          }
        >
          {error ? <p className="mb-4 text-sm text-accent-600">{error}</p> : null}
          {renderStep()}
        </CreateWizardShell>
      </div>
    </RequirePermission>
  )
}
