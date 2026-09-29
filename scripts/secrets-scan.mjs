/**
 * Secret scan.
 *
 *   npm run secrets:scan     gitleaks on the current tree, plus a credential
 *                            check of src/, server/, and dist/ (when built).
 *                            PayFast's published docs merchant key and
 *                            passphrase are rejected by SHA-256 digest.
 *                            Retired PayFast values are not stored in this
 *                            repo. Set PAYFAST_RETIRED_MERCHANT_ID,
 *                            PAYFAST_RETIRED_MERCHANT_KEY, and
 *                            PAYFAST_RETIRED_PASSPHRASE to compare those
 *                            SHA-256 digests too. That extra check is skipped
 *                            when unset.
 *   npm run secrets:history  full git history. Prints findings and exits 0.
 *                            History is not rewritten. The retired-literal
 *                            search runs only when those env vars are set,
 *                            and it does not print the values.
 *
 * Gitleaks is downloaded into .cache/gitleaks when it is not on PATH.
 */
import { createHash } from 'node:crypto'
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  PAYFAST_DOCS_VECTOR_DIGESTS,
  credentialScanRoots,
  retiredDigestsFromEnv,
  retiredValuesFromEnv,
  scanCredentialPatterns,
  scanRetiredDigests,
} from './no-credentials.mjs'

const ROOT = process.cwd()
const HISTORY = process.argv.includes('--history')
const GITLEAKS_VERSION = '8.28.0'

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

const roots = credentialScanRoots()
if (!existsSync(join(ROOT, 'dist'))) console.log('dist: not built; bundle scan skipped')
const patternHits = scanCredentialPatterns(roots)
const retiredDigests = retiredDigestsFromEnv()
const digestHits = [
  ...scanRetiredDigests(['.'], PAYFAST_DOCS_VECTOR_DIGESTS),
  ...(retiredDigests.length ? scanRetiredDigests(roots, retiredDigests) : []),
]
if (!retiredDigests.length) {
  console.log(
    'Retired PayFast digest check skipped (set PAYFAST_RETIRED_MERCHANT_ID, PAYFAST_RETIRED_MERCHANT_KEY, and PAYFAST_RETIRED_PASSPHRASE to compare SHA-256 digests)',
  )
}

if (!HISTORY && (patternHits.length || digestHits.length)) {
  console.error('PayFast credential check failed:')
  for (const hit of [...patternHits, ...digestHits]) console.error(`  ${hit}`)
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

  const retired = retiredValuesFromEnv()
  if (!retired.length) {
    console.log('Retired PayFast history search skipped (PAYFAST_RETIRED_* unset). Values are not stored in the repo.')
  } else {
    console.log('Retired PayFast literal history (git log -S, values not printed):')
    for (const item of retired) {
      const log = spawnSync(
        'git',
        ['log', '--all', '-S', item.value, '--pretty=format:%H %ad %s', '--date=short'],
        { cwd: ROOT, encoding: 'utf8' },
      )
      const lines = (log.stdout || '').split('\n').filter(Boolean)
      console.log(`  ${item.label}: ${lines.length ? lines.join(' | ') : 'not found'}`)
    }
  }
  process.exit(0)
}

process.exit(status ?? 0)
