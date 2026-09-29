import { demoDoc } from '../helpers.js'

export type ContractorDef = {
  feId: string
  email: string
  firstName: string
  lastName: string
  phone: string
  company: string
  trades: string[]
  verificationStatus: 'approved' | 'pending'
  vendorCategories?: string[]
}

export const CONTRACTORS: ContractorDef[] = [
  {
    feId: 'u-contractor-aquafix',
    email: 'jobs.aquafix-propertyflow@example.test',
    firstName: 'David',
    lastName: 'Mokoena',
    phone: '+27 21 555 0401',
    company: 'AquaFix Plumbing',
    trades: ['Plumbing'],
    verificationStatus: 'approved',
    vendorCategories: ['PLUMBING'],
  },
  {
    feId: 'u-contractor-voltpro',
    email: 'jobs.voltpro-propertyflow@example.test',
    firstName: 'Sarah',
    lastName: 'Pieterse',
    phone: '+27 21 555 0402',
    company: 'VoltPro Electrical',
    trades: ['Electrical'],
    verificationStatus: 'approved',
    vendorCategories: ['ELECTRICAL'],
  },
  {
    feId: 'u-contractor-coolair',
    email: 'jobs.coolair-propertyflow@example.test',
    firstName: 'Ahmed',
    lastName: 'Hassan',
    phone: '+27 21 555 0403',
    company: 'CoolAir HVAC',
    trades: ['HVAC'],
    verificationStatus: 'approved',
    vendorCategories: ['HVAC'],
  },
  {
    feId: 'u-contractor-handyman',
    email: 'jobs.handymancape-propertyflow@example.test',
    firstName: 'Pieter',
    lastName: 'Botha',
    phone: '+27 21 555 0404',
    company: 'Handyman Cape',
    trades: ['General maintenance'],
    verificationStatus: 'approved',
    vendorCategories: ['GENERAL'],
  },
  {
    feId: 'u-contractor-paintworks',
    email: 'jobs.paintworks-propertyflow@example.test',
    firstName: 'Zola',
    lastName: 'Mthembu',
    phone: '+27 21 555 0405',
    company: 'PaintWorks CT',
    trades: ['Painting'],
    verificationStatus: 'pending',
  },
  {
    feId: 'u-contractor-greenscape',
    email: 'jobs.greenscape-propertyflow@example.test',
    firstName: 'Emma',
    lastName: 'Williams',
    phone: '+27 21 555 0406',
    company: 'GreenScape Gardens',
    trades: ['Gardening / landscaping'],
    verificationStatus: 'pending',
  },
]

export function contractorMetadata(def: ContractorDef) {
  const now = new Date().toISOString()
  const profile = {
    company: def.company,
    idNumberOrPassport: '8001015800088',
    trades: def.trades,
    serviceAreas: ['Cape Town', 'City Bowl', 'Atlantic Seaboard'],
    taxNumberOrTcsPin: '9123456789',
  }
  const documents = [
    demoDoc('id_copy', 'ID or passport copy'),
    demoDoc('proof_of_address', 'Proof of address'),
    demoDoc('public_liability', 'Public liability insurance certificate'),
  ]

  if (def.verificationStatus === 'approved') {
    return {
      company: def.company,
      verification: {
        status: 'approved',
        submittedAt: now,
        reviewedAt: now,
        reviewedBy: 'u-admin-lerato',
        profile,
        documents,
      },
    }
  }

  return {
    company: def.company,
    verification: {
      status: 'pending',
      submittedAt: now,
      profile,
      documents,
    },
  }
}
