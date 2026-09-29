/**
 * Application create goes to the Hono route `POST /api/applications` when
 * `VITE_ENABLE_API` is on. That route upserts the application and sends the
 * application-received email. There is no notify call.
 *
 * When the flag is off, the caller keeps the direct Supabase write. That mode
 * does not send the application-received email.
 */
import { createClient } from '../../utils/supabase/client'
import { isSupabaseConfigured } from '../../utils/supabase/env'

/** `'1'` and `'true'` turn the flag on. Unset, `'0'`, and any other value stay off. */
export function viteEnableApiIsOn(
  flag: string | undefined = import.meta.env.VITE_ENABLE_API,
): boolean {
  return flag === '1' || flag === 'true'
}

export function applicationCreateRequest(
  application: Record<string, unknown>,
  accessToken: string,
  apiBase = '',
) {
  return {
    url: `${apiBase}/api/applications`,
    init: {
      method: 'POST' as const,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(application),
    },
  }
}

export async function submitApplicationViaApi(
  application: Record<string, unknown>,
  deps?: {
    fetchImpl?: typeof fetch
    getAccessToken?: () => Promise<string | null>
    apiBase?: string
  },
): Promise<void> {
  const id = application.id
  if (typeof id !== 'string' || !id) {
    console.warn('[application-create] missing id; application was not sent to the API')
    return
  }

  const token = deps?.getAccessToken ? await deps.getAccessToken() : await sessionAccessToken()
  if (!token) {
    console.warn('[application-create] no session; application was not sent to the API')
    return
  }

  const base = deps?.apiBase ?? ((import.meta.env.VITE_API_BASE as string | undefined) || '')
  const { url, init } = applicationCreateRequest(application, token, base)
  const fetchImpl = deps?.fetchImpl ?? fetch
  const res = await fetchImpl(url, init)
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    console.warn('[application-create]', res.status, text)
  }
}

async function sessionAccessToken(): Promise<string | null> {
  if (!isSupabaseConfigured()) return null
  const { data } = await createClient().auth.getSession()
  return data.session?.access_token ?? null
}
