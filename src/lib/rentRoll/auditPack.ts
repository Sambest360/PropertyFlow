/**
 * §5 Mode A — soft audit pack: index + rent roll + Trust soft CSV + docs inventory.
 * Reuses Trust soft export (`trustTransactionsToCsv`) and optional DQ-M3 owner statement PDFs.
 * Not a statutory / PPRA / bank-matched audit pack.
 */

import { TRUST_CSV_NON_PRODUCTION_LABEL, trustTransactionsToCsv } from '../trust/csvImport'
import { OWNER_STATEMENT_MODE_A_COPY } from '../ownerStatement/types'
import { buildRentRollAsAt } from './buildRentRoll'
import { documentsIndexToCsv, rentRollToCsv } from './rentRollCsv'
import { generateRentRollPdf } from './generateRentRollPdf'
import {
  AUDIT_PACK_MODE_A_COPY,
  RENT_ROLL_MODE_A_COPY,
  REMITTANCE_REFUSE_COPY,
  type SoftAuditPack,
  type SoftAuditPackFile,
  type SoftAuditPackInput,
} from './types'

function dataUrlToBase64(dataUrl: string): string {
  const idx = dataUrl.indexOf('base64,')
  if (idx >= 0) return dataUrl.slice(idx + 'base64,'.length)
  return dataUrl
}

function buildIndexMarkdown(pack: {
  asAt: string
  agencyName: string
  generatedAt: string
  fileNames: string[]
  rentUnits: number
  docCount: number
  trustRows: number
  ownerStatementCount: number
}): string {
  const lines = [
    '# Soft audit pack (in-app)',
    '',
    AUDIT_PACK_MODE_A_COPY,
    '',
    `- Agency: ${pack.agencyName}`,
    `- As-at: ${pack.asAt}`,
    `- Generated: ${pack.generatedAt}`,
    '',
    '## Honest scope',
    '',
    `- Rent roll: ${RENT_ROLL_MODE_A_COPY}`,
    `- Trust CSV: ${TRUST_CSV_NON_PRODUCTION_LABEL}`,
    `- Owner statements (if included): ${OWNER_STATEMENT_MODE_A_COPY}`,
    `- Remittance: ${REMITTANCE_REFUSE_COPY}`,
    '',
    '## Inventory',
    '',
    `- Rent roll units: ${pack.rentUnits}`,
    `- Existing documents indexed: ${pack.docCount}`,
    `- Trust soft rows: ${pack.trustRows}`,
    `- Owner statement PDFs bundled: ${pack.ownerStatementCount}`,
    '',
    '## Files',
    '',
    ...pack.fileNames.map((f) => `- ${f}`),
    '',
    '## OUT (not claimed)',
    '',
    '- PPRA opinion / auditor role',
    '- Bank-matched / bank-confirmed balances',
    '- Full commission engine / SARS / second ledger',
    '- Live PayProp remittance',
    '',
  ]
  return lines.join('\n')
}

/**
 * Build soft audit pack files for download (multi-file, like syndication export pack).
 * Does not mint a ZIP dependency — callers download each file.
 */
