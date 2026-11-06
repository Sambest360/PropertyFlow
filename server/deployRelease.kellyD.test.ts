// Kelly PR D: release/update dist-next swap (D-S1 D-S2 D-R2) and README note.
import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { basename } from 'node:path'

const readDeploy = (p: string) => readFileSync(new URL(`../deploy/${p}`, import.meta.url), 'utf8')

const SOURCE_RE = /(?:^|\n)\s*(?:\.|source)\s+['"]?(deploy\/[A-Za-z0-9._-]+\.sh)/g

function sourcedFiles(script: string): string[] {
  return [...script.matchAll(SOURCE_RE)].map((m) => m[1])
}

function loadSwapSources(): { release: string; update: string; snippet: string; combined: string; snippetName: string } {
  const release = readDeploy('release.sh')
  const update = readDeploy('update.sh')
  const releaseFiles = sourcedFiles(release)
  const updateFiles = sourcedFiles(update)
  const common = releaseFiles.filter((f) => updateFiles.includes(f))
  expect(common.length, 'release.sh and update.sh must source the same deploy/*.sh snippet').toBeGreaterThan(0)
  const snippetName = common[0]
  const snippet = readDeploy(basename(snippetName))
  return { release, update, snippet, snippetName, combined: `${release}\n${update}\n${snippet}` }
}

function uncommentedLines(src: string): string[] {
  return src.split('\n').filter((l) => !/^\s*#/.test(l))
}

describe('Kelly PR D release/update shared swap (D-S1 D-S2 D-R2)', () => {
  it('both scripts source the same deploy/*.sh snippet (Jim D-3)', () => {
    const { snippetName, snippet } = loadSwapSources()
    expect(snippetName.startsWith('deploy/')).toBe(true)
    expect(snippet.length).toBeGreaterThan(0)
    expect(existsSync(new URL(`../${snippetName}`, import.meta.url))).toBe(true)
  })

  it('D-S1 vite build uses dist-next / BUILD_OUT_DIR (mutant: raw npx vite build into default outDir)', () => {
    const { combined } = loadSwapSources()
    const viteLines = uncommentedLines(combined).filter((l) => /npx vite build/.test(l))
    expect(viteLines.length, 'expected a vite build invocation').toBeGreaterThan(0)
    for (const line of viteLines) {
      expect(line, line).toMatch(/BUILD_OUT_DIR=dist-next|--outDir\s+dist-next/)
    }
    // update.sh itself must not keep a default-outDir build
    const updateVite = uncommentedLines(readDeploy('update.sh')).filter((l) => /npx vite build/.test(l))
    for (const line of updateVite) {
      expect(line, `update.sh: ${line}`).toMatch(/BUILD_OUT_DIR=dist-next|--outDir\s+dist-next/)
    }
  })

  it('D-S2 scripts copy old assets then swap directories; they do not empty live dist/ in place', () => {
    const { snippet } = loadSwapSources()
    expect(snippet).toMatch(/cp -rpn dist\/assets/)
    expect(snippet).toMatch(/rm -rf dist-prev/)
    expect(snippet).toMatch(/mv\s+dist\s+dist-prev/)
    expect(snippet).toMatch(/mv\s+dist-next\s+dist/)
    // Verify the new tree before any rename (Jim Q1.4)
    expect(snippet).toMatch(/dist-next\/index\.html/)
    expect(snippet).toMatch(/dist-next\/assets/)
  })

  it('D-R2 rm -rf dist-prev happens before the first mv; second mv rolls back dist-prev if it fails (mutant: bare two-step mv)', () => {
    const { snippet } = loadSwapSources()
    const prevRm = snippet.indexOf('rm -rf dist-prev')
    const firstMv = snippet.search(/mv\s+dist\s+dist-prev/)
    const secondMv = snippet.search(/mv\s+dist-next\s+dist/)
    expect(prevRm, 'must keep rm -rf dist-prev').toBeGreaterThanOrEqual(0)
    expect(firstMv, 'must mv dist dist-prev').toBeGreaterThan(prevRm)
    expect(secondMv, 'must mv dist-next dist').toBeGreaterThan(firstMv)
    // Explicit failure check so set -e cannot skip rollback
    expect(snippet).toMatch(/if\s+!\s*mv\s+dist-next\s+dist/)
    const rollback = snippet.search(/mv\s+dist-prev\s+dist/)
    expect(rollback, 'must restore dist-prev -> dist').toBeGreaterThan(secondMv)
    expect(snippet).toMatch(/exit 1/)
  })

  it('release.sh pm2 restart order is unchanged (backup, pull, migrate, build/swap, crons, pm2 restart --update-env)', () => {
    const release = readDeploy('release.sh')
    const order = [
      release.search(/bash deploy\/backup\.sh/),
      release.search(/git pull --ff-only/),
      release.search(/== Migrations/),
      release.search(/propertyflow_build_and_swap_dist|\. deploy\/|source deploy\//),
      release.search(/bash deploy\/crons\.sh/),
      release.search(/pm2 restart propertyflow-api --update-env/),
    ]
    expect(order.every((i) => i >= 0), `missing step in release.sh: ${order}`).toBe(true)
    for (let i = 1; i < order.length; i++) expect(order[i]).toBeGreaterThan(order[i - 1])
    const update = readDeploy('update.sh')
    expect(update).toMatch(/pm2 restart propertyflow-api/)
    expect(update).not.toMatch(/pm2 restart propertyflow-api --update-env/)
    expect(update).not.toMatch(/bash deploy\/backup\.sh/)
    expect(update).not.toMatch(/== Migrations/)
  })
})

describe('Kelly PR D README certbot drift note', () => {
  it('tells the operator to re-check /assets/ =404 and location = /index.html after certbot', () => {
    const readme = readDeploy('README.md')
    expect(readme).toMatch(/certbot/)
    expect(readme).toMatch(/\/assets\//)
    expect(readme).toMatch(/try_files \$uri =404|=404/)
    expect(readme).toMatch(/location = \/index\.html/)
  })
})

describe('Kelly PR D R1 main.tsx listener (scan)', () => {
  it('D-R1 main.tsx still listens for vite:preloadError and delegates to the in-memory guard helper', () => {
    const src = readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8')
    expect(src).toMatch(/addEventListener\(\s*['"]vite:preloadError['"]/)
    expect(src).toMatch(/handleVitePreloadError/)
  })
})
