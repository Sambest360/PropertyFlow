import type { ReactNode } from 'react'
import { cn } from '../ui'

export type ResponsiveDataColumn = {
  key: string
  header: ReactNode
  headerClassName?: string
  cellClassName?: string
  render: (row: unknown, index: number) => ReactNode
}

/** Table on md+ with optional card list on smaller screens. */
export function ResponsiveDataList<T>({
  rows,
  columns,
  rowKey,
  renderMobileCard,
  tableClassName,
  minTableWidth = '40rem',
  embedded = false,
  empty,
}: {
  rows: T[]
  columns: Array<{
    key: string
    header: ReactNode
    headerClassName?: string
    cellClassName?: string
    render: (row: T, index: number) => ReactNode
  }>
  rowKey: (row: T, index: number) => string
  renderMobileCard: (row: T, index: number) => ReactNode
  tableClassName?: string
  minTableWidth?: string
  embedded?: boolean
  empty?: ReactNode
}) {
  if (rows.length === 0 && empty) {
    return <>{empty}</>
  }

  const tableShell = embedded
    ? 'hidden overflow-x-auto md:block'
    : 'hidden overflow-hidden rounded-[1.25rem] border border-primary-100/80 bg-white shadow-[0_8px_24px_-16px_rgba(15,39,68,0.18)] md:block'

  return (
    <>
      <div className={tableShell}>
        <div className={cn(!embedded && 'max-h-[min(78vh,56rem)] overflow-auto [scrollbar-width:thin]')}>
          <table
            className={cn('w-full border-collapse text-left text-sm', tableClassName)}
            style={{ minWidth: minTableWidth }}
          >
            <thead className="sticky top-0 z-[1] bg-white/95 backdrop-blur-md">
              <tr className="border-b border-primary-100 text-[11px] font-semibold uppercase tracking-wide text-ink-400">
                {columns.map((col) => (
                  <th key={col.key} className={cn('px-4 py-3 font-semibold', col.headerClassName)}>
                    {col.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={rowKey(row, index)} className="border-b border-primary-50">
                  {columns.map((col) => (
                    <td key={col.key} className={cn('px-4 py-3', col.cellClassName)}>
                      {col.render(row, index)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <ul className="space-y-3 md:hidden">
        {rows.map((row, index) => (
          <li key={rowKey(row, index)}>{renderMobileCard(row, index)}</li>
        ))}
      </ul>
    </>
  )
}
