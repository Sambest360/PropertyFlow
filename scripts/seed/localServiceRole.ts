import { execFileSync } from 'node:child_process'

const STATUS_KEYS = ['SERVICE_ROLE_KEY', 'SECRET_KEY'] as const

export class LocalServiceRoleError extends Error {
  constructor() {
    super(
      'No local service role key. Run `supabase status -o env` and export SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY.',
    )
    this.name = 'LocalServiceRoleError'
  }
}

/** Parse `supabase status -o env` text. Does not print the text. */
export function serviceRoleFromStatusEnv(text: string): string | undefined {
  const values = new Map<string, string>()
  for (const line of text.split('\n')) {
    const match = line.match(/^(?:export\s+)?([A-Z0-9_]+)=(.*)$/)
    if (!match) continue
    let value = match[2].trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (value) values.set(match[1], value)
  }
  for (const key of STATUS_KEYS) {
    const value = values.get(key)
    if (value) return value
  }
  return undefined
}

function readSupabaseStatusEnv(cwd: string): string | undefined {
  try {
    return execFileSync('supabase', ['status', '-o', 'env'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch {
    return undefined
  }
}

/**
 * Service role for the local seed. Env first. The status command runs only
 * when `allowStatusLookup` is true, which the seed script sets after the
 * localhost guard. The key is never written to the console.
 */
export function resolveLocalServiceRoleKey(options: {
  allowStatusLookup: boolean
  env?: NodeJS.ProcessEnv
  cwd?: string
  readStatus?: () => string | undefined
}): string {
  const env = options.env ?? process.env
  const fromEnv = env.SUPABASE_SECRET_KEY?.trim() || env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (fromEnv) return fromEnv
  if (!options.allowStatusLookup) throw new LocalServiceRoleError()
  const text = (options.readStatus ?? (() => readSupabaseStatusEnv(options.cwd ?? process.cwd())))()
  const fromStatus = text ? serviceRoleFromStatusEnv(text) : undefined
  if (fromStatus) return fromStatus
  throw new LocalServiceRoleError()
}
