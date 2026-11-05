import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../context/AppStore'
import { isApiEnabled } from '../lib/api/config'
import { actorHeaders } from '../lib/api/actorAuth'
import { resolveApiAuthorizationHeader } from '../lib/api/authClient'
import {
  DEFAULT_APPLICATION_PIPELINE,
  resolvePipeline,
  sanitizePipeline,
  type ApplicationPipeline,
} from '../lib/pipeline/applicationPipeline'

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) || ''
let cached: ApplicationPipeline | null = null
let inflight: Promise<ApplicationPipeline> | null = null
const listeners = new Set<(p: ApplicationPipeline) => void>()

async function headers() {
  return { 'Content-Type': 'application/json', ...actorHeaders(), ...(await resolveApiAuthorizationHeader()) }
}

export function fetchPlatformPipeline(force = false): Promise<ApplicationPipeline> {
  if (!isApiEnabled) return Promise.resolve(DEFAULT_APPLICATION_PIPELINE)
  if (cached && !force) return Promise.resolve(cached)
  inflight ??= (async () => {
    try {
      const res = await fetch(`${API_BASE}/api/application-pipeline/default`, { credentials: 'include', headers: await headers() })
      const body = (await res.json().catch(() => ({}))) as { pipeline?: unknown }
      const p = res.ok ? sanitizePipeline(body.pipeline) : DEFAULT_APPLICATION_PIPELINE
      cached = p.stages.length ? p : DEFAULT_APPLICATION_PIPELINE
    } catch {
      cached = DEFAULT_APPLICATION_PIPELINE
    } finally {
      inflight = null
    }
    listeners.forEach((l) => l(cached!))
    return cached!
  })()
  return inflight
}

/** Super admin: save the platform default (locked stages included). */
export async function savePlatformPipeline(pipeline: ApplicationPipeline): Promise<ApplicationPipeline> {
  const res = await fetch(`${API_BASE}/api/application-pipeline/default`, {
    method: 'PUT',
    credentials: 'include',
    headers: await headers(),
    body: JSON.stringify({ pipeline }),
  })
  const body = (await res.json().catch(() => ({}))) as { pipeline?: unknown; message?: string }
  if (!res.ok) throw new Error(body.message || `Could not save (${res.status})`)
  cached = sanitizePipeline(body.pipeline)
  listeners.forEach((l) => l(cached!))
  return cached
}

export function usePlatformPipeline(): ApplicationPipeline {
  const [p, setP] = useState<ApplicationPipeline>(cached ?? DEFAULT_APPLICATION_PIPELINE)
  useEffect(() => {
    listeners.add(setP)
    void fetchPlatformPipeline().then(setP)
    return () => {
      listeners.delete(setP)
    }
  }, [])
  return p
}

/** The pipeline an agency's applications follow (platform default + agency changes). */
export function useAgencyPipeline(agencyId: string | null | undefined): ApplicationPipeline {
  const platform = usePlatformPipeline()
  const { state } = useStore()
  const agency = state.agencies.find((a) => a.id === agencyId)
  return useMemo(() => resolvePipeline(platform, agency?.settings?.applicationPipeline ?? null), [platform, agency?.settings?.applicationPipeline])
}
