/**
 * Secret scan.
 *
 *   npm run secrets:scan     current tree (gitleaks --no-git) plus a literal
 *                            check for PayFast values that must not ship.
 *                            Fails the process when it finds anything.
 *   npm run secrets:history  full git history. Prints findings and exits 0.
 *                            History is not rewritten.
 *
 * Gitleaks is downloaded into .cache/gitleaks when it is not on PATH.
 */
import { createHash } from 'node:crypto'
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = process.cwd()
const HISTORY = process.argv.includes('--history')
const GITLEAKS_VERSION = '8.28.0'
// Base64 so the retired PayFast literals are not stored in this file in clear text.
const FORBIDDEN = [
  'MTAwNDc3MTk=',
  'd2txOGRtZnlzYXUxcQ==',
  'UWpqQ0NOWjFWZ3RZYXhpdm1YT1dMbUFsdW5acFUwWGs=',
].map((value) => Buffer.from(value, 'base64').toString('utf8'))
const SKIP_DIRS = new Set([
  '.git',
  'node_modules',
  '.cache',
  'dist',
  'coverage',
  '.vite',
])

function walk(dir, hits) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue
    const path = join(dir, name)
    const st = statSync(path)
    if (st.isDirectory()) {
      walk(path, hits)
      continue
    }
    if (st.size > 2_000_000) continue
    let text
    try {
      text = readFileSync(path, 'utf8')
    } catch {
      continue
    }
    for (const needle of FORBIDDEN) {
      if (text.includes(needle)) hits.push(`${relative(ROOT, path)} contains ${needle}`)
    }
  }
}

function scanTree(label, dir) {
  if (!existsSync(dir)) {
    console.log(`${label}: skipped (missing)`)
    return []
  }
  const hits = []
  if (statSync(dir).isDirectory()) {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name)
      if (name === 'node_modules' || name === '.git') continue
      const st = statSync(path)
      if (st.isDirectory()) walk(path, hits)
      else {
        let text = ''
        try {
          text = readFileSync(path, 'utf8')
        } catch {
          continue
        }
        for (const needle of FORBIDDEN) {
          if (text.includes(needle)) hits.push(`${relative(ROOT, path)} contains ${needle}`)
        }
      }
    }
  }
  return hits
}

function gitleaksBin() {
  const fromEnv = process.env.GITLEAKS_BIN
  if (fromEnv && existsSync(fromEnv)) return fromEnv
  const onPath = spawnSync('gitleaks', ['version'], { encoding: 'utf8' })
  if (onPath.status === 0) return 'gitleaks'
  const destDir = join(ROOT, '.cache', 'gitleaks')
  const bin = join(destDir, 'gitleaks')
  if (existsSync(bin)) return bin
  mkdirSync(destDir, { recursive: true })
  const archive = `gitleaks_${GITLEAKS_VERSION}_linux_x64.tar.gz`
  const url = `https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}/${archive}`
  const tarPath = join(destDir, archive)
  console.log(`Downloading gitleaks ${GITLEAKS_VERSION}`)
  execFileSync('curl', ['-fsSL', '-o', tarPath, url], { stdio: 'inherit' })
  execFileSync('tar', ['-xzf', tarPath, '-C', destDir, 'gitleaks'], { stdio: 'inherit' })
  return bin
}

function runGitleaks(bin) {
  mkdirSync(join(ROOT, '.cache'), { recursive: true })
  const args = HISTORY
    ? ['detect', '--source', ROOT, '--config', join(ROOT, '.gitleaks.toml'), '--redact', '--report-format', 'json', '--report-path', join(ROOT, '.cache', 'gitleaks-history.json'), '--exit-code', '0']
    : ['detect', '--no-git', '--source', ROOT, '--config', join(ROOT, '.gitleaks.toml'), '--redact']
  const result = spawnSync(bin, args, { encoding: 'utf8' })
  if (result.stdout) process.stdout.write(result.stdout)
  if (result.stderr) process.stderr.write(result.stderr)
  return result.status ?? 1
}

const literalHits = scanTree('source', ROOT)
const bundleHits = existsSync(join(ROOT, 'dist')) ? scanTree('dist', join(ROOT, 'dist')) : []
if (!existsSync(join(ROOT, 'dist'))) console.log('dist: not built; bundle scan skipped')

if (!HISTORY && (literalHits.length || bundleHits.length)) {
  console.error('Forbidden PayFast values found:')
  for (const hit of [...literalHits, ...bundleHits]) console.error(`  ${hit}`)
  process.exit(1)
}

const bin = gitleaksBin()
const status = runGitleaks(bin)
if (!HISTORY && existsSync(join(ROOT, 'dist'))) {
  const bundle = spawnSync(
    bin,
    [
      'detect',
      '--no-git',
      '--source',
      join(ROOT, 'dist'),
      '--config',
      join(ROOT, '.gitleaks.toml'),
      '--redact',
    ],
    { encoding: 'utf8' },
  )
  if (bundle.stdout) process.stdout.write(bundle.stdout)
  if (bundle.stderr) process.stderr.write(bundle.stderr)
  if ((bundle.status ?? 1) !== 0) process.exit(bundle.status ?? 1)
}
if (HISTORY) {
  const reportPath = join(ROOT, '.cache', 'gitleaks-history.json')
  let findings = []
  if (existsSync(reportPath)) {
    try {
      findings = JSON.parse(readFileSync(reportPath, 'utf8'))
    } catch {
      findings = []
    }
  }
  const summary = findings.map((f) => ({
    rule: f.RuleID,
    file: f.File,
    commit: f.Commit,
    date: f.Date,
    fingerprint: f.Fingerprint ? createHash('sha256').update(f.Fingerprint).digest('hex').slice(0, 12) : undefined,
  }))
  writeFileSync(join(ROOT, '.cache', 'gitleaks-history-summary.json'), JSON.stringify(summary, null, 2))
  console.log(`Gitleaks history findings: ${findings.length} (secrets redacted; history was not rewritten)`)
  const files = [...new Set(summary.map((f) => `${f.commit?.slice(0, 10) ?? '?'} ${f.file}`))]
  for (const line of files) console.log(`  ${line}`)

  // Default gitleaks rules do not treat a merchant id or passphrase as a
  // credential. Search history for the retired PayFast literals directly.
  // The values are decoded at runtime and are not printed.
  console.log('Retired PayFast literal history (git log -S, values not printed):')
  for (const [index, needle] of FORBIDDEN.entries()) {
    const log = spawnSync(
      'git',
      ['log', '--all', '-S', needle, '--pretty=format:%H %ad %s', '--date=short'],
      { cwd: ROOT, encoding: 'utf8' },
    )
    const lines = (log.stdout || '').split('\n').filter(Boolean)
    console.log(`  literal ${index + 1}: ${lines.length ? lines.join(' | ') : 'not found'}`)
  }
  process.exit(0)
}

if (bundleHits.length) process.exit(1)
process.exit(status ?? 0)
