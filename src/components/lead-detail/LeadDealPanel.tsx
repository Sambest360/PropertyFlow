import { Check } from 'lucide-react'
import type { Lead, PropertyAsset } from '../../types/domain'
import { Select, cn } from '../ui'
import { formatZAR } from '../../data/seed'
import { DetailSection, FlatField, FlatFieldGrid } from '../detail/FlatFields'
import { LEAD_STAGES, ICON_STROKE } from './types'
import { useLookupOptions } from '../../hooks/useLookupOptions'

/**
 * Progress through the sales/leasing path for this enquiry —
 * from first contact to signed lease or completed sale.
 */
export function LeadDealPanel({
  lead,
  property,
  agentName,
  canManage,
  onStageChange,
}: {
  lead: Lead
  property: PropertyAsset | null
  agentName: string | null
  canManage: boolean
  onStageChange: (stage: string) => void
}) {
  const stageOptions = useLookupOptions('LEAD_STAGE', lead.agencyId)
  const stages = stageOptions.length
    ? stageOptions.map((o) => o.value)
    : [...LEAD_STAGES]
  const stageLabels = stageOptions.length
    ? Object.fromEntries(stageOptions.map((o) => [o.value, o.label]))
    : Object.fromEntries(LEAD_STAGES.map((s) => [s, s]))

  const stageIndex = Math.max(0, stages.findIndex((s) => s === lead.stage))
  const dealKind = lead.type === 'Buy' ? 'sale' : 'rental'
  const total = stages.length
  const stepNumber = Math.min(stageIndex + 1, total)

  return (
    <div className="space-y-8">
      <DetailSection
        title="Progress"
        subtitle={
          property
            ? `This is the path of the ${dealKind} opportunity for ${property.title} — from first enquiry to close.`
            : `This is the path of the ${dealKind} opportunity — from first enquiry to close.`
        }
      >
        <FlatFieldGrid className="lg:grid-cols-3">
          <FlatField
            label="Current step"
            value={`${stepNumber} of ${total} · ${stageLabels[lead.stage] ?? lead.stage}`}
          />
          <FlatField label="Agent" value={agentName ?? 'Unassigned'} />
          <FlatField label="Expected value" value={formatZAR(lead.value)} tabular />
        </FlatFieldGrid>

        <p className="text-sm text-ink-500">
          A <span className="font-semibold text-ink">deal</span> is simply this lead working toward a
          signed outcome ({lead.type === 'Buy' ? 'sale completed' : 'lease signed'}). Move the step
          forward as you contact them, host viewings, take an application, and close.
        </p>

        <nav aria-label="Deal progress steps" className="overflow-x-auto pt-2 [scrollbar-width:thin]">
          <ol className="flex min-w-[42rem] items-start">
            {stages.map((stage, i) => {
              const done = i < stageIndex
              const current = i === stageIndex
              const upcoming = i > stageIndex
              return (
                <li key={stage} className="relative flex min-w-0 flex-1 flex-col items-center">
                  {i > 0 && (
                    <span
                      aria-hidden
                      className={cn(
                        'absolute left-0 right-1/2 top-4 h-0.5 -translate-y-1/2',
                        i <= stageIndex ? 'bg-primary' : 'bg-primary-100',
                      )}
                    />
                  )}
                  {i < stages.length - 1 && (
                    <span
                      aria-hidden
                      className={cn(
                        'absolute left-1/2 right-0 top-4 h-0.5 -translate-y-1/2',
                        i < stageIndex ? 'bg-primary' : 'bg-primary-100',
                      )}
                    />
                  )}

                  <span
                    className={cn(
                      'relative z-[1] inline-flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-colors duration-200',
                      done && 'bg-primary text-white',
                      current && 'bg-primary text-white ring-4 ring-primary-100',
                      upcoming && 'border-2 border-primary-200 bg-white text-ink-400',
                    )}
                    aria-current={current ? 'step' : undefined}
                  >
                    {done ? (
                      <Check className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
                    ) : (
                      <span className="tabular">{i + 1}</span>
                    )}
                  </span>
                  <span
                    className={cn(
                      'mt-2 max-w-[5.5rem] text-center text-[11px] font-medium leading-snug',
                      current && 'font-semibold text-primary',
                      done && 'text-ink-600',
                      upcoming && 'text-ink-400',
                    )}
                  >
                    {stageLabels[stage] ?? stage}
                  </span>
                </li>
              )
            })}
          </ol>
        </nav>

        {canManage && (
          <label className="block text-xs font-semibold text-ink-500">
            Move to step
            <Select
              className="mt-1 min-h-11 w-full"
              value={lead.stage}
              onChange={(e) => onStageChange(e.target.value)}
              aria-label="Update deal stage"
            >
              {stages.map((s, i) => (
                <option key={s} value={s}>
                  {i + 1}. {stageLabels[s] ?? s}
                </option>
              ))}
            </Select>
          </label>
        )}
      </DetailSection>
    </div>
  )
}
