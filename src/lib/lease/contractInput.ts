import type { AppUser, Agency, PropertyAsset, Tenancy } from '../../types/domain'
import type { LeaseContractInput } from './leaseContract'

/** Everything the lease template needs, from the tenancy and the store. */
export function contractInputForTenancy(
  tenancy: Tenancy,
  ctx: { properties: PropertyAsset[]; users: AppUser[]; agencies: Agency[] },
): LeaseContractInput {
  const property = ctx.properties.find((p) => p.id === tenancy.propertyId)
  const agency = ctx.agencies.find((a) => a.id === tenancy.agencyId)
  const landlord = ctx.users.find((u) => u.id === tenancy.landlordId)
  const address = property
    ? [property.formattedAddress || property.address, property.suburb, property.city].filter(Boolean).join(', ')
    : 'Address to be confirmed'
  return {
    leaseReference: tenancy.id,
    agencyName: agency?.tradingAs || agency?.name || 'The managing agent',
    agencyContact: agency?.email || agency?.phone || null,
    landlordName: landlord?.name ?? null,
    tenantName: tenancy.tenantName,
    tenantEmail: tenancy.tenantEmail,
    propertyTitle: property?.title ?? tenancy.propertyId,
    propertyAddress: address,
    startDate: tenancy.startDate,
    endDate: tenancy.endDate,
    rent: tenancy.rent,
    deposit: tenancy.deposit,
    rentDueDay: tenancy.rentDueDay ?? 1,
    escalationPct: tenancy.billingSchedule?.escalationPct ?? null,
    parkingBays: property?.parking ?? null,
  }
}
