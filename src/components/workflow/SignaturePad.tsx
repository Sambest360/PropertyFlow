import { useEffect, useRef, useState } from 'react'
import { Eraser } from 'lucide-react'
import { Button, cn } from '../ui'

const STROKE = 1.6

export function SignaturePad({
  value,
  onChange,
  className,
}: {
  value?: string | null
  onChange: (dataUrl: string | null) => void
  className?: string
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const [empty, setEmpty] = useState(!value)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = Math.floor(rect.width * dpr)
    canvas.height = Math.floor(rect.height * dpr)
    ctx.scale(dpr, dpr)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.lineWidth = 2
    ctx.strokeStyle = '#0f2744'

    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, rect.width, rect.height)

    if (value) {
      const img = new Image()
      img.onload = () => {
        ctx.drawImage(img, 0, 0, rect.width, rect.height)
        setEmpty(false)
      }
      img.src = value
    }
  }, [value])

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    const p = point(e)
    if (!ctx || !p) return
    drawing.current = true
    canvas?.setPointerCapture(e.pointerId)
    ctx.beginPath()
    ctx.moveTo(p.x, p.y)
  }

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    const p = point(e)
    if (!ctx || !p) return
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
    setEmpty(false)
  }

  const end = () => {
    if (!drawing.current) return
    drawing.current = false
    const canvas = canvasRef.current
    if (!canvas) return
    onChange(canvas.toDataURL('image/png'))
  }

  const clear = () => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const rect = canvas.getBoundingClientRect()
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, rect.width, rect.height)
    setEmpty(true)
    onChange(null)
  }

  return (
    <div className={cn('space-y-2', className)}>
      <div className="relative overflow-hidden rounded-2xl border border-primary-200 bg-white ring-1 ring-primary-100">
        <canvas
          ref={canvasRef}
          className="h-36 w-full touch-none cursor-crosshair"
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerLeave={end}
          aria-label="Signature pad — draw with mouse or finger"
        />
        <div className="pointer-events-none absolute inset-x-0 bottom-8 border-b border-dashed border-ink-200/60" />
        <p className="pointer-events-none absolute bottom-2 left-3 text-[10px] font-medium uppercase tracking-wide text-ink-400">
          Sign above the line
        </p>
      </div>
      <div className="flex justify-end">
        <Button type="button" variant="secondary" className="min-h-9" onClick={clear} disabled={empty}>
          <Eraser className="h-3.5 w-3.5" strokeWidth={STROKE} aria-hidden />
          Clear
        </Button>
      </div>
    </div>
  )
}
