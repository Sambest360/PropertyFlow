import { createClient } from '../../utils/supabase/client'
import { isSupabaseConfigured } from '../../utils/supabase/env'

/** Body is only the reference code. The caller attaches the bearer token. */
export function applicationReceivedNotifyRequest(referenceCode: string, accessToken: string) {
  return {
    url: '/api/notify/application-received',
    init: {
      method: 'POST' as const,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ referenceCode }),
    },
  }
}

export async function notifyApplicationReceived(
  referenceCode: string,
  deps?: {
    fetchImpl?: typeof fetch
    getAccessToken?: () => Promise<string | null>
  },
): Promise<void> {
  const token = deps?.getAccessToken
    ? await deps.getAccessToken()
    : await sessionAccessToken()
  if (!token) return
  const { url, init } = applicationReceivedNotifyRequest(referenceCode, token)
  const fetchImpl = deps?.fetchImpl ?? fetch
  await fetchImpl(url, init)
}

async function sessionAccessToken(): Promise<string | null> {
  if (!isSupabaseConfigured()) return null
  const { data } = await createClient().auth.getSession()
  return data.session?.access_token ?? null
}
