/**
 * Property Portals tab — Mode A manual export pack + completeness + honesty.
 * Not live Property24 / Private Property push.
 */
import { useMemo, useState } from 'react'
import { CheckCircle2, Download } from 'lucide-react'
import type { PropertyAsset } from '../../types/domain'
import { Button, Card, Badge } from '../ui'
import {
  assessPropertySyndicationReadiness,
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
      await sweetSuccess(
        `${portalLabel(portalCode)} pack downloaded`,
        `Upload the listing on ${portalLabel(portalCode)}, then come back and click "Mark as listed".`,
      )
    } finally {
      setBusy(null)
    }
  }

  const markLive = async (portalCode: Extract<PortalCode, 'property24' | 'private_property'>) => {
    if (!canManage) return
    const out = markPublicationLiveManual(property, portalCode)
    if (out.ok === false) {
      await sweetWarning('Could not mark as listed', out.error)
      return
    }
    onPropertyPatch({ syndicationPublications: out.property.syndicationPublications })
    await sweetSuccess('Marked as listed', `${portalLabel(portalCode)} is now shown as listed for this property.`)
  }

  return (
    <div className="space-y-4" data-testid="property-syndication-panel">
      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="text-base font-semibold text-ink-900">List on property portals</h3>
            <p className="mt-1 text-sm text-ink-500">
              Download a ready-made listing pack, upload it on Property24 or Private Property, then mark it as
              listed so your team knows where it is advertised.
            </p>
          </div>
          <Badge tone={readiness.ready ? 'success' : 'warning'}>
            {readiness.ready ? 'Ready to list' : 'Needs a few details'}
          </Badge>
        </div>
        {canManage ? (
          <label className="flex items-center gap-2 text-sm text-ink-700">
            <input
              type="checkbox"
              className="rounded border-ink-300"
              checked={property.mandateActive === true}
              onChange={(e) => onPropertyPatch({ mandateActive: e.target.checked })}
              data-testid="mandate-active-toggle"
            />
            Signed mandate on file
          </label>
        ) : null}
        {readiness.issues.length === 0 ? (
          <p className="text-sm text-ink-500">Everything portals need is filled in.</p>
        ) : (
          <div>
            <p className="text-sm font-medium text-ink-700">To improve this listing:</p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
              {readiness.issues.map((issue) => (
                <li key={issue.code} className={issue.severity === 'error' ? 'text-rose-700' : 'text-ink-600'}>
                  {issue.message}
                </li>
              ))}
            </ul>
          </div>
        )}
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
              <h3 className="font-semibold text-ink-900">{portalLabel(code)}</h3>
              <Badge tone={pub?.status === 'live_manual' ? 'success' : 'neutral'}>
                {pub ? publicationStatusLabel(pub.status) : 'Not listed'}
              </Badge>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                className="min-h-10"
                disabled={!canManage || busy === code || !readiness.ready}
                onClick={() => void runExport(code)}
                data-testid={`export-pack-${code}`}
              >
                <Download className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
                Download listing pack
              </Button>
              <Button
                className="min-h-10"
                variant="secondary"
                disabled={!canManage || !pub || pub.status === 'draft' || pub.status === 'live_manual'}
                onClick={() => void markLive(code)}
                data-testid={`mark-live-manual-${code}`}
              >
                <CheckCircle2 className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
                {pub?.status === 'live_manual' ? 'Listed' : 'Mark as listed'}
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
