import { BellRing } from 'lucide-react'
import { useMemo } from 'react'
import { useAuth } from '../context/AuthContext'
import { useStore } from '../context/AppStore'
import { RequirePermission } from '../components/RequirePermission'
import { Badge, Button, Card, PageHeader, Select, cn } from '../components/ui'
import {
  POPUP_DURATION_OPTIONS,
  SUITE_ACTION_LABELS,
  SUITE_RESOURCE_LABELS,
} from '../lib/suiteAlerts'
import { roleLabels } from '../lib/permissions'
import type { Role, SuiteAlertAction, SuiteAlertRule } from '../types/domain'

const STAFF_PICK: Role[] = [
  'super_admin',
  'client_admin',
  'agent_admin',
  'ground_agent',
  'landlord',
  'tenant',
  'contractor',
]

const ACTIONS: SuiteAlertAction[] = ['created', 'updated', 'deleted']

export default function SuiteAlertsPage() {
  const { agencyId, agencyName, role } = useAuth()
  const { state, updateSuiteAlert } = useStore()

  const rules = useMemo(() => {
    const scoped =
      role === 'super_admin'
        ? state.suiteAlerts
        : state.suiteAlerts.filter((r) => r.agencyId === agencyId || r.agencyId === null)
    // Prefer agency overrides when present
    const byResource = new Map<string, SuiteAlertRule>()
    for (const r of scoped.filter((x) => x.agencyId === null)) byResource.set(r.resource, r)
    for (const r of scoped.filter((x) => x.agencyId === agencyId)) byResource.set(r.resource, r)
    return Array.from(byResource.values()).sort((a, b) =>
      SUITE_RESOURCE_LABELS[a.resource].localeCompare(SUITE_RESOURCE_LABELS[b.resource]),
    )
  }, [state.suiteAlerts, agencyId, role])

  const toggleAction = (rule: SuiteAlertRule, action: SuiteAlertAction) => {
    const has = rule.actions.includes(action)
    const actions = has ? rule.actions.filter((a) => a !== action) : [...rule.actions, action]
    updateSuiteAlert(rule.id, { actions: actions.length ? actions : [action] })
  }

  const toggleRole = (rule: SuiteAlertRule, r: Role) => {
    const has = rule.notifyRoles.includes(r)
    const notifyRoles = has ? rule.notifyRoles.filter((x) => x !== r) : [...rule.notifyRoles, r]
    updateSuiteAlert(rule.id, {
      notifyRoles: notifyRoles.length ? notifyRoles : [r],
    })
  }

  return (
    <RequirePermission anyOf={['users.manage', 'roles.assign', 'tenant.manage', 'platform.manage']}>
      <div className="animate-fade-in">
        <PageHeader
          title="Suite alerts"
          subtitle={`Customize which create, change, and delete events notify your team${
            agencyName ? ` at ${agencyName}` : ''
          }. Pop-up reminders use each rule’s timer.`}
        />

        <Card className="mb-6 flex gap-3 border-primary-100 bg-primary-50/40 p-4">
          <BellRing className="mt-0.5 h-5 w-5 shrink-0 text-primary" strokeWidth={1.6} aria-hidden />
          <div className="text-sm text-ink-600">
            <p className="font-medium text-ink">How it works</p>
            <p className="mt-1 text-ink-500">
              When an enabled action fires, matching roles get an inbox notification. If pop-ups are
              on, a timed reminder appears at the top of the screen — click it to open the event, or
              let the timer clear it.
            </p>
          </div>
        </Card>

        <ul className="space-y-4">
          {rules.map((rule) => (
            <li key={rule.id}>
              <Card className="p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold text-ink">
                        {SUITE_RESOURCE_LABELS[rule.resource]}
                      </h2>
                      <Badge tone={rule.enabled ? 'success' : 'neutral'}>
                        {rule.enabled ? 'On' : 'Off'}
                      </Badge>
                      {rule.agencyId === null && <Badge tone="info">Platform default</Badge>}
                    </div>
                    <p className="mt-1 text-xs text-ink-500">
                      Resource key: <span className="tabular">{rule.resource}</span>
                    </p>
                  </div>
                  <Button
                    variant={rule.enabled ? 'secondary' : 'primary'}
                    className="min-h-11"
                    onClick={() => updateSuiteAlert(rule.id, { enabled: !rule.enabled })}
                  >
                    {rule.enabled ? 'Disable' : 'Enable'}
                  </Button>
                </div>

                <div className="mt-5 grid gap-5 lg:grid-cols-3">
                  <fieldset className="space-y-2">
                    <legend className="text-xs font-semibold uppercase tracking-wide text-ink-400">
                      Trigger on
                    </legend>
                    <div className="flex flex-wrap gap-2">
                      {ACTIONS.map((action) => {
                        const on = rule.actions.includes(action)
                        return (
                          <button
                            key={action}
                            type="button"
                            disabled={!rule.enabled}
                            onClick={() => toggleAction(rule, action)}
                            className={cn(
                              'min-h-11 cursor-pointer rounded-xl border px-3 text-sm font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50',
                              on
                                ? 'border-primary bg-primary-50 text-primary'
                                : 'border-primary-100 bg-white text-ink-500 hover:bg-primary-50',
                            )}
                          >
                            {SUITE_ACTION_LABELS[action]}
                          </button>
                        )
                      })}
                    </div>
                  </fieldset>

                  <fieldset className="space-y-2">
                    <legend className="text-xs font-semibold uppercase tracking-wide text-ink-400">
                      Pop-up reminder
                    </legend>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        variant={rule.popupEnabled ? 'primary' : 'secondary'}
                        className="min-h-11"
                        disabled={!rule.enabled}
                        onClick={() =>
                          updateSuiteAlert(rule.id, { popupEnabled: !rule.popupEnabled })
                        }
                      >
                        {rule.popupEnabled ? 'Pop-ups on' : 'Pop-ups off'}
                      </Button>
                      <Select
                        className="min-h-11 min-w-[10rem]"
                        disabled={!rule.enabled || !rule.popupEnabled}
                        value={String(rule.popupDurationMs)}
                        onChange={(e) =>
                          updateSuiteAlert(rule.id, {
                            popupDurationMs: Number(e.target.value),
                          })
                        }
                        aria-label="Pop-up duration"
                      >
                        {POPUP_DURATION_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </Select>
                    </div>
                  </fieldset>

                  <fieldset className="space-y-2">
                    <legend className="text-xs font-semibold uppercase tracking-wide text-ink-400">
                      Notify roles
                    </legend>
                    <div className="flex flex-wrap gap-2">
                      {STAFF_PICK.map((r) => {
                        const on = rule.notifyRoles.includes(r)
                        return (
                          <button
                            key={r}
                            type="button"
                            disabled={!rule.enabled}
                            onClick={() => toggleRole(rule, r)}
                            className={cn(
                              'min-h-11 cursor-pointer rounded-xl border px-3 text-xs font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50',
                              on
                                ? 'border-primary bg-primary-50 text-primary'
                                : 'border-primary-100 bg-white text-ink-500 hover:bg-primary-50',
                            )}
                          >
                            {roleLabels[r]}
                          </button>
                        )
                      })}
                    </div>
                  </fieldset>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      </div>
    </RequirePermission>
  )
}