export async function buildSoftAuditPack(input: SoftAuditPackInput): Promise<SoftAuditPack> {
  const generatedAt = input.generatedAt ?? new Date().toISOString()
  const asAt = input.asAt.slice(0, 10)

  const rentRoll = buildRentRollAsAt({
    agencyId: input.agencyId,
    agencyName: input.agencyName,
    asAt,
    properties: input.properties,
    tenancies: input.tenancies,
    payments: input.payments,
    landlords: input.landlords,
    landlordUserId: input.landlordUserId,
    generatedAt,
  })

  const rentPdf = await generateRentRollPdf({
    agencyId: input.agencyId,
    agencyName: input.agencyName,
    asAt,
    properties: input.properties,
    tenancies: input.tenancies,
    payments: input.payments,
    landlords: input.landlords,
    landlordUserId: input.landlordUserId,
    generatedAt,
  })

  const scopedPropertyIds = new Set(
    input.properties
      .filter((p) => {
        if (p.agencyId !== input.agencyId) return false
        if (input.landlordUserId && p.landlordId !== input.landlordUserId) return false
        return true
      })
      .map((p) => p.id),
  )

  const docs = (input.documents ?? []).filter(
    (d) => d.agencyId === input.agencyId && scopedPropertyIds.has(d.propertyId),
  )

  const trustTxns = (input.trustTransactions ?? []).filter((t) => t.agencyId === input.agencyId)
  const trustCsv = trustTransactionsToCsv(
    trustTxns.map((t) => ({
      valueDate: t.valueDate,
      direction: t.direction,
      amountCents: t.amountCents,
      description: `${t.description} [${TRUST_CSV_NON_PRODUCTION_LABEL}]`,
      bankRef: t.bankRef,
      status: t.status,
    })),
  )

  const files: SoftAuditPackFile[] = []

  const rentCsv = rentRollToCsv(rentRoll)
  files.push({
    path: `rent-roll-as-at-${asAt}.csv`,
    mime: 'text/csv;charset=utf-8',
    encoding: 'utf-8',
    content: rentCsv,
  })
  files.push({
    path: rentPdf.fileName,
    mime: 'application/pdf',
    encoding: 'base64',
    content: dataUrlToBase64(rentPdf.dataUrl),
  })
  files.push({
    path: `trust-soft-export-${asAt}.csv`,
    mime: 'text/csv;charset=utf-8',
    encoding: 'utf-8',
    content: trustCsv,
  })
  files.push({
    path: `documents-index-${asAt}.csv`,
    mime: 'text/csv;charset=utf-8',
    encoding: 'utf-8',
    content: documentsIndexToCsv(docs),
  })

  const ownerPdfs = input.ownerStatementPdfs ?? []
  for (const os of ownerPdfs) {
    files.push({
      path: `owner-statements/${os.fileName}`,
      mime: 'application/pdf',
      encoding: 'base64',
      content: dataUrlToBase64(os.dataUrl),
    })
  }

  const fileNames = ['INDEX.md', 'index.json', ...files.map((f) => f.path)]
  const indexMarkdown = buildIndexMarkdown({
    asAt,
    agencyName: input.agencyName,
    generatedAt,
    fileNames,
    rentUnits: rentRoll.totals.units,
    docCount: docs.length,
    trustRows: trustTxns.length,
    ownerStatementCount: ownerPdfs.length,
  })

  const indexJson = JSON.stringify(
    {
      honesty: AUDIT_PACK_MODE_A_COPY,
      rentRollHonesty: RENT_ROLL_MODE_A_COPY,
      remittance: REMITTANCE_REFUSE_COPY,
      agencyId: input.agencyId,
      agencyName: input.agencyName,
      asAt,
      generatedAt,
      landlordUserId: input.landlordUserId ?? null,
      totals: rentRoll.totals,
      files: fileNames,
      outOfScope: [
        'PPRA opinion',
        'auditor role',
        'bank-matched claim',
        'full commission engine',
        'SARS',
        'second ledger',
        'live remittance',
      ],
    },
    null,
    2,
  )

  files.unshift(
    {
      path: 'INDEX.md',
      mime: 'text/markdown;charset=utf-8',
      encoding: 'utf-8',
      content: indexMarkdown,
    },
    {
      path: 'index.json',
      mime: 'application/json;charset=utf-8',
      encoding: 'utf-8',
      content: indexJson,
    },
  )

  const safeAgency = input.agencyName.replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 40)
  return {
    filenameBase: `soft-audit-pack-${safeAgency}-${asAt}`,
    asAt,
    honesty: AUDIT_PACK_MODE_A_COPY,
    generatedAt,
    indexMarkdown,
    indexJson,
    files,
    rentRoll,
  }
}
