/**
 * The full Lekaya residential lease (South Africa). One source for the
 * on-screen lease, the PDF and the document fingerprint each signer agrees to.
 *
 * Written for the Rental Housing Act 50 of 1999, the Consumer Protection Act
 * 68 of 2008 (fixed-term leases, s14), the Protection of Personal Information
 * Act 4 of 2013 and the Electronic Communications and Transactions Act 25 of
 * 2002 (electronic signatures, s13). It is a standard template: agencies
 * should have their attorney review it for their own needs.
 */

export const LEASE_TEMPLATE_VERSION = 'Lekaya residential lease 2026.10'

export type LeaseContractInput = {
  leaseReference: string
  agencyName: string
  agencyContact?: string | null
  landlordName: string | null
  tenantName: string
  tenantEmail: string
  tenantIdNumber?: string | null
  propertyTitle: string
  propertyAddress: string
  startDate: string
  endDate: string | null
  rent: number
  deposit: number
  rentDueDay?: number | null
  escalationPct?: number | null
  occupants?: string | null
  petsAllowed?: boolean | null
  parkingBays?: number | null
}

export type LeaseSection = { title: string; clauses: string[] }

export type LeaseContract = {
  title: string
  reference: string
  version: string
  summary: Array<[string, string]>
  sections: LeaseSection[]
}

const zar = (n: number) => `R ${n.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`
}

