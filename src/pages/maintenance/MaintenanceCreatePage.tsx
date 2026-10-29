import { useMemo, useRef, useState } from 'react'
import { acquireSubmitLock, releaseSubmitLock } from '../../lib/wizardSubmitGuard'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { useStore } from '../../context/AppStore'
import { useAuth, usePropertyScope } from '../../context/AuthContext'
import { RequirePermission } from '../../components/RequirePermission'
import { ActionButtonRow } from '../../components/ActionButtonRow'
import { BackButton } from '../../components/BackButton'
import { MaintenanceTicketForm, type CreateTicketInput } from '../../components/maintenance/MaintenanceTicketForm'
import { Button, Card } from '../../components/ui'
import { getLookups } from '../../lib/lookups'
import { readReturnTo, withReturnTo } from '../../lib/returnTo'
import { createMaintenanceFromInput } from '../../lib/maintenanceTicketFlow'
import { useSuiteAlert } from '../../components/alerts/SuiteAlert'

const FORM_ID = 'maintenance-create-form'
const ICON_STROKE = 1.6

export default function MaintenanceCreatePage() {
  const { state, createMaintenanceTicket, updateMaintenanceTicketDetails, assignContractorToTicket } =
    useStore()
  const { user, has, agencyId } = useAuth()
  const { allowedPropertyIds, canMutate } = usePropertyScope()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const alert = useSuiteAlert()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const submitLockRef = useRef(false)

  const returnTo = readReturnTo(searchParams) ?? '/workspace/operations/maintenance'
  const initialPropertyId = searchParams.get('property') ?? undefined
  const lockProperty = Boolean(initialPropertyId)

  const properties = useMemo(
    () => state.properties.filter((p) => allowedPropertyIds.has(p.id) && !p.deletedAt),
    [state.properties, allowedPropertyIds],
  )

  const categories = useMemo(
    () => getLookups(state.lookups, agencyId, 'TICKET_CATEGORY'),
    [state.lookups, agencyId],
  )

  // Contractors are assigned jobs; they never log maintenance themselves.
  if (!has('maintenance.manage') || (user.role as string) === 'contractor') {
    return <Navigate to={returnTo} replace />
  }

  const handleSubmit = async (input: CreateTicketInput) => {
    if (!acquireSubmitLock(submitLockRef)) return
    setBusy(true)
    try {
    const result = await createMaintenanceFromInput(input, {
      properties,
      internalAssets: state.internalAssets,
      canMutate,
      createMaintenanceTicket,
      updateMaintenanceTicketDetails,
      assignContractorToTicket,
      actorUserId: user.id,
      actorRole: user.role,
    })
    if (result.ok === false) {
      setError(result.error)
      return
    }

    void alert.success({
      title: 'Maintenance logged',
      text: `"${input.title}" was created${input.contractorId ? ' and the contractor was notified.' : '.'}`,
    })
    navigate(
      returnTo.includes('/operations/maintenance') && !returnTo.includes('/new')
        ? `/workspace/operations/maintenance/${encodeURIComponent(result.ticketId)}`
        : returnTo,
    )
    } finally {
      setBusy(false)
      releaseSubmitLock(submitLockRef)
    }
  }

  return (
    <RequirePermission permission="maintenance.manage">
      <div className="animate-fade-in">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-tight text-ink sm:text-[1.75rem]">
              Log maintenance
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-ink-500">
              Capture the fault in detail — photos, location, linked assets, and book an approved contractor.
            </p>
          </div>
          <ActionButtonRow className="sm:w-auto">
            <BackButton to={returnTo} label="Back" />
          </ActionButtonRow>
        </div>

        <Card className="overflow-hidden p-0">
          <div className="border-b border-primary-100 bg-primary-50/40 px-5 py-4">
            <h2 className="font-display text-base font-semibold text-ink">Issue details</h2>
            <p className="mt-0.5 text-sm text-ink-500">
              All fields save to the maintenance record and appear on the contractor job card.
            </p>
          </div>
          <div className="p-5 sm:p-6">
            <MaintenanceTicketForm
              mode="create"
              formId={FORM_ID}
              properties={properties}
              assets={state.internalAssets}
              categories={categories}
              agencyId={agencyId}
              initialPropertyId={initialPropertyId}
              initialContractorId={searchParams.get('contractor') ?? undefined}
              lockProperty={lockProperty}
              onSubmitCreate={handleSubmit}
              error={error}
              tenancies={
                user.role === 'tenant' || user.role === 'landlord' || user.role === 'contractor'
                  ? undefined
                  : state.tenancies
              }
            />
          </div>
          <ActionButtonRow className="border-t border-primary-100 bg-primary-50/30 px-5 py-4">
            <Button className="min-h-11 cursor-pointer" form={FORM_ID} type="submit" disabled={busy}>
              <Plus className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
              {busy ? 'Creating…' : 'Create maintenance'}
            </Button>
            <Link to={returnTo}>
              <Button variant="secondary" className="min-h-11 cursor-pointer" disabled={busy}>
                Cancel
              </Button>
            </Link>
          </ActionButtonRow>
        </Card>
      </div>
    </RequirePermission>
  )
}

export function maintenanceCreateHref(opts?: {
  propertyId?: string
  returnTo?: string
}): string {
  let path = '/workspace/operations/maintenance/new'
  if (opts?.propertyId) {
    path += `?property=${encodeURIComponent(opts.propertyId)}`
  }
  if (opts?.returnTo) {
    path = withReturnTo(path, opts.returnTo)
  }
  return path
}
