import { useMemo, useState } from 'react'
import { useStore } from '../../context/AppStore'
import { useAgencyScope, useAuth } from '../../context/AuthContext'
import { RequirePermission } from '../../components/RequirePermission'
import { Badge, Button, Card, PageHeader, cn } from '../../components/ui'
import { DEFAULT_RENTAL_JOURNEY } from '../../lib/journey/defaultRentalJourney'
import { resolveJourney } from '../../lib/journey/resolveJourney'
import type { AgencyJourneyOverride } from '../../lib/journey/types'

export default function ApplicationJourneySettingsPage() {
  const { state, updateAgency } = useStore()
  const { has } = useAuth()
  const { agencyId } = useAgencyScope()
  const isPlatform = has('platform.manage')

  const [viewAgencyId, setViewAgencyId] = useState(agencyId ?? state.agencies[0]?.id ?? '')
  const effectiveAgencyId = isPlatform
    ? viewAgencyId || state.agencies[0]?.id || ''
    : (agencyId ?? '')

  const agency = state.agencies.find((a) => a.id === effectiveAgencyId)
  const override = agency?.settings?.applicationJourney
  const resolved = useMemo(
    () => resolveJourney(DEFAULT_RENTAL_JOURNEY, override ?? null),
    [override],
  )

  function saveOverride(next: AgencyJourneyOverride) {
    if (!agency) return
    updateAgency(agency.id, {
      settings: {
        ...agency.settings,
        applicationJourney: next,
      },
    })
  }

  function toggleStep(key: string, enabled: boolean) {
    const steps = [...(override?.steps ?? resolved.steps.map((s) => ({ key: s.key, enabled: s.enabled, required: s.required })))]
    const row = steps.find((s) => s.key === key)
    if (row) row.enabled = enabled
    else steps.push({ key, enabled })
    saveOverride({ version: DEFAULT_RENTAL_JOURNEY.version, steps })
  }

  function resetDefault() {
    if (!agency) return
    updateAgency(agency.id, {
      settings: { ...agency.settings, applicationJourney: undefined },
    })
  }

  return (
    <RequirePermission anyOf={['config.manage', 'tenant.manage', 'platform.manage']}>
      <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-8">
        <PageHeader
          title="Application journey"
          subtitle="Configure the rental steps new applications inherit (frozen at apply time)."
        />
        {isPlatform && (
          <Card className="p-4">
            <label className="text-sm font-medium text-ink-600">Agency</label>
            <select
              className="mt-2 w-full rounded-lg border border-primary-100 px-3 py-2 text-sm"
              value={effectiveAgencyId}
              onChange={(e) => setViewAgencyId(e.target.value)}
            >
              {state.agencies.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </Card>
        )}
        <Card className="divide-y divide-primary-50">
          {resolved.steps.map((step) => {
            const patch = override?.steps?.find((s) => s.key === step.key)
            const enabled = patch?.enabled ?? step.enabled
            return (
              <div key={step.key} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-ink">{step.label}</p>
                  <p className="text-xs text-ink-400">{step.source.replace('_', ' ')}</p>
                </div>
                {step.locked ? (
                  <Badge tone="neutral">Locked</Badge>
                ) : (
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={(e) => toggleStep(step.key, e.target.checked)}
                    />
                    Enabled
                  </label>
                )}
                {step.source === 'unknown' && (
                  <span className="text-xs text-amber-700">Legal position unknown</span>
                )}
              </div>
            )
          })}
        </Card>
        <div className="flex gap-3">
          <Button type="button" variant="secondary" onClick={resetDefault}>
            Reset to SA default
          </Button>
        </div>
        <p className={cn('text-xs text-ink-400')}>
          Changes apply to new applications only. Locked steps (NCA consent, deposit account,
          joint inspection) cannot be disabled.
        </p>
      </div>
    </RequirePermission>
  )
}
