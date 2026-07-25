import { Link } from 'react-router-dom'
import { useRef, useState } from 'react'
import {
  AlertTriangle,
  ArrowUpRight,
  GripVertical,
  HardHat,
  MapPin,
  ShieldCheck,
} from 'lucide-react'
import type { MaintenanceTicket } from '../../types/domain'
import { Badge, cn, priorityTone } from '../ui'
import {
  boardColumnForStatus,
  formatAge,
  type PortfolioTicket,
} from './types'

const ICON_STROKE = 1.6

export type BoardColumnKey = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED'

const COLUMNS: Array<{
  key: BoardColumnKey
  label: string
  hint: string
}> = [
  { key: 'OPEN', label: 'Open', hint: 'Drag grip → In progress' },
  { key: 'IN_PROGRESS', label: 'In progress', hint: 'Drag grip → Resolved' },
  { key: 'RESOLVED', label: 'Resolved', hint: 'Work evidence required' },
]

/** Forward-only workflow: Open → In progress → Resolved */
export function canMoveBoardTicket(from: BoardColumnKey, to: BoardColumnKey) {
  if (from === to) return false
  if (from === 'OPEN' && to === 'IN_PROGRESS') return true
  if (from === 'IN_PROGRESS' && to === 'RESOLVED') return true
  return false
}

export function statusForBoardColumn(
  column: BoardColumnKey,
): MaintenanceTicket['status'] {
  if (column === 'IN_PROGRESS') return 'In Progress'
  if (column === 'RESOLVED') return 'Completed'
  return 'Requested'
}

export function MaintenanceBoardView({
  items,
  selectedId,
  onOpen,
  onMove,
  canDrag,
  reducedMotion,
}: {
  items: PortfolioTicket[]
  selectedId?: string | null
  onOpen: (id: string) => void
  onMove: (ticketId: string, to: BoardColumnKey) => void
  canDrag?: boolean
  reducedMotion?: boolean
}) {
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [overColumn, setOverColumn] = useState<BoardColumnKey | null>(null)
  const dragFrom = useRef<BoardColumnKey | null>(null)

  const draggingItem = draggingId
    ? items.find((i) => i.ticket.id === draggingId)
    : undefined
  const fromColumn = draggingItem
    ? boardColumnForStatus(draggingItem.ticket.status)
    : null

  return (
    <div className="grid gap-3 xl:grid-cols-3">
      {COLUMNS.map((col) => {
        const columnItems = items.filter(
          (i) => boardColumnForStatus(i.ticket.status) === col.key,
        )
        const accepts = Boolean(
          canDrag && fromColumn && canMoveBoardTicket(fromColumn, col.key),
        )
        const isOver = overColumn === col.key && accepts

        return (
          <section
            key={col.key}
            className="min-w-0"
            onDragOver={(e) => {
              if (!canDrag || !fromColumn) return
              if (!canMoveBoardTicket(fromColumn, col.key)) return
              e.preventDefault()
              e.dataTransfer.dropEffect = 'move'
              setOverColumn(col.key)
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                setOverColumn((cur) => (cur === col.key ? null : cur))
              }
            }}
            onDrop={(e) => {
              e.preventDefault()
              const id =
                e.dataTransfer.getData('text/ticket-id') || draggingId || ''
              setOverColumn(null)
              setDraggingId(null)
              dragFrom.current = null
              if (!id || !fromColumn) return
              if (!canMoveBoardTicket(fromColumn, col.key)) return
              onMove(id, col.key)
            }}
          >
            <div className="mb-2 flex items-baseline justify-between gap-2 px-0.5">
              <div>
                <h2 className="text-sm font-semibold text-ink">{col.label}</h2>
                {canDrag && (
                  <p className="text-[11px] text-ink-400">{col.hint}</p>
                )}
              </div>
              <span className="tabular text-xs font-semibold text-ink-500">
                {columnItems.length}
              </span>
            </div>

            <ul
              className={cn(
                'min-h-[8rem] space-y-1.5 rounded-xl border border-dashed border-primary-100 bg-primary-50/20 p-1.5 transition-[border-color,background-color] duration-200',
                reducedMotion && 'transition-none',
                isOver && 'border-primary bg-primary-50/60',
              )}
              aria-label={`${col.label} column drop zone`}
            >
              {columnItems.map((item) => (
                <li key={item.ticket.id}>
                  <BoardCard
                    item={item}
                    canDrag={Boolean(canDrag)}
                    reducedMotion={reducedMotion}
                    isDragging={draggingId === item.ticket.id}
                    selected={selectedId === item.ticket.id}
                    onOpen={() => onOpen(item.ticket.id)}
                    onDragStart={() => {
                      dragFrom.current = boardColumnForStatus(item.ticket.status)
                      setDraggingId(item.ticket.id)
                    }}
                    onDragEnd={() => {
                      setDraggingId(null)
                      setOverColumn(null)
                      dragFrom.current = null
                    }}
                  />
                </li>
              ))}
              {!columnItems.length && (
                <li className="px-2 py-8 text-center text-xs text-ink-400">
                  {isOver ? 'Drop here' : 'Empty'}
                </li>
              )}
            </ul>
          </section>
        )
      })}
    </div>
  )
}

