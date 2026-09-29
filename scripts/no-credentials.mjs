/**
 * No PayFast credentials in source.
 *
 * The retired merchant id, key, and passphrase are never stored here.
 * When PAYFAST_RETIRED_MERCHANT_ID, PAYFAST_RETIRED_MERCHANT_KEY, and/or
 * PAYFAST_RETIRED_PASSPHRASE are set, this hashes those env values with
 * SHA-256 and compares them to hashes of tokens in the tree (quoted
 * strings, words, base64 decodings, reversed strings, and short joins of
 * adjacent quoted strings). Unset variables are skipped.
 *
 * Separately, string literals for merchant_id, merchant_key, and passphrase
 * must be PayFast's published sandbox docs values or clearly fake placeholders.
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = process.cwd()

/** PayFast's published custom-integration example. Not PropertyFlow credentials. */
const PUBLIC_SANDBOX = new Set(['10000100', '46f0cd694581a', 'jt7NOE43FZPn'])

const TEXT_FILE = /\.(ts|tsx|js|jsx|mjs|cjs|json|css|html|map|svg|txt|md|sql)$/i
const SKIP_DIRS = new Set(['node_modules', '.git', 'coverage', '.vite', '.cache'])

const LITERAL_ASSIGNMENT =
  /(?:merchant_key|merchant_id|passphrase|merchantKey|merchantId|MERCHANT_KEY|MERCHANT_ID|PASSPHRASE|PAYFAST_MERCHANT_KEY|PAYFAST_MERCHANT_ID|PAYFAST_PASSPHRASE)\s*[:=]\s*(['"`])([^'"`]*)\1/g

export function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

export function retiredDigestsFromEnv(env = process.env) {
  const specs = [
    ['PAYFAST_RETIRED_MERCHANT_ID', 'merchant id'],
    ['PAYFAST_RETIRED_MERCHANT_KEY', 'merchant key'],
    ['PAYFAST_RETIRED_PASSPHRASE', 'passphrase'],
  ]
  const digests = []
  for (const [name, label] of specs) {
    const value = env[name]?.trim()
    if (!value) continue
    digests.push({ name, label, digest: sha256(value) })
  }
  return digests
}

export function retiredValuesFromEnv(env = process.env) {
  return [
    ['PAYFAST_RETIRED_MERCHANT_ID', 'merchant id'],
    ['PAYFAST_RETIRED_MERCHANT_KEY', 'merchant key'],
    ['PAYFAST_RETIRED_PASSPHRASE', 'passphrase'],
  ]
    .map(([name, label]) => {
      const value = env[name]?.trim()
      return value ? { name, label, value } : null
    })
    .filter(Boolean)
}

function isAllowedCredentialLiteral(value) {
  const trimmed = value.trim()
  if (!trimmed) return true
  if (PUBLIC_SANDBOX.has(trimmed)) return true
  if (trimmed === '10009999') return true
  if (/^(your-|example|fake|test|demo|placeholder|changeme|not-a-real|peach_demo|xxx+|deadbeef)/i.test(trimmed)) {
    return true
  }
  if (/sandbox|example\.com|yourdomain/i.test(trimmed)) return true
  if (/\s/.test(trimmed) && trimmed.split(/\s+/).length > 2) return true
  return false
}

function filesUnder(root) {
  if (!existsSync(root)) return []
  const out = []
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      if (SKIP_DIRS.has(name)) continue
      const path = join(dir, name)
      let st
      try {
        st = statSync(path)
      } catch {
        continue
      }
      if (st.isDirectory()) walk(path)
      else if (st.isFile() && st.size <= 2_000_000 && TEXT_FILE.test(name)) out.push(path)
    }
  }
  const st = statSync(root)
  if (st.isDirectory()) walk(root)
  else if (st.isFile()) out.push(root)
  return out
}

function isPrintableAscii(value) {
  if (!value) return false
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    const printable = code === 9 || code === 10 || code === 13 || (code >= 32 && code <= 126)
    if (!printable) return false
  }
  return true
}

function quotedStrings(text) {
  const values = []
  const re = /(['"`])((?:\\.|(?!\1)[^\\])*)\1/g
  let match
  while ((match = re.exec(text))) {
    const value = match[2].replace(/\\(.)/g, '$1')
    if (value.length >= 4 && value.length <= 200) values.push(value)
  }
  return values
}

function candidatesFromText(text) {
  const quoted = quotedStrings(text)
  const found = new Set(quoted)
  const words = text.match(/[A-Za-z0-9]{8,80}/g) ?? []
  for (const word of words) found.add(word)
  for (const value of quoted) {
    found.add(value.split('').reverse().join(''))
    if (/^[A-Za-z0-9+/]+={0,2}$/.test(value) && value.length >= 8 && value.length % 4 === 0) {
      const decoded = Buffer.from(value, 'base64').toString('utf8')
      if (isPrintableAscii(decoded)) found.add(decoded)
    }
  }
  for (const word of words) found.add(word.split('').reverse().join(''))
  for (let width = 2; width <= 6; width += 1) {
    for (let index = 0; index + width <= quoted.length; index += 1) {
      const joined = quoted.slice(index, index + width).join('')
      if (joined.length >= 8 && joined.length <= 200) found.add(joined)
    }
  }
  return found
}

export function scanCredentialPatterns(roots) {
  const hits = []
  for (const root of roots) {
    for (const path of filesUnder(root)) {
      let text
      try {
        text = readFileSync(path, 'utf8')
      } catch {
        continue
      }
      LITERAL_ASSIGNMENT.lastIndex = 0
      let match
      while ((match = LITERAL_ASSIGNMENT.exec(text))) {
        const value = match[2] ?? ''
        if (isAllowedCredentialLiteral(value)) continue
        hits.push(`${relative(ROOT, path)}: credential literal sha256=${sha256(value)}`)
      }
    }
  }
  return hits
}

export function scanRetiredDigests(roots, digests) {
  if (!digests.length) return []
  const wanted = new Map(digests.map((item) => [item.digest, item.label]))
  const hits = []
  for (const root of roots) {
    for (const path of filesUnder(root)) {
      let text
      try {
        text = readFileSync(path, 'utf8')
      } catch {
        continue
      }
      const seen = new Set()
      for (const candidate of candidatesFromText(text)) {
        const digest = sha256(candidate)
        const label = wanted.get(digest)
        if (!label || seen.has(label)) continue
        seen.add(label)
        hits.push(`${relative(ROOT, path)}: matches retired PayFast ${label}`)
      }
    }
  }
  return hits
}

export function credentialScanRoots() {
  const roots = ['src', 'server']
  if (existsSync(join(ROOT, 'dist'))) roots.push('dist')
  return roots
}
