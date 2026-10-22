import { useEffect, useState } from 'react'
import { Badge } from '../ui'

type ProviderPayload = {
  ok?: boolean
  provider?: string
  live?: boolean
  configured?: boolean
}

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) || ''

async function fetchProvider(path: string): Promise<ProviderPayload | null> {
  try {
    const res = await fetch(`${API_BASE}${path}`)
    if (!res.ok) return null
    return (await res.json()) as ProviderPayload
  } catch {
    return null
  }
}

/** Honest label when screening/e-sign runs in demo/mock mode. */
export function ProviderBadge({
  kind,
  className,
}: {
  kind: 'screening' | 'esign'
  className?: string
}) {
  const [info, setInfo] = useState<ProviderPayload | null>(null)

  useEffect(() => {
    const path = kind === 'screening' ? '/api/screening/provider' : '/api/esign/provider'
    void fetchProvider(path).then(setInfo)
  }, [kind])

  if (!info) return null
  const mock = info.provider === 'mock' || info.live === false
  if (!mock) return null

  return (
    <Badge tone="neutral" className={className} data-testid={`provider-badge-${kind}`}>
      {kind === 'screening' ? 'Screening' : 'E-sign'}: demo / manual ({info.provider ?? 'mock'})
    </Badge>
  )
}
