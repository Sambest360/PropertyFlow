import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Building2, Pencil, Plus, Trash2 } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { useStore } from '../../context/AppStore'
import { RequirePermission } from '../../components/RequirePermission'
import { AgencyCapabilityChecklist } from '../../components/admin/AgencyCapabilityChecklist'
import { StepDots } from '../../components/wizard/StepDots'
import { Badge, Button, Card, Input, Modal, PageHeader, Select } from '../../components/ui'
import { ResponsiveDataList } from '../../components/data/ResponsiveDataList'
import { useSuiteAlert } from '../../components/alerts/SuiteAlert'
import { sweetWarning } from '../../lib/sweetAlert'
import { agencyIsSelectable, agencyStatusBadgeTone } from '../../lib/agencyStatus'
import { DEFAULT_AGENCY_PERMISSIONS } from '../../lib/permissions'
import type { Agency, Permission } from '../../types/domain'

const ICON_STROKE = 1.6

export default function AdminAgenciesPage() {
  const { state, updateAgency, cancelAgency, resetDemo } = useStore()
  const navigate = useNavigate()
  const alert = useSuiteAlert()
  const [editId, setEditId] = useState<string | null>(null)
  const [showCancelled, setShowCancelled] = useState(false)

  const cancelledCount = useMemo(
    () => state.agencies.filter((a) => a.status === 'Cancelled').length,
    [state.agencies],
  )

  const visibleAgencies = useMemo(
    () =>
      showCancelled ? state.agencies : state.agencies.filter((a) => agencyIsSelectable(a.status)),
    [state.agencies, showCancelled],
  )

  const rows = useMemo(
    () =>
      visibleAgencies.map((a) => ({
        agency: a,
        assets: state.properties.filter((p) => p.agencyId === a.id).length,
        users: state.users.filter((u) => u.agencyId === a.id).length,
        caps: a.enabledPermissions?.length ?? 0,
      })),
    [visibleAgencies, state.properties, state.users],
  )

  const handleCancelAgency = async (a: Agency) => {
    const ok = await alert.confirmDelete({
      title: `Delete ${a.name}?`,
      text:
        'The agency will be cancelled. Listings and records stay in the database for audit, but staff will lose workspace access. This cannot be undone from the agency portal.',
      confirmLabel: 'Delete agency',
    })
    if (!ok) return
    const result = await cancelAgency(a.id)
    if (result.ok === false) {
      await sweetWarning('Could not delete agency', result.reason)
      return
    }
    void alert.deleted({
      title: 'Agency cancelled',
      text: `${a.name} was cancelled.`,
    })
  }

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

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
          <Card className="p-4">
            <p className="text-xs text-ink-500">Cancelled</p>
            <p className="tabular text-2xl font-semibold">{cancelledCount}</p>
          </Card>
        </div>

        {cancelledCount > 0 ? (
          <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-600">
            <input
              type="checkbox"
              className="h-4 w-4 cursor-pointer"
              checked={showCancelled}
              onChange={(e) => setShowCancelled(e.target.checked)}
            />
            Show cancelled agencies ({cancelledCount})
          </label>
        ) : null}

        {rows.length === 0 ? (
          <Card className="p-10 text-center">
            <Building2 className="mx-auto h-8 w-8 text-ink-400" strokeWidth={ICON_STROKE} />
            <p className="mt-3 font-semibold text-ink">No agencies yet</p>
            <p className="mt-1 text-sm text-ink-500">
              Create your first brokerage to start adding team members and properties.
            </p>
            <Link to="/workspace/admin/agencies/new" className="mt-4 inline-block">
              <Button className="min-h-11 cursor-pointer">
                <Plus className="h-4 w-4" strokeWidth={ICON_STROKE} />
                Add agency
              </Button>
            </Link>
          </Card>
        ) : (
          <ResponsiveDataList
            rows={rows}
            rowKey={({ agency: a }) => a.id}
            columns={[
              {
                key: 'agency',
                header: 'Agency',
                render: ({ agency: a }) => (
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-ink-400" strokeWidth={ICON_STROKE} />
                    <div>
                      <p className="font-semibold text-ink">{a.name}</p>
                      <p className="text-xs text-ink-500">{a.slug}</p>
                    </div>
                  </div>
                ),
              },
              {
                key: 'city',
                header: 'City',
                cellClassName: 'text-ink-600',
                render: ({ agency: a }) => a.city,
              },
              {
                key: 'assets',
                header: 'Assets',
                headerClassName: 'text-right',
                cellClassName: 'text-right tabular',
                render: ({ assets }) => assets,
              },
              {
                key: 'users',
                header: 'Users',
                headerClassName: 'text-right',
                cellClassName: 'text-right tabular',
                render: ({ users }) => users,
              },
              {
                key: 'modules',
                header: 'Modules',
                headerClassName: 'text-right',
                cellClassName: 'text-right tabular',
                render: ({ caps }) => caps,
              },
              {
                key: 'status',
                header: 'Status',
                render: ({ agency: a }) => (
                  <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                    <Badge tone={agencyStatusBadgeTone(a.status)}>{a.status}</Badge>
                    {a.status !== 'Cancelled' ? (
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
                    ) : null}
                  </div>
                ),
              },
              {
                key: 'actions',
                header: 'Actions',
                headerClassName: 'text-right',
                cellClassName: 'text-right',
                render: ({ agency: a }) => (
                  <div className="flex flex-wrap justify-end gap-2" onClick={(e) => e.stopPropagation()}>
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
                    {a.status !== 'Cancelled' ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="min-h-11 cursor-pointer text-accent-600"
                        onClick={() => void handleCancelAgency(a)}
                        aria-label={`Delete ${a.name}`}
                      >
                        <Trash2 className="h-4 w-4" strokeWidth={ICON_STROKE} />
                      </Button>
                    ) : null}
                  </div>
                ),
              },
            ]}
            renderMobileCard={({ agency: a, assets, users, caps }) => (
              <Card
                className="cursor-pointer p-4"
                onClick={() => navigate(`/workspace/admin/agencies/${a.id}`)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-ink">{a.name}</p>
                    <p className="text-xs text-ink-500">{a.slug} · {a.city}</p>
                  </div>
                  <Badge tone={agencyStatusBadgeTone(a.status)}>{a.status}</Badge>
                </div>
                <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <dt className="text-ink-400">Assets</dt>
                    <dd className="tabular font-semibold text-ink">{assets}</dd>
                  </div>
                  <div>
                    <dt className="text-ink-400">Users</dt>
                    <dd className="tabular font-semibold text-ink">{users}</dd>
                  </div>
                  <div>
                    <dt className="text-ink-400">Modules</dt>
                    <dd className="tabular font-semibold text-ink">{caps}</dd>
                  </div>
                </dl>
                <div className="mt-3 flex gap-2" onClick={(e) => e.stopPropagation()}>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="min-h-11 flex-1 cursor-pointer"
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
                    Edit
                  </Button>
                </div>
              </Card>
            )}
          />
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
