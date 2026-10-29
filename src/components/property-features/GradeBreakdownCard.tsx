import { Award } from 'lucide-react'
import { GRADE_CATEGORY_LABEL, type GradeBreakdown, type GradeCategory } from '../../lib/buildingGrading'
import { gradingLabel } from '../../lib/buildingGrading'

const ORDER: GradeCategory[] = ['power_water', 'security', 'comfort', 'lifestyle', 'space']

/** Shows how the grade was made up and what would raise it. */
export function GradeBreakdownCard({ breakdown }: { breakdown: GradeBreakdown }) {
  return (
    <div className="rounded-xl border border-primary-100 bg-primary-50/40 p-4" data-tip-target="grade-breakdown">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="inline-flex items-center gap-2 text-sm font-semibold text-ink">
          <Award className="h-4 w-4 text-primary" aria-hidden /> Grade {gradingLabel(breakdown.grade)}
        </p>
        <span className="text-xs font-medium tabular-nums text-ink-500">{breakdown.score} / 100 points</span>
      </div>
      <ul className="mt-3 space-y-2">
        {ORDER.map((c) => {
          const cat = breakdown.byCategory[c]
          const pct = cat.max ? Math.round((cat.points / cat.max) * 100) : 0
          const labels = breakdown.items.filter((i) => i.category === c).map((i) => i.label)
          return (
            <li key={c}>
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-ink-700">{GRADE_CATEGORY_LABEL[c]}</span>
                <span className="tabular-nums text-ink-500">
                  {cat.points}/{cat.max}
                </span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white">
                <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
              </div>
              {labels.length ? <p className="mt-0.5 text-[11px] text-ink-500">{labels.join(' · ')}</p> : null}
            </li>
          )
        })}
      </ul>
      {breakdown.suggestions.length ? (
        <p className="mt-3 text-xs text-ink-600">
          To raise the grade, add: <span className="font-medium">{breakdown.suggestions.join(', ')}</span>
        </p>
      ) : null}
      <p className="mt-2 text-[11px] text-ink-400">P ≥ 70 points · A ≥ 45 · B ≥ 25 · covering more categories adds a bonus.</p>
    </div>
  )
}