export function buildLeaseContract(i: LeaseContractInput): LeaseContract {
  const landlord = i.landlordName?.trim() || 'the owner of the Premises, represented by the Agent'
  const due = Math.min(Math.max(i.rentDueDay ?? 1, 1), 28)
  const term = i.endDate
    ? `This lease starts on ${i.startDate} and ends on ${i.endDate} (the "fixed term").`
    : `This lease starts on ${i.startDate} and continues month to month until either party ends it on one calendar month's written notice.`
  const escalation =
    i.escalationPct && i.escalationPct > 0
      ? `The rent increases by ${i.escalationPct}% on each anniversary of the start date. The Tenant will be told the new amount at least 60 days before it applies.`
      : 'The rent stays the same for the fixed term. Any increase on renewal is agreed in writing before it applies.'

  const sections: LeaseSection[] = [
    {
      title: '1. Parties and interpretation',
      clauses: [
        `This lease is between ${landlord} (the "Landlord") and ${i.tenantName} (the "Tenant"). ${i.agencyName} (the "Agent") manages the Premises for the Landlord and may act for the Landlord under this lease.`,
        'Headings are for convenience only. Words in the singular include the plural. "Days" means calendar days and "business days" excludes weekends and South African public holidays.',
        'Where the Tenant is more than one person, each is jointly and severally liable for all obligations under this lease.',
      ],
    },
    {
      title: '2. The Premises',
      clauses: [
        `The Landlord lets to the Tenant ${i.propertyTitle}, ${i.propertyAddress} (the "Premises"), together with the fixtures, fittings and any items listed in the inventory${i.parkingBays ? ` and ${i.parkingBays} parking bay${i.parkingBays === 1 ? '' : 's'}` : ''}.`,
        `The Premises may be used only as a private home by the Tenant${i.occupants ? ` and these occupants: ${i.occupants}` : ' and their immediate household'}. No business may be run from the Premises without the Landlord's written consent.`,
      ],
    },
    {
      title: '3. Term',
      clauses: [
        term,
        'Under section 14 of the Consumer Protection Act, the Agent will remind the Tenant 40 to 80 business days before the fixed term ends that it is ending and what happens next. If neither party ends the lease, it continues month to month on the same terms, unless new terms are agreed in writing.',
      ],
    },
    {
      title: '4. Rent and payment',
      clauses: [
        `The monthly rent is ${zar(i.rent)}, payable in advance on or before the ${ordinal(due)} day of each month, without deduction, into the account the Agent gives in writing. The rent for a part month is calculated pro rata.`,
        escalation,
        'Rent paid late may attract interest at the prime rate plus 2% a year from the due date until paid. The Tenant must keep proof of every payment and may upload it on the Lekaya Rentals portal.',
        'Payments are allocated first to legal costs and interest owed, then to arrear rent, then to current rent.',
      ],
    },
    {
      title: '5. Deposit',
      clauses: [
        `Before taking occupation the Tenant pays a deposit of ${zar(i.deposit)}. As required by section 5(3) of the Rental Housing Act, the deposit is held in an interest-bearing account with a financial institution, and the interest accrues to the Tenant. The Tenant may ask for written proof of the interest earned.`,
        'The deposit is not rent and may not be used by the Tenant as the last month’s rent.',
        'When the lease ends, the Landlord may deduct from the deposit and its interest any rent owed and the reasonable cost of repairing damage beyond fair wear and tear found at the outgoing inspection, and must give the Tenant the receipts or invoices for those repairs.',
        'The balance is refunded within 7 days of the end of the lease if nothing is owed, within 14 days of restoring the Premises if deductions are made, or within 21 days if the Tenant does not attend the outgoing inspection, as set out in the Rental Housing Act.',
      ],
    },
    {
      title: '6. Inspections',
      clauses: [
        'Before the Tenant moves in, the Tenant and the Landlord (or the Agent) inspect the Premises together and record any defects in a signed inspection report, which forms part of this lease.',
        'Within the 3 days before the lease ends, they inspect the Premises together again. If the Landlord fails to arrange the joint inspection, the Premises are taken to be in good order and the full deposit and interest must be refunded.',
        'The Landlord or the Agent may inspect the Premises during the lease at reasonable times on at least 24 hours’ notice, and may show the Premises to prospective tenants or buyers in the last two months of the lease.',
      ],
    },
    {
      title: '7. Utilities and charges',
      clauses: [
        'Unless agreed otherwise in writing, the Tenant pays for electricity and water used at the Premises (as metered or as billed by the municipality or body corporate), and for telephone, internet and television services.',
        'The Landlord pays rates and taxes, building insurance and, where applicable, body corporate or homeowners’ association levies.',
      ],
    },
    {
      title: '8. Maintenance and repairs',
      clauses: [
        'The Landlord keeps the Premises in a condition fit for living in and maintains the structure, roof, plumbing, electrical installation and geyser, except where damage is caused by the Tenant, their household or visitors.',
        'The Tenant keeps the Premises clean and in good order, replaces light bulbs, fuses and batteries, keeps drains clear and does not make alterations, paint, or install fittings without the Landlord’s written consent.',
        'The Tenant reports faults promptly through the Lekaya Rentals portal. In an emergency the Tenant may take reasonable steps to limit the damage and must tell the Agent at once.',
      ],
    },
    {
      title: '9. Conduct and house rules',
      clauses: [
        'The Tenant, their household and visitors may not cause a nuisance, break any law or the rules of the body corporate, homeowners’ association or complex, which form part of this lease.',
        i.petsAllowed
          ? 'Pets are allowed with the Agent’s written approval of each animal. The Tenant is responsible for any damage or nuisance the pets cause.'
          : 'No pets may be kept at the Premises without the Landlord’s prior written consent.',
        'The Tenant may not sublet, cede or assign this lease, or give occupation to anyone else, without the Landlord’s prior written consent.',
      ],
    },
    {
      title: '10. Insurance and risk',
      clauses: [
        'The Landlord insures the building. The Tenant is responsible for insuring their own belongings. The Landlord is not liable for loss of or damage to the Tenant’s property unless caused by the Landlord’s negligence.',
      ],
    },
    {
      title: '11. Breach and cancellation',
      clauses: [
        'If either party breaches this lease and does not remedy the breach within 20 business days of written notice, the other party may cancel the lease, without limiting any other right they have in law.',
        'If the Tenant fails to pay rent when due and does not pay within 7 days of written notice, the Landlord may cancel the lease, subject to the Prevention of Illegal Eviction from and Unlawful Occupation of Land Act 19 of 1998. The Tenant may only be evicted by order of a court.',
        'Under section 14 of the Consumer Protection Act, the Tenant may cancel a fixed-term lease on 20 business days’ written notice. The Landlord may then charge a reasonable cancellation penalty, as allowed by the Act and its regulations.',
      ],
    },
    {
      title: '12. End of the lease',
      clauses: [
        'When the lease ends the Tenant returns the Premises, all keys, remotes and access cards in the same condition as at the start, apart from fair wear and tear.',
        'If the Tenant stays on after the lease ends without a new agreement, the Tenant is liable for damages equal to the rent for each month or part of a month of occupation.',
      ],
    },
    {
      title: '13. Personal information',
      clauses: [
        'The Landlord and the Agent process the Tenant’s personal information only to manage this lease, collect payments, maintain the Premises and meet legal duties, as required by the Protection of Personal Information Act 4 of 2013. It may be shared with the Landlord, contractors doing work at the Premises and, if rent is unpaid, credit bureaus and debt collectors.',
      ],
    },
    {
      title: '14. Notices and electronic communication',
      clauses: [
        `Each party chooses the address of the Premises (Tenant) and the address the Agent gives in writing (Landlord) for legal notices. Notices may also be sent by email to ${i.tenantEmail} (Tenant) or through the Lekaya Rentals portal${i.agencyContact ? `, or to the Agent at ${i.agencyContact}` : ''}.`,
        'The parties agree to communicate and to conclude and sign this lease electronically. An electronic signature on this lease is valid and binding as provided in section 13 of the Electronic Communications and Transactions Act 25 of 2002, and the electronic record of this lease and its signatures is admissible as evidence (section 15).',
      ],
    },
    {
      title: '15. Disputes',
      clauses: [
        'The parties will first try to settle any dispute between themselves. Either party may refer a dispute to the Rental Housing Tribunal of the province where the Premises are, which helps landlords and tenants free of charge.',
      ],
    },
    {
      title: '16. Whole agreement',
      clauses: [
        'This lease, the inspection reports and any house rules are the whole agreement between the parties. Changes are only valid if in writing and signed (including electronically) by both parties. No relaxation by either party waives their rights.',
      ],
    },
  ]

  return {
    title: 'Residential lease agreement',
    reference: i.leaseReference,
    version: LEASE_TEMPLATE_VERSION,
    summary: [
      ['Landlord', i.landlordName?.trim() || 'Represented by the Agent'],
      ['Managing agent', i.agencyName],
      ['Tenant', `${i.tenantName} (${i.tenantEmail})`],
      ['Premises', `${i.propertyTitle}, ${i.propertyAddress}`],
      ['Start', i.startDate],
      ['End', i.endDate ?? 'Month to month'],
      ['Monthly rent', zar(i.rent)],
      ['Deposit', zar(i.deposit)],
      ['Rent due', `${ordinal(due)} of each month`],
    ],
    sections,
  }
}

/** The exact text signers agree to; its SHA-256 is recorded with each signature. */
export function leaseContractText(c: LeaseContract): string {
  return [
    `${c.title.toUpperCase()} — ${c.reference} — ${c.version}`,
    ...c.summary.map(([k, v]) => `${k}: ${v}`),
    ...c.sections.flatMap((s) => [s.title, ...s.clauses]),
  ].join('\n')
}

export async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/** "I agree" statements every electronic signer ticks (ECTA 25 of 2002). */
export function ectaStatements(signerName: string, onBehalf: boolean): Array<{ id: 'read' | 'electronic' | 'identity'; text: string }> {
  return [
    { id: 'read', text: 'I have read and understood the whole lease, including the inspection report and any house rules, and I agree to be bound by it.' },
    {
      id: 'electronic',
      text: 'I agree to sign this lease electronically. My electronic signature has the same legal effect as my handwritten signature (Electronic Communications and Transactions Act 25 of 2002, section 13).',
    },
    {
      id: 'identity',
      text: onBehalf
        ? `I confirm I am authorised to sign for ${signerName}, and the signature I add is my own.`
        : `I confirm I am ${signerName} and that the signature I add is my own.`,
    },
  ]
}
