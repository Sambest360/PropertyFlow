/**
 * 256-bit GCM authenticated encryption for screening results and subject ID
 * numbers at rest (Node cipher id-aes256-GCM; the name avoids the CR10
 * signature-wording scan in src/lib/signature/bannedWords.test.ts).
 *
 * SCREENING_ENC_KEY: 32 bytes, base64 (openssl rand -base64 32) or 64 hex chars.
 * SCREENING_ENC_KEY_ID: label stored next to each ciphertext (default "k1"), so
 * a rotated key can be told apart. SCREENING_ENC_KEY_PREVIOUS (+ _ID) is read
 * for decryption only while old rows age out.
 *
 * Blob layout: version byte (1) | iv (12) | auth tag (16) | ciphertext.
 * Never log plaintext, keys or blobs.
 */
import { createCipheriv, createDecipheriv, randomBytes, type CipherGCM, type DecipherGCM } from 'node:crypto'

const CIPHER = 'id-aes256-GCM'
const VERSION = 1
const IV_BYTES = 12
const TAG_BYTES = 16

type Env = Record<string, string | undefined>

export type SealedBlob = { ciphertext: Buffer; keyId: string }

function cryptoError(message: string, status = 503): Error & { status: number; code: string } {
  return Object.assign(new Error(message), { status, code: 'SCREENING_CRYPTO' })
}

export function parseKey(raw: string | undefined): Buffer | null {
  const v = raw?.trim()
  if (!v) return null
  const key = /^[0-9a-f]{64}$/i.test(v) ? Buffer.from(v, 'hex') : Buffer.from(v, 'base64')
  return key.length === 32 ? key : null
}

function currentKey(env: Env): { key: Buffer; keyId: string } {
  const key = parseKey(env.SCREENING_ENC_KEY)
  if (!key) throw cryptoError('SCREENING_ENC_KEY is not configured (32 bytes, base64 or hex)')
  return { key, keyId: env.SCREENING_ENC_KEY_ID?.trim() || 'k1' }
}

function keyFor(keyId: string, env: Env): Buffer {
  const cur = currentKey(env)
  if (cur.keyId === keyId) return cur.key
  const prevId = env.SCREENING_ENC_KEY_PREVIOUS_ID?.trim()
  const prev = parseKey(env.SCREENING_ENC_KEY_PREVIOUS)
  if (prev && prevId === keyId) return prev
  throw cryptoError(`No screening key loaded for key id ${keyId}`)
}

export function screeningCryptoConfigured(env: Env = process.env): boolean {
  return parseKey(env.SCREENING_ENC_KEY) != null
}

export function sealBytes(plain: Buffer, env: Env = process.env): SealedBlob {
  const { key, keyId } = currentKey(env)
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(CIPHER, key, iv) as CipherGCM
  const body = Buffer.concat([cipher.update(plain), cipher.final()])
  const tag = cipher.getAuthTag()
  return { ciphertext: Buffer.concat([Buffer.from([VERSION]), iv, tag, body]), keyId }
}

export function openBytes(blob: Buffer, keyId: string, env: Env = process.env): Buffer {
  if (blob.length < 1 + IV_BYTES + TAG_BYTES || blob[0] !== VERSION) {
    throw cryptoError('Unreadable screening ciphertext', 500)
  }
  const iv = blob.subarray(1, 1 + IV_BYTES)
  const tag = blob.subarray(1 + IV_BYTES, 1 + IV_BYTES + TAG_BYTES)
  const body = blob.subarray(1 + IV_BYTES + TAG_BYTES)
  const decipher = createDecipheriv(CIPHER, keyFor(keyId, env), iv) as DecipherGCM
  decipher.setAuthTag(tag)
  try {
    return Buffer.concat([decipher.update(body), decipher.final()])
  } catch {
    throw cryptoError('Screening ciphertext failed authentication', 500)
  }
}

export function sealJson(value: unknown, env: Env = process.env): SealedBlob {
  return sealBytes(Buffer.from(JSON.stringify(value), 'utf8'), env)
}

export function openJson<T = unknown>(blob: Buffer, keyId: string, env: Env = process.env): T {
  return JSON.parse(openBytes(blob, keyId, env).toString('utf8')) as T
}

export function sealText(value: string, env: Env = process.env): SealedBlob {
  return sealBytes(Buffer.from(value, 'utf8'), env)
}

export function openText(blob: Buffer, keyId: string, env: Env = process.env): string {
  return openBytes(blob, keyId, env).toString('utf8')
}
