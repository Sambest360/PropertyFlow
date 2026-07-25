import { useMemo } from 'react'
import { HardHat, Star, Wrench } from 'lucide-react'
import { useStore } from '../context/AppStore'
import { useAuth } from '../context/AuthContext'
import { RequirePermission } from '../components/RequirePermission'
import {
  AttentionHero,
  DashboardBreadcrumb,
  DashboardPage,
  SectionBanner,
} from '../components/dashboard'
import { Badge, Button, Card, Select, StatCard, statusTone } from '../components/ui'
import { formatZAR } from '../data/seed'

export default function ContractorPortal() {
  const { state, updateTicket } = useStore()
  const { user } = useAuth()

  const jobs = useMemo(
    () =>
      state.tickets.filter(
        (t) =>
          t.contractorId === user.id ||
          (user.role === 'contractor' && t.contractorId === null && t.status !== 'Completed'),
      ),
    [state.tickets, user],
  )
  const mine = state.tickets.filter((t) => t.contractorId === user.id)
  const completed = mine.filter((t) => t.status === 'Completed')
  const earnings = completed.reduce((n, t) => n + t.cost, 0)
  const openAssigned = mine.filter((t) => t.status !== 'Completed')
  const focus = openAssigned[0] ?? jobs.find((t) => !t.contractorId)
  const focusProp = focus
    ? state.properties.find((p) => p.id === focus.propertyId)
    : state.properties[0]

  return (
    <RequirePermission permission="portal.contractor">
      <DashboardPage>
        <DashboardBreadcrumb
          items={[
            { label: 'Dashboard', to: '/workspace' },
            { label: 'Contractor portal' },
          ]}
        />

        <AttentionHero
          image={focusProp?.images[0]}
          eyebrow="Contractor portal"
          title={focus?.title ?? `Welcome, ${user.name.split(' ')[0]}`}
          detail={
            focus
              ? `${focus.assetLabel} · ${focus.priority}`
              : 'Manage work orders, update status, and track completion.'
          }
          badge={focus?.priority ?? 'Idle'}
          badgeTone={focus ? 'warning' : 'neutral'}
          secondaryBadge={focus?.status}
          stats={[
            { label: 'Assigned', value: String(mine.length) },
            { label: 'Earnings', value: formatZAR(earnings) },
            { label: 'Completed', value: String(completed.length) },
          ]}
          cta={{
            label: 'Workspace home',
            to: '/workspace',
            icon: <HardHat className="h-4 w-4" strokeWidth={1.6} aria-hidden />,
          }}
          propertyLink={
            focusProp
              ? { to: `/workspace/properties/${focusProp.id}`, label: 'Site' }
              : { to: '/workspace', label: 'Dashboard' }
          }
        />

        {openAssigned.length > 0 && (
          <SectionBanner
            tone="info"
            text={`${openAssigned.length} active job${openAssigned.length === 1 ? '' : 's'} assigned to you.`}
          />
        )}

        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard label="Jobs assigned" value={mine.length} icon={<HardHat className="h-5 w-5" />} />
          <StatCard label="Earnings" value={formatZAR(earnings)} icon={<Star className="h-5 w-5" />} />
          <StatCard label="Completed" value={completed.length} icon={<Wrench className="h-5 w-5" />} />
        </div>

        <div className="space-y-3">
          {jobs.map((t) => {
            const prop = state.properties.find((p) => p.id === t.propertyId)
            return (
              <Card
                key={t.id}
                className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
                hover
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-medium">{t.title}</h3>
                    <Badge tone={statusTone(t.status)}>{t.status}</Badge>
                    <Badge tone="neutral">{t.priority}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-ink-500">
                    {prop?.title ?? t.propertyId} · {t.assetLabel} · {formatZAR(t.cost) || 'Quote pending'}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {!t.contractorId && (
                    <Button
                      size="sm"
                      onClick={() =>
                        updateTicket(t.id, { contractorId: user.id, status: 'In Progress' })
                      }
                    >
                      Accept job
                    </Button>
                  )}
                  {t.contractorId === user.id && (
                    <Select
                      value={t.status}
                      onChange={(e) =>
                        updateTicket(t.id, { status: e.target.value as typeof t.status })
                      }
                    >
                      {['Requested', 'In Progress', 'Awaiting Parts', 'Completed', 'Cancelled'].map(
                        (s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ),
                      )}
                    </Select>
                  )}
                </div>
              </Card>
            )
          })}
          {jobs.length === 0 && (
            <Card className="p-6 text-sm text-ink-500">No jobs available right now.</Card>
          )}
        </div>
      </DashboardPage>
    </RequirePermission>
  )
}
