import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useStore } from '../../context/AppStore'
import { RequirePermission } from '../../components/RequirePermission'
import { AgencyCapabilityChecklist } from '../../components/admin/AgencyCapabilityChecklist'
import { StepDots } from '../../components/admin/CreatePropertyModal'
import { Button, Card, Input, PageHeader } from '../../components/ui'
import { DEFAULT_AGENCY_PERMISSIONS } from '../../lib/permissions'
import { readReturnTo } from '../../lib/returnTo'
import type { Permission } from '../../types/domain'

export default function AdminAgencyCreatePage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const returnTo = readReturnTo(searchParams) ?? '/workspace/admin/agencies'
  const { createAgency } = useStore()

  const [step, setStep] = useState(1)
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [city, setCity] = useState('')
  const [perms, setPerms] = useState<Permission[]>([...DEFAULT_AGENCY_PERMISSIONS])
  const [error, setError] = useState('')

  useEffect(() => {
    if (!name.trim()) return
    if (slug) return
    setSlug(name.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''))
  }, [name, slug])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (step === 1) {
      if (!name.trim()) {
        setError('Agency name is required.')
        return
      }
      setError('')
      setStep(2)
      return
    }

    const created = createAgency({
      name: name.trim(),
      slug: slug.trim() || name.trim().toLowerCase().replace(/\s+/g, '-'),
      city: city.trim() || 'Port Elizabeth',
      enabledPermissions: perms,
    })
    navigate(`/workspace/admin/agencies/${created.id}`)
  }

  return (
    <RequirePermission permission="platform.manage">
      <div className="animate-fade-in space-y-5">
        <PageHeader
          title="Add agency"
          subtitle={
            step === 1
              ? 'Step 1 — Name the brokerage / agency.'
              : 'Step 2 — Choose which modules staff in this agency may use.'
          }
          actions={
            <Link to={returnTo}>
              <Button type="button" variant="secondary" className="min-h-11 cursor-pointer">
                Cancel
              </Button>
            </Link>
          }
        />

        <Card className="mx-auto max-w-3xl p-5 sm:p-6">
          <form className="space-y-4" onSubmit={submit}>
            <StepDots step={step} total={2} labels={['Profile', 'Modules']} />
            {error ? <p className="text-sm text-accent-600">{error}</p> : null}

            {step === 1 ? (
              <section className="space-y-3">
                <h2 className="text-sm font-semibold text-ink">Agency profile</h2>
                <Input
                  className="min-h-11"
                  placeholder="Agency name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
                <Input
                  className="min-h-11"
                  placeholder="Slug (url-friendly)"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                />
                <Input
                  className="min-h-11"
                  placeholder="City"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                />
              </section>
            ) : (
              <section className="space-y-3">
                <h2 className="text-sm font-semibold text-ink">Enabled modules</h2>
                <p className="text-xs text-ink-500">
                  Users in this agency can only receive permissions that are enabled here.
                </p>
                <AgencyCapabilityChecklist value={perms} onChange={setPerms} />
              </section>
            )}

            <div className="flex flex-wrap justify-end gap-2 border-t border-primary-50 pt-4">
              <Button
                type="button"
                variant="secondary"
                className="min-h-11 cursor-pointer"
                onClick={() => {
                  if (step === 1) navigate(returnTo)
                  else setStep(1)
                }}
              >
                {step === 1 ? 'Cancel' : 'Back'}
              </Button>
              <Button type="submit" className="min-h-11 cursor-pointer">
                {step === 1 ? 'Continue' : 'Create agency'}
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </RequirePermission>
  )
}