function BoardCard({
  item,
  canDrag,
  reducedMotion,
  isDragging,
  selected,
  onOpen,
  onDragStart,
  onDragEnd,
}: {
  item: PortfolioTicket
  canDrag: boolean
  reducedMotion?: boolean
  isDragging?: boolean
  selected?: boolean
  onOpen: () => void
  onDragStart: () => void
  onDragEnd: () => void
}) {
  const t = item.ticket
  const health = item.assetHealth
  const disposition =
    health.disposition === 'REPLACE'
      ? 'Replace'
      : health.disposition === 'REPAIR'
        ? 'Repair'
        : health.disposition === 'MONITOR'
          ? 'Monitor'
          : null

  return (
    <article
      className={cn(
        'flex overflow-hidden rounded-lg border bg-white',
        selected ? 'border-primary ring-2 ring-primary/20' : 'border-primary-100',
        isDragging && 'opacity-50',
        !reducedMotion && 'transition-opacity duration-150',
      )}
    >
      {/* Drag handle — only this control starts a drag */}
      {canDrag ? (
        <button
          type="button"
          draggable
          aria-label={`Drag ${t.title}`}
          title="Drag to move"
          onDragStart={(e) => {
            e.dataTransfer.setData('text/ticket-id', t.id)
            e.dataTransfer.effectAllowed = 'move'
            onDragStart()
          }}
          onDragEnd={onDragEnd}
          className="inline-flex min-h-11 w-9 shrink-0 cursor-grab items-center justify-center border-r border-primary-50 text-ink-300 transition-colors duration-150 hover:bg-primary-50 hover:text-ink-500 active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
        >
          <GripVertical className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
        </button>
      ) : null}

      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={onOpen}
          className="w-full cursor-pointer px-2.5 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
        >
          <div className="flex flex-wrap items-center gap-1">
            <Badge tone={priorityTone(t.priority)}>{t.priority}</Badge>
            {t.warrantyCovered && (
              <Badge tone="success" className="gap-0.5">
                <ShieldCheck className="h-3 w-3" strokeWidth={ICON_STROKE} aria-hidden />
                Warranty
              </Badge>
            )}
            {t.escalatedAt && (
              <Badge tone="danger" className="gap-0.5">
                <AlertTriangle className="h-3 w-3" strokeWidth={ICON_STROKE} aria-hidden />
                Escalated
              </Badge>
            )}
          </div>

          <h3 className="mt-1 truncate text-sm font-semibold leading-snug text-ink">
            {t.title}
          </h3>

          {/* Dense data row — property, asset, age */}
          <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-ink-500">
            <span className="inline-flex min-w-0 max-w-full items-center gap-0.5 truncate">
              <MapPin className="h-3 w-3 shrink-0" strokeWidth={ICON_STROKE} aria-hidden />
              <span className="truncate">
                {item.property.title}
                {item.property.suburb ? ` · ${item.property.suburb}` : ''}
              </span>
            </span>
            <span aria-hidden>·</span>
            <span className="truncate">{t.assetLabel}</span>
            <span aria-hidden>·</span>
            <span className="tabular">{formatAge(item.ageHours)}</span>
          </p>

          {/* Ops meta — contractor, category, disposition, health */}
          <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-ink-500">
            <span className="inline-flex min-w-0 items-center gap-0.5 truncate">
              <HardHat className="h-3 w-3 shrink-0" strokeWidth={ICON_STROKE} aria-hidden />
              <span className="truncate">{item.contractorName ?? 'Unassigned'}</span>
            </span>
            <span aria-hidden>·</span>
            <span className="truncate">{t.categoryKey ?? 'GENERAL'}</span>
            {disposition && (
              <>
                <span aria-hidden>·</span>
                <span>{disposition}</span>
              </>
            )}
            <span aria-hidden>·</span>
            <span className="tabular">Health {health.health_score}</span>
          </p>
        </button>

        <div className="border-t border-primary-50 px-2.5 py-1">
          <Link
            to={`/workspace/properties/${item.property.id}?tab=maintenance`}
            className="inline-flex min-h-9 w-full cursor-pointer items-center gap-1 text-[11px] font-semibold text-primary transition-colors duration-150 hover:text-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            onClick={(e) => e.stopPropagation()}
          >
            Open property
            <ArrowUpRight className="h-3 w-3" strokeWidth={ICON_STROKE} aria-hidden />
          </Link>
        </div>
      </div>
    </article>
  )
}
