import { useCallback, useRef, useState } from 'react'
import { roomKindLabel, type InfraRoom, type InternalAsset } from '../../data/infrastructure'
import { cn } from '../ui'

export const ROOM_COLORS = [
  { id: 'blue', fill: '#BFDBFE', stroke: '#1D4ED8', label: 'Blue' },
  { id: 'teal', fill: '#99F6E4', stroke: '#0F766E', label: 'Teal' },
  { id: 'amber', fill: '#FDE68A', stroke: '#B45309', label: 'Amber' },
  { id: 'rose', fill: '#FECDD3', stroke: '#BE123C', label: 'Rose' },
  { id: 'violet', fill: '#DDD6FE', stroke: '#6D28D9', label: 'Violet' },
  { id: 'slate', fill: '#E2E8F0', stroke: '#334155', label: 'Slate' },
] as const

export function roomFill(color?: string) {
  return ROOM_COLORS.find((c) => c.id === color)?.fill ?? ROOM_COLORS[0].fill
}

export function roomStroke(color?: string) {
  return ROOM_COLORS.find((c) => c.id === color)?.stroke ?? ROOM_COLORS[0].stroke
}

function clientToPlan(
  svg: SVGSVGElement,
  clientX: number,
  clientY: number,
): { x: number; y: number } {
  const pt = svg.createSVGPoint()
  pt.x = clientX
  pt.y = clientY
  const ctm = svg.getScreenCTM()
  if (!ctm) return { x: 0, y: 0 }
  const local = pt.matrixTransform(ctm.inverse())
  return { x: local.x, y: local.y }
}

export function FloorPlanCanvas({
  rooms,
  assets,
  selectedRoomId,
  onSelectRoom,
  canEdit,
  onMoveRoom,
  onDropNewRoom,
}: {
  rooms: InfraRoom[]
  assets: InternalAsset[]
  selectedRoomId: string | null
  onSelectRoom: (id: string | null) => void
  canEdit?: boolean
  onMoveRoom?: (id: string, layout: InfraRoom['layout']) => void
  onDropNewRoom?: (point: { x: number; y: number }, payload: { name: string; kind: string; color: string; w: number; h: number }) => void
}) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const dragOffset = useRef({ x: 0, y: 0 })

  const onPointerDownRoom = (e: React.PointerEvent, room: InfraRoom) => {
    if (!canEdit || !onMoveRoom) {
      onSelectRoom(selectedRoomId === room.id ? null : room.id)
      return
    }
    e.preventDefault()
    e.stopPropagation()
    const svg = svgRef.current
    if (!svg) return
    const pt = clientToPlan(svg, e.clientX, e.clientY)
    dragOffset.current = { x: pt.x - room.layout.x, y: pt.y - room.layout.y }
    setDraggingId(room.id)
    onSelectRoom(room.id)
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!draggingId || !onMoveRoom || !svgRef.current) return
    const room = rooms.find((r) => r.id === draggingId)
    if (!room) return
    const pt = clientToPlan(svgRef.current, e.clientX, e.clientY)
    const x = Math.max(0, Math.min(100 - room.layout.w, pt.x - dragOffset.current.x))
    const y = Math.max(0, Math.min(100 - room.layout.h, pt.y - dragOffset.current.y))
    onMoveRoom(draggingId, { ...room.layout, x, y })
  }

  const onPointerUp = () => setDraggingId(null)

  const onDragOver = (e: React.DragEvent) => {
    if (!canEdit) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      if (!canEdit || !onDropNewRoom || !svgRef.current) return
      e.preventDefault()
      const raw = e.dataTransfer.getData('application/x-propertyflow-room')
      if (!raw) return
      try {
        const payload = JSON.parse(raw) as {
          name: string
          kind: string
          color: string
          w: number
          h: number
        }
        const pt = clientToPlan(svgRef.current, e.clientX, e.clientY)
        onDropNewRoom(
          {
            x: Math.max(0, Math.min(100 - payload.w, pt.x - payload.w / 2)),
            y: Math.max(0, Math.min(100 - payload.h, pt.y - payload.h / 2)),
          },
          payload,
        )
      } catch {
        /* ignore bad payload */
      }
    },
    [canEdit, onDropNewRoom],
  )

  return (
    <div className="overflow-hidden rounded-3xl border border-primary-100 bg-primary-50/40 p-3 sm:p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-ink">Interactive floor plan</p>
          <p className="text-xs text-ink-500">
            {canEdit
              ? 'Drag rooms on the plan, or drop a room template onto the canvas'
              : 'Tap a room to inspect inventory'}
          </p>
        </div>
        <p className="text-xs tabular text-ink-400">{rooms.length} rooms</p>
      </div>

      <div
        className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-white shadow-inner ring-1 ring-primary-100"
        onDragOver={onDragOver}
        onDrop={onDrop}
      >
        <svg
          ref={svgRef}
          viewBox="0 0 100 100"
          className="h-full w-full touch-none"
          role="img"
          aria-label="Unit floor plan"
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
        >
          <rect x="0" y="0" width="100" height="100" fill="#f0f6fc" />
          {rooms.map((room) => {
            const selected = selectedRoomId === room.id
            const count = assets.filter((a) => a.roomId === room.id).length
            const fill = roomFill(room.color)
            const stroke = roomStroke(room.color)
            return (
              <g
                key={room.id}
                role="button"
                tabIndex={0}
                className={cn('cursor-pointer', canEdit && 'cursor-grab', draggingId === room.id && 'cursor-grabbing')}
                onPointerDown={(e) => onPointerDownRoom(e, room)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onSelectRoom(selected ? null : room.id)
                  }
                }}
              >
                <rect
                  x={room.layout.x}
                  y={room.layout.y}
                  width={room.layout.w}
                  height={room.layout.h}
                  rx={1.2}
                  fill={fill}
                  stroke={selected ? stroke : stroke}
                  strokeWidth={selected ? 1.4 : 0.7}
                  opacity={draggingId === room.id ? 0.85 : 1}
                />
                <text
                  x={room.layout.x + room.layout.w / 2}
                  y={room.layout.y + room.layout.h / 2 - 1.5}
                  textAnchor="middle"
                  className="fill-ink text-[3.2px] font-semibold"
                >
                  {room.name.length > 14 ? `${room.name.slice(0, 12)}…` : room.name}
                </text>
                <text
                  x={room.layout.x + room.layout.w / 2}
                  y={room.layout.y + room.layout.h / 2 + 3}
                  textAnchor="middle"
                  className="fill-ink-500 text-[2.6px]"
                >
                  {roomKindLabel(room.kind)} · {count}
                </text>
              </g>
            )
          })}
        </svg>
      </div>
    </div>
  )
}
