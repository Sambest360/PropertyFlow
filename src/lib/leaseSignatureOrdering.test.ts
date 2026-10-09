import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  LEASE_SIGNATURE_NOT_RECORDED,
  LEASE_SIGNATURE_NOT_RECORDED_MESSAGE,
  leaseSignatureSaved,
} from './leaseSignatureOrdering'
import { persistRefusalMessage } from './api/persistRefusal'

/** Angela #80 (3fea603): the Sign lease application write waits for the lease save. */
function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

/** The advanceApplicationWorkflow signing sequence, with the two writes recorded. */
async function signThenAdvance(leaseSave: Promise<boolean>, log: string[]) {
  log.push('lease write sent')
  const notRecorded = await leaseSignatureSaved(leaseSave)
  if (notRecorded) return notRecorded
  log.push('application write sent')
  return null
}

describe('Sign lease: application write after the lease save', () => {
  it('the application write is not sent until the lease save has succeeded', async () => {
    const log: string[] = []
    const lease = deferred<boolean>()
    const run = signThenAdvance(lease.promise, log)
    await new Promise((r) => setTimeout(r, 10))
    expect(log).toEqual(['lease write sent'])
    lease.resolve(true)
    await expect(run).resolves.toBeNull()
    expect(log).toEqual(['lease write sent', 'application write sent'])
  })

  it('a failed or rejected lease save never sends the application write', async () => {
    for (const settle of [(d: ReturnType<typeof deferred<boolean>>) => d.resolve(false), (d: ReturnType<typeof deferred<boolean>>) => d.reject(new Error('net'))]) {
      const log: string[] = []
      const lease = deferred<boolean>()
      const run = signThenAdvance(lease.promise, log)
      settle(lease)
      await expect(run).resolves.toEqual({ code: LEASE_SIGNATURE_NOT_RECORDED, error: LEASE_SIGNATURE_NOT_RECORDED_MESSAGE })
      expect(log).toEqual(['lease write sent'])
    }
  })

  it('no signature in this step: nothing to wait for', async () => {
    await expect(leaseSignatureSaved(null)).resolves.toBeNull()
  })

  it('AppStore advanceApplicationWorkflow awaits the lease save before the application write', () => {
    const src = readFileSync(new URL('../context/AppStore.tsx', import.meta.url), 'utf8')
    const start = src.indexOf('advanceApplicationWorkflow: async')
    const end = src.indexOf('patchApplicationStatus: async', start)
    const body = src.slice(start, end)
    const leaseWrite = body.indexOf("leaseSignSave = persistUpsert('tenancy'")
    const wait = body.indexOf('await leaseSignatureSaved(leaseSignSave)')
    const appWrite = body.indexOf("persistUpsert('application', applicationId, updated as unknown")
    expect(leaseWrite).toBeGreaterThan(0)
    expect(wait).toBeGreaterThan(leaseWrite)
    expect(appWrite).toBeGreaterThan(wait)
  })

  it('the signing refusal says what happened and what to do next', () => {
    expect(LEASE_SIGNATURE_NOT_RECORDED_MESSAGE).toMatch(/signature wasn't recorded yet/)
    expect(LEASE_SIGNATURE_NOT_RECORDED_MESSAGE).toMatch(/wasn't moved to signed/)
    expect(LEASE_SIGNATURE_NOT_RECORDED_MESSAGE).toMatch(/sign the lease again/)
    expect(
      persistRefusalMessage({ resource: 'application', id: 'A', action: 'upsert', status: 403, code: LEASE_SIGNATURE_NOT_RECORDED, message: '' }),
    ).toBe(LEASE_SIGNATURE_NOT_RECORDED_MESSAGE)
  })
})
