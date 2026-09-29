import { randomBytes } from 'node:crypto'

const MIN_LENGTH = 12

let cached: string | undefined

/**
 * Password for local seed accounts. Reads `SEED_USER_PASSWORD`.
 * When that is unset, generates a strong password and prints it once.
 */
export function resolveSeedPassword(): string {
  if (cached) return cached
  const fromEnv = process.env.SEED_USER_PASSWORD?.trim()
  if (fromEnv) {
    if (fromEnv.length < MIN_LENGTH) {
      throw new Error(
        `SEED_USER_PASSWORD must be at least ${MIN_LENGTH} characters. Refusing a short seed password.`,
      )
    }
    cached = fromEnv
    return cached
  }
  cached = randomBytes(24).toString('base64url')
  console.log(`SEED_USER_PASSWORD is unset. Generated local seed password (shown once): ${cached}`)
  return cached
}
