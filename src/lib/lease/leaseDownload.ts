import type { AppUser, Agency, PropertyAsset, Tenancy } from '../../types/domain'
import { contractInputForTenancy } from './contractInput'
import type { LeaseESignParty, LeasePdfSignature } from './types'

type Ctx = { properties: PropertyAsset[]; users: AppUser[]; agencies: Agency[] }

function sigFor(role: 'Tenant' | 'Landlord', name: string, p: LeaseESignParty | null | undefined, users: AppUser[]): LeasePdfSignature | null {
  if (!p || p.status !== 'signed') return null
  const by = p.signerUserId ? users.find((u) => u.id === p.signerUserId)?.name ?? null : null
  return {
    role,
    name,
    signedAt: p.signedAt ?? '',
    method: p.method ?? 'drawn',
    onBehalf: p.onBehalf,
    signedBy: by,
    imageDataUrl: p.signatureDataUrl ?? null,
    ip: p.ip ?? null,
    userAgent: p.userAgent ?? null,
    typedName: p.ectaConsent?.typedName ?? null,
    documentHash: p.ectaConsent?.documentHash ?? null,
    statements: p.ectaConsent?.statements ?? [],
  }
}

/** Build the lease PDF as it stands now (with every signature so far) and download it. */
export async function downloadLeasePdf(tenancy: Tenancy, ctx: Ctx): Promise<void> {
  const input = contractInputForTenancy(tenancy, ctx)
  const landlordName = input.landlordName ?? 'Landlord'
  const signatures = [
    sigFor('Tenant', tenancy.tenantName, tenancy.eSign?.tenant as LeaseESignParty | undefined, ctx.users),
    sigFor('Landlord', landlordName, tenancy.eSign?.landlord as LeaseESignParty | null | undefined, ctx.users),
  ].filter((s): s is LeasePdfSignature => Boolean(s))
  const { generateLeasePdf } = await import('./generateLeasePdf')
  const pdf = await generateLeasePdf({ ...input, tenancyId: tenancy.id, signatures })
  const a = document.createElement('a')
  a.href = pdf.dataUrl
  a.download = signatures.length ? pdf.fileName.replace('.pdf', '-signed.pdf') : pdf.fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
}
