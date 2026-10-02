/**
 * Property Portals tab — Mode A manual export pack + completeness + honesty.
 * Not live Property24 / Private Property push.
 */
import { useMemo, useState } from 'react'
import { Download, Upload } from 'lucide-react'
import type { PropertyAsset } from '../../types/domain'
import { Button, Card, Badge } from '../ui'
import { FieldHelp } from '../onboarding/FieldHelp'
import { SYNDICATION_MODE_A_COPY } from '../../lib/syndication'
import {
  assessPropertySyndicationReadiness,
  attemptLivePartnerPush,
  exportManualPackForPortal,
  findPublication,
  markPublicationLiveManual,
  portalLabel,
  publicationStatusLabel,
  type PortalCode,
} from '../../lib/syndication'
import { sweetSuccess, sweetWarning } from '../../lib/sweetAlert'

const ICON_STROKE = 1.6

function downloadText(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function PropertySyndicationPanel({
  property,
  canManage,
  onPropertyPatch,
}: {
  property: PropertyAsset
  canManage: boolean
  onPropertyPatch: (patch: Partial<PropertyAsset>) => void
}) {
  const [busy, setBusy] = useState<string | null>(null)
  const readiness = useMemo(
    () => assessPropertySyndicationReadiness(property, 'property24'),
    [property],
  )

  const p24 = findPublication(property, 'property24')
  const pp = findPublication(property, 'private_property')

  const runExport = async (portalCode: Extract<PortalCode, 'property24' | 'private_property'>) => {
    if (!canManage) return
    setBusy(portalCode)
    try {
      const out = await exportManualPackForPortal(property, portalCode)
      if (out.ok === false) {
        await sweetWarning('Export failed', out.error)
        return
      }
      onPropertyPatch({ syndicationPublications: out.property.syndicationPublications })
      downloadText(`${out.exportPack.filenameBase}.csv`, out.exportPack.csv, 'text/csv;charset=utf-8')
      downloadText(
        `${out.exportPack.filenameBase}.json`,
        out.exportPack.json,
        'application/json;charset=utf-8',
      )
      const warn = out.mandateSoftWarn ? ` ${out.mandateSoftWarn}` : ''
      await sweetSuccess(
        `Manual pack for ${portalLabel(portalCode)}`,
        `Downloaded CSV + JSON. Status: exported_manual — paste onto the portal yourself, then mark live_manual.${warn}`,
      )
    } finally {
      setBusy(null)
    }
  }

  const markLive = async (portalCode: Extract<PortalCode, 'property24' | 'private_property'>) => {
    if (!canManage) return
    const out = markPublicationLiveManual(property, portalCode)
    if (out.ok === false) {
      await sweetWarning('Cannot mark live', out.error)
      return
    }
    onPropertyPatch({ syndicationPublications: out.property.syndicationPublications })
    await sweetSuccess(
      'Marked live_manual',
      `${portalLabel(portalCode)} marked as live on the portal (manual). Not a live feed confirmation.`,
    )
  }

  const tryLivePush = async (portalCode: Extract<PortalCode, 'property24' | 'private_property'>) => {
    const out = await attemptLivePartnerPush(property, portalCode)
    await sweetWarning('Live partner push refused', out.error)
  }

  return (
    <div className="space-y-4" data-testid="property-syndication-panel">
      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="inline-flex items-center gap-1.5 text-base font-semibold text-ink-900">
            Export readiness
            <FieldHelp title="Syndication" body={SYNDICATION_MODE_A_COPY} />
          </h3>
          <Badge tone={readiness.ready ? 'success' : 'warning'}>
            Score {readiness.score}/{readiness.maxScore}
            {readiness.ready ? ' · pack-ready' : ' · fix errors'}
          </Badge>
        </div>
        {readiness.mandateSoftWarn ? (
          <p className="rounded-lg border border-primary-100 bg-primary-50/50 px-3 py-2 text-sm text-ink-600" data-testid="mandate-soft-warn">
            {readiness.mandateSoftWarn}
          </p>
        ) : (
          <p className="text-sm text-ink-500">Mandate marked active (soft completeness flag).</p>
        )}
        {canManage ? (
          <label className="flex items-center gap-2 text-sm text-ink-700">
            <input
              type="checkbox"
              className="rounded border-ink-300"
              checked={property.mandateActive === true}
              onChange={(e) => onPropertyPatch({ mandateActive: e.target.checked })}
              data-testid="mandate-active-toggle"
            />
            Mandate active (soft flag only — not a full mandate engine)
          </label>
        ) : null}
        <ul className="space-y-1 text-sm">
          {readiness.issues.length === 0 ? (
            <li className="text-ink-500">No completeness issues.</li>
          ) : (
            readiness.issues.map((issue) => (
              <li
                key={issue.code}
                className={issue.severity === 'error' ? 'text-rose-700' : 'text-amber-800'}
              >
                <strong className="uppercase tracking-wide text-[10px]">{issue.severity}</strong>{' '}
                {issue.message}
              </li>
            ))
          )}
        </ul>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {(
          [
            ['property24', p24],
            ['private_property', pp],
          ] as const
        ).map(([code, pub]) => (
          <Card key={code} className="space-y-3 p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="font-semibold text-ink-900">{portalLabel(code)}</h3>
                <p className="text-xs text-ink-500">Manual pack workflow — not live feed</p>
              </div>
              <Badge tone={pub?.status === 'live_manual' ? 'success' : 'neutral'}>
                {pub ? publicationStatusLabel(pub.status) : 'Not exported'}
              </Badge>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                className="min-h-10"
                disabled={!canManage || busy === code}
                onClick={() => void runExport(code)}
                data-testid={`export-pack-${code}`}
              >
                <Download className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
                Download export pack
              </Button>
              <Button
                className="min-h-10"
                variant="secondary"
                disabled={!canManage || !pub || pub.status === 'draft'}
                onClick={() => void markLive(code)}
                data-testid={`mark-live-manual-${code}`}
              >
                <Upload className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
                Mark live_manual
              </Button>
              <Button
                className="min-h-10"
                variant="ghost"
                onClick={() => void tryLivePush(code)}
                data-testid={`refuse-live-${code}`}
              >
                Try live push (refuses)
              </Button>
            </div>
          </Card>
        ))}
      </div>

      <Card className="space-y-2 p-4">
        <h3 className="font-semibold text-ink-900">Own-site marketplace</h3>
        <p className="text-sm text-ink-600">
          Marketplace publish stays on the property header (Published / Featured). This Portals tab
          is for <strong>manual</strong> Property24 / Private Property packs beside that — not portal
          parity.
        </p>
        <p className="text-sm text-ink-600">
          Import portal leads via CRM → Lead CSV (source + external_id dedupe).
        </p>
      </Card>
    </div>
  )
}
