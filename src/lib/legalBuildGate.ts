import { LEGAL_ENTITY, legalEntityMissing, type RequiredLegalField } from './legalEntity.ts'

export type LegalBuildGateAction = 'pass' | 'warn' | 'fail'

export interface LegalBuildGateResult {
  action: LegalBuildGateAction
  missing: RequiredLegalField[]
  message: string
}

/**
 * T6 release gate (spec T6, Jim sign-off C14/Q1/Q2). Pure: no IO, no process access.
 *
 * Fails ONLY the live deploy build: mode === 'production' AND PF_LIVE_BUILD === '1'
 * exactly. Every `vite build` without --mode is production (every PR's
 * `npm run build` too), so mode alone cannot mark a live build. Everything else
 * only warns. Nothing in this repo sets PF_LIVE_BUILD yet: deploy/update.sh gets
 * `export PF_LIVE_BUILD=1` in a separate, last PR once Samuel's values are in.
 */
export function legalBuildGate({
  mode,
  env,
  entity = LEGAL_ENTITY,
}: {
  mode: string
  env: Record<string, string | undefined>
  entity?: Record<string, string>
}): LegalBuildGateResult {
  const missing = legalEntityMissing(entity)
  if (missing.length === 0) return { action: 'pass', missing, message: '' }

  const live = mode === 'production' && env.PF_LIVE_BUILD === '1'
  const what =
    `Legal company details missing or placeholder in src/lib/legalEntity.ts: ${missing.join(', ')}. ` +
    'The /privacy and /terms pages show "to be confirmed" for these. Samuel supplies the values.'
  if (live) return { action: 'fail', missing, message: `${what} Live deploy build (PF_LIVE_BUILD=1) stopped.` }
  // Say exactly why this build is not live (Jim #118 C8): the mode, the flag, or both.
  const flagSet = env.PF_LIVE_BUILD === '1'
  const why =
    mode !== 'production'
      ? `mode is "${mode}", not production${flagSet ? ' (PF_LIVE_BUILD=1 only stops a production build)' : ''}`
      : 'PF_LIVE_BUILD is not "1"'
  return { action: 'warn', missing, message: `[legal] ${what} Warning only, not a live deploy build: ${why}.` }
}
