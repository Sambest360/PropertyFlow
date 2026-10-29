/**
 * Super admin: move listing photos stored inline (base64 in units/buildings)
 * to Supabase Storage via the server (POST /api/admin/photo-migration), a few
 * rows per call so each request stays inside Vercel's time limit.
 */
import { useEffect, useState } from 'react'
import { ImageUp } from 'lucide-react'
import { actorHeaders } from '../../lib/api/actorAuth'
import { resolveApiAuthorizationHeader } from '../../lib/api/authClient'
import { Button, Card } from '../ui'

type Status = { configured: boolean; remaining: { units: number; buildings: number } }

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) || ''

async function call<T>(method: 'GET' | 'POST'): Promise<T> {
  const res = await fetch(`${API_BASE}/api/admin/photo-migration`, {
    method,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...actorHeaders(), ...(await resolveApiAuthorizationHeader()) },
  })
  const body = (await res.json().catch(() => ({}))) as T & { message?: string }
  if (!res.ok) throw new Error(body.message || `Request failed (${res.status})`)
  return body
}

export function PhotoStorageCard() {
  const [status, setStatus] = useState<Status | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [moved, setMoved] = useState(0)

  useEffect(() => {
    call<Status>('GET').then(setStatus).catch((e: Error) => setError(e.message))
  }, [])

  const left = status ? status.remaining.units + status.remaining.buildings : 0

  const run = async () => {
    setRunning(true)
    setError(null)
    try {
      // Each call moves up to 3 listings; stop when none are left.
      for (let i = 0; i < 100; i++) {
        const r = await call<{ movedPhotos: number; movedRows: number; remaining: Status['remaining'] }>('POST')
        setMoved((n) => n + r.movedPhotos)
        setStatus((s) => (s ? { ...s, remaining: r.remaining } : s))
        if (r.movedRows === 0 || r.remaining.units + r.remaining.buildings === 0) break
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setRunning(false)
    }
  }

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 font-semibold text-ink">
            <ImageUp className="h-4 w-4 text-primary" /> Listing photo storage
          </h2>
          <p className="mt-1 max-w-xl text-sm text-ink-500">
            Photos saved inside the database slow every page load. This moves them to file storage and keeps only a
            link on each listing.
          </p>
          {status ? (
            <p className="mt-2 text-sm text-ink">
              {left === 0
                ? 'All listing photos are in file storage.'
                : `${status.remaining.units} listings and ${status.remaining.buildings} buildings still have photos inside the database.`}
              {moved ? ` Moved ${moved} photo${moved === 1 ? '' : 's'} this session.` : ''}
            </p>
          ) : null}
          {status && !status.configured ? (
            <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
              File storage is switched off on this server. Remove <strong>UPLOADS_DIR=off</strong> from the server&apos;s .env (or set a
              folder path) and restart the API.
            </p>
          ) : null}
          {error ? (
            <p className="mt-2 text-sm text-red-700" role="alert">
              {error}
            </p>
          ) : null}
        </div>
        <Button
          className="min-h-11"
          disabled={running || !status?.configured || left === 0}
          onClick={() => void run()}
        >
          {running ? 'Moving photos…' : 'Move photos to storage'}
        </Button>
      </div>
    </Card>
  )
}
