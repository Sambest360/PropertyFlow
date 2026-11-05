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

/** Names the external screening / e-sign provider when one is connected. */
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

  // In-app ECTA signing and off-system credit checks are how the system works,
  // so there is nothing to flag: only an external provider's live state shows.
  if (!info || info.provider === 'mock' || info.live === false) return null

  return (
    <Badge tone="neutral" className={className} data-testid={`provider-badge-${kind}`}>
      {kind === 'screening' ? 'Screening' : 'E-sign'}: {info.provider}
    </Badge>
  )
}
