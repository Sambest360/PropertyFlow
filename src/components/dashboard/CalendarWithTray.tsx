import { useMemo } from 'react'
import type { ReactNode } from 'react'
import { cn } from '../ui'
import { MiniCalendar, type CalendarMarker } from '../admin/MiniCalendar'

export interface CalendarTrayItem {
  id: string
  title: string
  subtitle?: string
  eyebrow?: string
  status?: string
  statusTone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'brand' | 'accent'
  requestBy?: string
  action?: { label: string; to: string }
  children?: ReactNode
}

/**
 * Calendar with integrated info tray underneath.
 * Displays selected date information in a tray panel below the calendar.
 */
export function CalendarWithTray({
  selected,
  onSelect,
  markers = [],
  trayItems = [],
  onClose,
  dayViewTo,
  className,
  layout = 'stack',
  months = 2,
}: {
  selected: Date
  onSelect: (d: Date) => void
  markers?: CalendarMarker[]
  trayItems?: CalendarTrayItem[]
  onClose?: () => void
  dayViewTo?: string
  className?: string
  layout?: 'auto' | 'stack' | 'row'
  months?: 1 | 2
}) {
  const activeTrayItem = useMemo(
    () => (trayItems.length > 0 ? trayItems[0] : null),
    [trayItems],
  )

  return (
    <div
      className={cn(
        'flex flex-col overflow-hidden rounded-[1.25rem] border border-primary-100 bg-white shadow-[0_18px_40px_-24px_rgba(15,39,68,0.35)]',
        className,
      )}
    >
      {/* Calendar Section */}
      <div className="shrink-0 p-4">
        <MiniCalendar
          selected={selected}
          onSelect={onSelect}
          markers={markers}
          months={months}
          layout={layout}
          onClose={onClose}
          dayViewTo={dayViewTo}
          className="rounded-none border-0 shadow-none"
        />
      </div>

      {/* Tray Section */}
      {activeTrayItem && (
        <div className="min-h-0 flex-1 border-t border-primary-100">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-gradient-to-b from-primary-50/30 to-white p-5">
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  {activeTrayItem.eyebrow && (
                    <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">
                      {activeTrayItem.eyebrow}
                    </p>
                  )}
                  <h3 className="mt-1 font-display text-lg font-semibold text-ink">
                    {activeTrayItem.title}
                  </h3>
                  {activeTrayItem.subtitle && (
                    <p className="mt-1 text-sm text-ink-500">{activeTrayItem.subtitle}</p>
                  )}
                </div>
              </div>

              {/* Status and Request By */}
              {(activeTrayItem.requestBy || activeTrayItem.status) && (
                <div className="grid gap-3 sm:grid-cols-2">
                  {activeTrayItem.requestBy && (
                    <div className="rounded-2xl bg-white/60 px-4 py-3 backdrop-blur-sm">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">
                        Request by
                      </p>
                      <p className="mt-2 text-sm font-medium text-ink">{activeTrayItem.requestBy}</p>
                    </div>
                  )}
                  {activeTrayItem.status && (
                    <div className="rounded-2xl bg-white/60 px-4 py-3 backdrop-blur-sm">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">
                        Status
                      </p>
                      <p className="mt-2 text-sm font-semibold text-ink">{activeTrayItem.status}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Additional Content */}
              {activeTrayItem.children && <div className="min-w-0">{activeTrayItem.children}</div>}
            </div>
          </div>
        </div>
      )}

      {/* Empty State */}
      {!activeTrayItem && (
        <div className="min-h-0 flex-1 border-t border-primary-100">
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center bg-gradient-to-b from-primary-50/30 to-white p-5 text-center">
            <p className="text-sm text-ink-400">No events for this date</p>
          </div>
        </div>
      )}
    </div>
  )
}
