import { useEffect, useState } from 'react'
import { Button, Card } from '../ui'
import {
  screeningApi,
  screeningApiAvailable,
  type AgencyScreeningSettings,
  type ScreeningProviderChoice,
} from '../../lib/api/screeningApi'
import {
  CHECK_TYPE_LABELS,
  DEFAULT_CREDIT_RETENTION_MONTHS,
  SCREENING_CHECK_TYPES,
  type ScreeningCheckType,
} from '../../lib/screening/consentTerms'

/** Agency screening settings: enabled checks, first-choice provider per check, payer, credit retention. */
export function ScreeningSettingsCard({ agencyId }: { agencyId: string }) {
  const [settings, setSettings] = useState<AgencyScreeningSettings | null>(null)
  const [providers, setProviders] = useState<ScreeningProviderChoice[]>([])
  const [defaults, setDefaults] = useState<Partial<Record<ScreeningCheckType, string[]>>>({})
  const [message, setMessage] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!screeningApiAvailable) return
    let live = true
    screeningApi
      .getSettings(agencyId)
      .then((res) => {
        if (!live) return
        setSettings(res.settings)
        setProviders(res.providers)
        setDefaults(res.defaultOrder)
      })
      .catch((err: unknown) => live && setMessage(err instanceof Error ? err.message : 'Could not load settings'))
    return () => {
      live = false
    }
  }, [agencyId])

  if (!screeningApiAvailable) return null
  if (!settings) {
    return message ? (
      <Card className="p-4">
        <p className="text-sm text-ink-500">{message}</p>
      </Card>
    ) : null
  }

  const toggle = (type: ScreeningCheckType, on: boolean) =>
    setSettings({
      ...settings,
      enabledChecks: on
        ? SCREENING_CHECK_TYPES.filter((t) => t === type || settings.enabledChecks.includes(t))
        : settings.enabledChecks.filter((t) => t !== type),
    })

  const setProvider = (type: ScreeningCheckType, id: string) =>
    setSettings({ ...settings, providers: { ...settings.providers, [type]: id ? [id] : [] } })

  const save = async () => {
    setSaving(true)
    setMessage(null)
    try {
      const res = await screeningApi.saveSettings(settings, agencyId)
      setSettings(res.settings)
      setMessage('Saved.')
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="space-y-4 p-4">
      <div>
        <h2 className="font-display text-lg font-semibold text-ink">Screening checks</h2>
        <p className="text-xs text-ink-500">
          Which checks agents can run, who to use first (the next one is tried if it errors), and who pays.
        </p>
      </div>
      <div className="divide-y divide-primary-50">
        {SCREENING_CHECK_TYPES.map((type) => {
          const options = providers.filter((p) => p.supports.includes(type))
          const fallback = (defaults[type] ?? []).join(' → ')
          return (
            <div key={type} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={settings.enabledChecks.includes(type)}
                  onChange={(e) => toggle(type, e.target.checked)}
                />
                {CHECK_TYPE_LABELS[type]}
              </label>
              <label className="text-xs text-ink-500">
                First choice
                <select
                  className="ml-2 h-9 rounded-lg border border-primary-100 bg-white px-2 text-sm text-ink"
                  value={settings.providers[type]?.[0] ?? ''}
                  disabled={!settings.enabledChecks.includes(type)}
                  onChange={(e) => setProvider(type, e.target.value)}
                >
                  <option value="">Default ({fallback || 'none'})</option>
                  {options.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {p.configured ? '' : ' (not configured)'}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )
        })}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-medium text-ink-600">
          Who pays
          <select
            className="mt-1 h-11 w-full rounded-xl border border-primary-100 bg-white px-3 text-sm"
            value={settings.payer}
            onChange={(e) => setSettings({ ...settings, payer: e.target.value === 'APPLICANT' ? 'APPLICANT' : 'AGENCY' })}
          >
            <option value="AGENCY">Agency</option>
            <option value="APPLICANT">Applicant</option>
          </select>
        </label>
        <label className="text-xs font-medium text-ink-600">
          Keep credit results (months)
          <input
            className="mt-1 h-11 w-full rounded-xl border border-primary-100 px-3 text-sm"
            inputMode="numeric"
            value={String(settings.creditRetentionMonths)}
            onChange={(e) => {
              const n = Number(e.target.value)
              setSettings({
                ...settings,
                creditRetentionMonths: Number.isInteger(n) && n > 0 ? n : DEFAULT_CREDIT_RETENTION_MONTHS,
              })
            }}
          />
        </label>
      </div>
      <p className="text-xs text-ink-400">ID, liveness and bank checks are kept 5 years after the tenancy ends (FICA).</p>
      <div className="flex items-center gap-3">
        <Button type="button" size="sm" disabled={saving} onClick={() => void save()}>
          {saving ? 'Saving…' : 'Save screening settings'}
        </Button>
        {message ? <span className="text-xs text-ink-500">{message}</span> : null}
      </div>
    </Card>
  )
}
