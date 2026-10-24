import { Fragment } from 'react'
import { ChevronDown, MapPin } from 'lucide-react'
import { Badge, cn, statusTone } from '../ui'
import { PersonAvatar } from '../directory/DirectoryToolbar'
import { ApplicantExpansion } from './ApplicantPortfolioCard'
import type { PortfolioApplicant } from './types'
import { UnopenedDot } from '../../context/UnopenedContext'

const ICON_STROKE = 1.6

export function ApplicantsListView({
  items,
  expandedId,
  onToggle,
  reducedMotion,
}: {
  items: PortfolioApplicant[]
  expandedId: string | null
  onToggle: (item: PortfolioApplicant) => void
  reducedMotion?: boolean
}) {
  return (
    <>
      <div className="hidden overflow-hidden rounded-[1.25rem] border border-primary-100/80 bg-white shadow-[0_8px_24px_-16px_rgba(15,39,68,0.18)] md:block">
        <div className="max-h-[min(78vh,56rem)] overflow-auto [scrollbar-width:thin]">
          <table className="w-full min-w-[48rem] border-collapse text-left text-sm">
            <thead className="sticky top-0 z-[1] bg-white/95 backdrop-blur-md">
              <tr className="border-b border-primary-100 text-[11px] font-semibold uppercase tracking-wide text-ink-400">
                <th className="w-10 px-3 py-3" aria-hidden />
                <th className="px-4 py-3 font-semibold">Applicant</th>
                <th className="px-3 py-3 font-semibold">Property</th>
                <th className="px-3 py-3 font-semibold">Stage</th>
                <th className="px-3 py-3 font-semibold">Type</th>
                <th className="px-4 py-3 font-semibold text-right">Progress</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const a = item.application
                const expanded = expandedId === a.id
                return (
                  <Fragment key={a.id}>
                    <tr
                      className={cn(
                        'border-b border-primary-50',
                        expanded && 'border-b-0 bg-primary-100',
                      )}
                    >
                      <td className="px-3 py-3">
                        <button
                          type="button"
                          onClick={() => onToggle(item)}
                          aria-expanded={expanded}
                          aria-label={
                            expanded ? 'Collapse applicant details' : 'Expand applicant details'
                          }
                          className="inline-flex min-h-9 min-w-9 cursor-pointer items-center justify-center rounded-xl text-ink-400 transition-colors duration-200 hover:bg-white hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        >
                          <ChevronDown
                            className={cn(
                              'h-4 w-4 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]',
                              expanded && 'rotate-180',
                              reducedMotion && 'transition-none',
                            )}
                            strokeWidth={ICON_STROKE}
                            aria-hidden
                          />
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => onToggle(item)}
                          className="group flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        >
                          <PersonAvatar name={a.applicantName} />
                          <span className="min-w-0">
                            <span className="block truncate font-semibold text-ink group-hover:text-primary">
                              <UnopenedDot kind="application" id={a.id} className="mr-1.5 align-middle" />{a.applicantName}
                            </span>
                            <span className="mt-0.5 block truncate text-xs text-ink-500">
                              {a.email}
                            </span>
                          </span>
                        </button>
                      </td>
                      <td className="px-3 py-3">
                        <button
                          type="button"
                          onClick={() => onToggle(item)}
                          className="flex w-full min-h-11 cursor-pointer items-center gap-1 text-left text-ink-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        >
                          <MapPin className="h-3.5 w-3.5 shrink-0 text-ink-400" strokeWidth={ICON_STROKE} aria-hidden />
                          <span className="truncate">{item.propertyTitle}</span>
                        </button>
                      </td>
                      <td className="px-3 py-3">
                        <button
                          type="button"
                          onClick={() => onToggle(item)}
                          className="cursor-pointer text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        >
                          <Badge tone={statusTone(a.stage)}>{a.stage}</Badge>
                        </button>
                      </td>
                      <td className="px-3 py-3">
                        <button
                          type="button"
                          onClick={() => onToggle(item)}
                          className="cursor-pointer text-left text-sm text-ink-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        >
                          {a.type}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => onToggle(item)}
                          className="w-full cursor-pointer text-right tabular font-semibold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        >
                          {a.progress}%
                        </button>
                      </td>
                    </tr>
                    {expanded && (
                      <tr className="border-b border-primary-100 bg-primary-50/60">
                        <td colSpan={6} className="px-4 py-4 sm:px-5">
                          <ApplicantExpansion item={item} reducedMotion={reducedMotion} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <ul className="space-y-2 md:hidden">
        {items.map((item) => {
          const a = item.application
          const expanded = expandedId === a.id
          return (
            <li
              key={a.id}
              className={cn(
                'overflow-hidden rounded-[1.25rem] border border-primary-100/80 bg-white shadow-[0_8px_24px_-16px_rgba(15,39,68,0.14)]',
                expanded && 'border-primary-200 bg-primary-50/40',
              )}
            >
              <button
                type="button"
                onClick={() => onToggle(item)}
                aria-expanded={expanded}
                className="flex w-full min-h-14 cursor-pointer items-center gap-3 px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
              >
                <PersonAvatar name={a.applicantName} />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-ink"><UnopenedDot kind="application" id={a.id} className="mr-1.5 align-middle" />{a.applicantName}</span>
                    <Badge tone={statusTone(a.stage)}>{a.stage}</Badge>
                  </span>
                  <span className="mt-1 block truncate text-xs text-ink-500">
                    {item.propertyTitle} · {a.type}
                  </span>
                </span>
                <span className="shrink-0 tabular text-sm font-semibold text-ink">{a.progress}%</span>
                <ChevronDown
                  className={cn(
                    'h-4 w-4 shrink-0 text-ink-400 transition-transform duration-300',
                    expanded && 'rotate-180',
                    reducedMotion && 'transition-none',
                  )}
                  strokeWidth={ICON_STROKE}
                  aria-hidden
                />
              </button>
              {expanded && (
                <div className="border-t border-primary-100/80 px-4 py-4">
                  <ApplicantExpansion item={item} reducedMotion={reducedMotion} />
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </>
  )
}
