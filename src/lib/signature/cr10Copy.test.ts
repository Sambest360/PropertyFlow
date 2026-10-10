import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * CR10 copy rule (Jim): only "signature", "electronic signature" or
 * "e-signature". Never advanced, AES, ECTA-valid, legally binding, certified
 * or qualified, in any CR10 file.
 */
export const CR10_FILES = [
  'src/lib/signature/signatureImage.ts',
  'src/lib/signature/downscale.ts',
  'src/pages/account/AccountSignaturePage.tsx',
  'src/lib/lease/signaturePrefill.ts',
  'src/components/lease/LeaseSignPanel.tsx',
  'src/components/lease/LeaseSignDialog.tsx',
  'server/leaseSign.ts',
  'src/lib/lease/signingRecord.ts',
  'src/lib/lease/providers.ts',
  'server/esignRoutes.ts',
  'src/lib/lease/signedCopy.ts',
  'src/components/lease/SignedCopyNote.tsx',
  'src/components/lease/LeaseSigningRecord.tsx',
]

const BANNED: Array<[string, RegExp]> = [
  ['advanced', /advanced/i],
  ['AES', /\bAES\b/],
  ['ECTA-valid', /ECTA[\s-]*valid/i],
  ['legally binding', /legally[\s-]+binding/i],
  ['certified', /certified/i],
  ['qualified', /qualified/i],
]

const root = resolve(__dirname, '../../..')

describe('CR10 banned signature words', () => {
  for (const file of CR10_FILES) {
    it(`${file} has none of the banned words`, () => {
      const text = readFileSync(resolve(root, file), 'utf8')
      for (const [word, re] of BANNED) {
        expect(re.test(text), `${file} contains "${word}"`).toBe(false)
      }
    })
  }
})
