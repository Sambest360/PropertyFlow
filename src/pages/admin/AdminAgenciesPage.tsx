import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Building2, Pencil, Plus } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { useStore } from '../../context/AppStore'
import { RequirePermission } from '../../components/RequirePermission'
import { AgencyCapabilityChecklist } from '../../components/admin/AgencyCapabilityChecklist'
import { StepDots } from '../../components/wizard/StepDots'
import { Badge, Button, Card, Input, Modal, PageHeader, Select } from '../../components/ui'
import { DEFAULT_AGENCY_PERMISSIONS } from '../../lib/permissions'
import type { Agency, Permission } from '../../types/domain'

const ICON_STROKE = 1.6

export default function AdminAgenciesPage() {
  const { state, updateAgency, resetDemo } = useStore()
  const navigate = useNavigate()
  const [editId, setEditId] = useState<string | null>(null)

  const rows = useMemo(
    () =>
      state.agencies.map((a) => ({
        agency: a,
        assets: state.properties.filter((p) => p.agencyId === a.id).length,
        users: state.users.filter((u) => u.agencyId === a.id).length,
        caps: a.enabledPermissions?.length ?? 0,
      })),
    [state.agencies, state.properties, state.users],
  )

  const editing = editId ? state.agencies.find((a) => a.id === editId) : null

  return (
    <RequirePermission permission="platform.manage">
      <div className="animate-fade-in space-y-5">
        <PageHeader
          title="Agencies"
          subtitle="Super Admin home for brokerages. Create an agency, then open it to add users and properties."
          actions={
            <>
              <Link to="/workspace/platform/billing">
                <Button variant="secondary" className="min-h-11 cursor-pointer">
                  SaaS billing
                </Button>
              </Link>
              <Button variant="secondary" className="min-h-11 cursor-pointer" onClick={resetDemo}>
                Reload from database
              </Button>
              <Link to="/workspace/admin/agencies/new">
                <Button className="min-h-11 cursor-pointer">
                  <Plus className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
                  Add agency
                </Button>
              </Link>
            </>
          }
        />

        <div className="grid gap-3 sm:grid-cols-3">
          <Card className="p-4">
            <p className="text-xs text-ink-500">Agencies</p>
            <p className="tabular text-2xl font-semibold">{state.agencies.length}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-ink-500">Active</p>
            <p className="tabular text-2xl font-semibold">
              {state.agencies.filter((a) => a.status === 'Active').length}
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-ink-500">Suspended</p>
            <p className="tabular text-2xl font-semibold">
              {state.agencies.filter((a) => a.status === 'Suspended').length}
            </p>
          </Card>
        </div>

        {rows.length === 0 ? (
          <Card className="p-10 text-center">
            <Building2 className="mx-auto h-8 w-8 text-ink-400" strokeWidth={ICON_STROKE} />
            <p className="mt-3 font-semibold text-ink">No agencies yet</p>
            <p className="mt-1 text-sm text-ink-500">
              Create your first brokerage to start adding principals, agents, and properties.
            </p>
            <Link to="/workspace/admin/agencies/new" className="mt-4 inline-block">
              <Button className="min-h-11 cursor-pointer">
                <Plus className="h-4 w-4" strokeWidth={ICON_STROKE} />
                Add agency
              </Button>
            </Link>
          </Card>
        ) : (
          <div className="overflow-hidden rounded-[1.25rem] border border-primary-100/80 bg-white shadow-[0_8px_24px_-16px_rgba(15,39,68,0.18)]">
            <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-primary-100 text-[11px] font-semibold uppercase tracking-wide text-ink-400">
                  <th className="px-4 py-3">Agency</th>
                  <th className="px-3 py-3">City</th>
                  <th className="px-3 py-3 text-right">Assets</th>
                  <th className="px-3 py-3 text-right">Users</th>
                  <th className="px-3 py-3 text-right">Modules</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ agency: a, assets, users, caps }) => (
                  <tr
                    key={a.id}
                    className="cursor-pointer border-b border-primary-50 hover:bg-primary-50/40"
                    onClick={() => navigate(`/workspace/admin/agencies/${a.id}`)}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-ink-400" strokeWidth={ICON_STROKE} />
                        <div>
                          <p className="font-semibold text-ink">{a.name}</p>
                          <p className="text-xs text-ink-500">{a.slug}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-ink-600">{a.city}</td>
                    <td className="px-3 py-3 text-right tabular">{assets}</td>
                    <td className="px-3 py-3 text-right tabular">{users}</td>
                    <td className="px-3 py-3 text-right tabular">{caps}</td>
                    <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-2">
                        <Badge tone={a.status === 'Active' ? 'success' : 'danger'}>{a.status}</Badge>
                        <Select
                          className="max-w-[8rem] text-xs"
                          value={a.status}
                          onChange={(e) =>
                            updateAgency(a.id, { status: e.target.value as Agency['status'] })
                          }
                          aria-label={`Status for ${a.name}`}
                        >
                          <option value="Active">Active</option>
                          <option value="Suspended">Suspended</option>
                        </Select>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          className="min-h-11 cursor-pointer"
                          onClick={() => navigate(`/workspace/admin/agencies/${a.id}`)}
                        >
                          Open
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          className="min-h-11 cursor-pointer"
                          onClick={() => setEditId(a.id)}
                        >
                          <Pencil className="h-4 w-4" strokeWidth={ICON_STROKE} />
                          Edit
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <AgencyFormModal
          open={Boolean(editing)}
          onClose={() => setEditId(null)}
          title="Edit agency"
          initial={editing ?? undefined}
          onSubmit={(input) => {
            if (!editId) return
            updateAgency(editId, input)
            setEditId(null)
          }}
        />
      </div>
    </RequirePermission>
  )
}

function AgencyFormModal({
  open,
  onClose,
  title,
  initial,
  onSubmit,
}: {
  open: boolean
  onClose: () => void
  title: string
  initial?: Agency
  onSubmit: (input: {
    name: string
    slug: string
    city: string
    enabledPermissions: Permission[]
  }) => void
}) {
  const [step, setStep] = useState(1)
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [city, setCity] = useState('')
  const [perms, setPerms] = useState<Permission[]>([...DEFAULT_AGENCY_PERMISSIONS])
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setStep(1)
    setName(initial?.name ?? '')
    setSlug(initial?.slug ?? '')
    setCity(initial?.city ?? '')
    setPerms(
      initial?.enabledPermissions?.length
        ? [...initial.enabledPermissions]
        : [...DEFAULT_AGENCY_PERMISSIONS],
    )
    setError('')
  }, [open, initial])

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
    onSubmit({
      name: name.trim(),
      slug: slug.trim() || name.trim().toLowerCase().replace(/\s+/g, '-'),
      city: city.trim() || 'Port Elizabeth',
      enabledPermissions: perms,
    })
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={
        step === 1
          ? 'Step 1 of 2 — Agency profile.'
          : 'Step 2 of 2 — Modules this agency’s staff may use.'
      }
      size="lg"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={step === 1 ? onClose : () => setStep(1)}>
            {step === 1 ? 'Cancel' : 'Back'}
          </Button>
          <Button type="submit" form="agency-edit-form">
            {step === 1 ? 'Continue' : 'Save agency'}
          </Button>
        </>
      }
    >
      <form id="agency-edit-form" onSubmit={submit} className="space-y-3">
        <StepDots step={step} total={2} labels={['Profile', 'Modules']} />
        {error ? <p className="text-sm text-accent-600">{error}</p> : null}
        {step === 1 ? (
          <>
            <Input
              className="min-h-11"
              placeholder="Agency name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Input
              className="min-h-11"
              placeholder="Slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
            />
            <Input
              className="min-h-11"
              placeholder="City"
              value={city}
              onChange={(e) => setCity(e.target.value)}
            />
          </>
        ) : (
          <AgencyCapabilityChecklist value={perms} onChange={setPerms} />
        )}
      </form>
    </Modal>
  )
}
