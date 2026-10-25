import { useMemo, useState } from 'react'
import {
  MessageSquare,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../../context/AppStore'
import { useAuth } from '../../context/AuthContext'
import { buildArrearsMessageThreadInput, MESSAGING_MODE_A_SHORT } from '../../lib/messaging/modeA'
import { formatZAR } from '../../data/seed'
import { PageHeader, Card, Button, Input, EmptyState } from '../../components/ui'
import { DashboardPage } from '../../components/dashboard'
import { FieldHelp } from '../../components/onboarding/FieldHelp'
import { TRUST_MODE_A_COPY } from '../../lib/trust/modeA'
import { buildTenancyArrears, todayYmd } from '../../lib/trust/tenancyArrears'
import { occupancyLabel } from '../../lib/propertyRefs'

function formatCents(cents: number): string {
  return formatZAR(cents / 100)
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-ZA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export default function TrustArrears() {
  const { state, createThread } = useStore()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [searchQuery, setSearchQuery] = useState('')
  const [msgBusyId, setMsgBusyId] = useState<string | null>(null)
  const [msgNote, setMsgNote] = useState<string | null>(null)

  const agencyId = user?.agencyId

  const arrears = useMemo(() => {
    let result = buildTenancyArrears({
      tenancies: state.tenancies,
      payments: state.payments,
      asOf: todayYmd(),
      agencyId,
    })

    // Only show occupancies with arrears
    result = result.filter((a) => a.d30 + a.d60 + a.d90 + a.d90plus > 0)

    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      result = result.filter((a) => {
        const who = occupancyLabel(a.occupancyId, state.tenancies, state.properties)
        return [a.occupancyId, who.primary, who.secondary ?? ''].join(' ').toLowerCase().includes(query)
      })
    }

    return result.sort(
      (a, b) =>
        b.d90plus + b.d90 + b.d60 + b.d30 - (a.d90plus + a.d90 + a.d60 + a.d30)
    )
  }, [state.tenancies, state.payments, state.properties, agencyId, searchQuery])

  const totalArrears = useMemo(
    () => arrears.reduce((sum, a) => sum + a.d30 + a.d60 + a.d90 + a.d90plus, 0),
    [arrears]
  )

  const totalD30 = useMemo(() => arrears.reduce((sum, a) => sum + a.d30, 0), [arrears])
  const totalD60 = useMemo(() => arrears.reduce((sum, a) => sum + a.d60, 0), [arrears])
  const totalD90 = useMemo(() => arrears.reduce((sum, a) => sum + a.d90, 0), [arrears])
  const totalD90Plus = useMemo(() => arrears.reduce((sum, a) => sum + a.d90plus, 0), [arrears])

  return (
    <DashboardPage>
      <PageHeader
        title="Arrears"
        subtitle="Rent due from each tenancy schedule, less rent paid, as at today"
      />
      <div className="mb-2"><FieldHelp title="Trust arrears" body={TRUST_MODE_A_COPY} /></div>
      {msgNote ? (
        <div className="rounded-xl border border-primary-200 bg-primary-50 px-4 py-3 text-sm text-ink-700" role="status">
          {msgNote}
        </div>
      ) : null}

      {/* Summary */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-5">
        <Card className="p-4">
          <p className="text-sm text-ink-500">Total Arrears</p>
          <p className="text-xl font-semibold text-red-600">{formatCents(totalArrears)}</p>
          <p className="text-xs text-ink-400">{arrears.length} occupancies</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-ink-500">Current</p>
          <p className="text-xl font-semibold text-amber-600">{formatCents(totalD30)}</p>
          <p className="text-xs text-ink-400">1–30 days</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-ink-500">31–60 days</p>
          <p className="text-xl font-semibold text-orange-600">{formatCents(totalD60)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-ink-500">61–90 days</p>
          <p className="text-xl font-semibold text-red-600">{formatCents(totalD90)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-ink-500">90+ days</p>
          <p className="text-xl font-semibold text-red-700">{formatCents(totalD90Plus)}</p>
        </Card>
      </div>

      {/* Search */}
      <Card className="p-4">
        <Input
          placeholder="Search by occupancy ID..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </Card>

      {/* Arrears List */}
      {arrears.length === 0 ? (
        <Card className="p-6">
          <EmptyState
            title="No arrears found"
            description="All occupancies are up to date with payments."
          />
        </Card>
      ) : (
        <Card>
          <div className="divide-y divide-primary-100">
            {/* Table Header */}
            <div className="hidden grid-cols-8 gap-4 bg-primary-50/50 px-4 py-3 text-xs font-medium text-ink-500 md:grid">
              <div className="col-span-2">Occupancy</div>
              <div className="col-span-1 text-right">1–30 days</div>
              <div className="col-span-1 text-right">31–60 days</div>
              <div className="col-span-1 text-right">61–90 days</div>
              <div className="col-span-1 text-right">90+ days</div>
              <div className="col-span-1 text-right">Total</div>
              <div className="col-span-1">Action</div>
            </div>

            {/* Arrears Rows */}
            {arrears.map((snapshot, rowIndex) => {
              const total =
                snapshot.d30 + snapshot.d60 + snapshot.d90 + snapshot.d90plus
              const hasSevere = snapshot.d90 + snapshot.d90plus > 0

              return (
                <div
                  key={snapshot.id}
                  className={`grid grid-cols-2 gap-x-4 gap-y-2 px-4 py-3 transition-colors md:grid-cols-8 md:gap-4 ${
                    hasSevere ? 'bg-red-50/50 hover:bg-red-50' : 'hover:bg-primary-50/30'
                  }`}
                >
                  <div className="col-span-2">
                    <p className="font-medium text-ink">
                      {occupancyLabel(snapshot.occupancyId, state.tenancies, state.properties).primary}
                    </p>
                    <p className="text-xs text-ink-400">As of {formatDate(snapshot.asOf)}</p>
                  </div>
                  <div className="stack-cell text-sm md:col-span-1 md:text-right" data-label="1–30 days">
                    {snapshot.d30 > 0 ? (
                      <span className="text-amber-600">{formatCents(snapshot.d30)}</span>
                    ) : (
                      <span className="text-ink-400">—</span>
                    )}
                  </div>
                  <div className="stack-cell text-sm md:col-span-1 md:text-right" data-label="31–60 days">
                    {snapshot.d60 > 0 ? (
                      <span className="text-orange-600">{formatCents(snapshot.d60)}</span>
                    ) : (
                      <span className="text-ink-400">—</span>
                    )}
                  </div>
                  <div className="stack-cell text-sm md:col-span-1 md:text-right" data-label="61–90 days">
                    {snapshot.d90 > 0 ? (
                      <span className="text-red-600">{formatCents(snapshot.d90)}</span>
                    ) : (
                      <span className="text-ink-400">—</span>
                    )}
                  </div>
                  <div className="stack-cell text-sm md:col-span-1 md:text-right" data-label="90+ days">
                    {snapshot.d90plus > 0 ? (
                      <span className="text-red-700 font-semibold">{formatCents(snapshot.d90plus)}</span>
                    ) : (
                      <span className="text-ink-400">—</span>
                    )}
                  </div>
                  <div className="stack-cell text-sm font-semibold text-ink md:col-span-1 md:text-right" data-label="Total">
                    {formatCents(total)}
                  </div>
                  <div className="self-end md:col-span-1 md:self-auto">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={msgBusyId === snapshot.id}
                      data-tip-target={rowIndex === 0 ? 'trust-arrears-message' : undefined}
                      title={`Create in-app arrears thread (${MESSAGING_MODE_A_SHORT})`}
                      onClick={() => {
                        if (!user?.id) return
                        const tenancy = state.tenancies.find((t) => t.id === snapshot.occupancyId)
                        if (!tenancy?.tenantUserId) {
                          setMsgNote('No tenant on this occupancy — cannot start in-app thread.')
                          return
                        }
                        setMsgBusyId(snapshot.id)
                        try {
                          const total =
                            snapshot.d30 + snapshot.d60 + snapshot.d90 + snapshot.d90plus
                          const input = buildArrearsMessageThreadInput({
                            agencyId: snapshot.agencyId,
                            propertyId: tenancy.propertyId,
                            applicationId: tenancy.applicationId ?? null,
                            occupancyId: snapshot.occupancyId,
                            staffUserId: user.id,
                            tenantUserId: tenancy.tenantUserId,
                            landlordId: tenancy.landlordId ?? null,
                            totalCents: total,
                          })
                          const thread = createThread(input)
                          setMsgNote(
                            `Thread created (${thread.id}) — in-app message, not WhatsApp or SMS.`,
                          )
                          navigate('/workspace/operations/communications')
                        } finally {
                          setMsgBusyId(null)
                        }
                      }}
                    >
                      <MessageSquare className="h-4 w-4" />
                      Message
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {/* Arrears Sequence Info */}
      <Card className="p-5">
        <h3 className="mb-3 text-lg font-semibold text-ink">Arrears Reminder Sequence</h3>
        <div className="space-y-2 text-sm text-ink-600">
          <p>• <strong>Day +3:</strong> First reminder (in-app message)</p>
          <p>• <strong>Day +7:</strong> Second reminder</p>
          <p>• <strong>Day +14:</strong> Final reminder before escalation</p>
          <p>• <strong>Letter of Demand:</strong> PDF "account statement + overdue notice" (not a legal demand)</p>
        </div>
      </Card>
    </DashboardPage>
  )
}
