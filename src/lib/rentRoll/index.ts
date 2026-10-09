export {
  AUDIT_PACK_MODE_A_COPY,
  REMITTANCE_REFUSE_COPY,
  RENT_ROLL_MODE_A_COPY,
  RemittanceNotConfiguredError,
  type IRemittanceAdapter,
  type RemittancePartnerCode,
  type RemittancePushResult,
  type RentRollAsAtInput,
  type RentRollBook,
  type RentRollPdfResult,
  type RentRollRow,
  type SoftAuditPack,
  type SoftAuditPackFile,
  type SoftAuditPackInput,
} from './types'

export {
  buildRentRollAsAt,
  defaultRentRollAsAt,
  isTenancyOnRentRollAsAt,
} from './buildRentRoll'

export {
  DOCUMENTS_INDEX_CSV_HEADER,
  RENT_ROLL_CSV_HEADER,
  documentsIndexToCsv,
  rentRollToCsv,
} from './rentRollCsv'

export { downloadRentRollPdf, generateRentRollPdf } from './generateRentRollPdf'

export {
  RENT_ROLL_TABLE_COLUMNS,
  rentRollCellText,
  rentRollTableToCsv,
  type RentRollColumnKey,
} from './rentRollTable'

export { buildSoftAuditPack } from './auditPack'

export {
  ManualSoftRemittanceAdapter,
  RefuseClosedRemittanceAdapter,
  assertRemittanceNotLive,
  attemptLiveRemittance,
  remittanceAdapterFromEnv,
  type RemittanceAdapterKind,
} from './adapters'

/** Trigger browser download of UTF-8 / binary pack files. */
export function downloadSoftAuditPackFiles(
  files: Array<{ path: string; mime: string; encoding: 'utf-8' | 'base64'; content: string }>,
) {
  for (const f of files) {
    const leaf = f.path.includes('/') ? f.path.split('/').pop()! : f.path
    let blob: Blob
    if (f.encoding === 'base64') {
      const binary = atob(f.content)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
      blob = new Blob([bytes], { type: f.mime })
    } else {
      blob = new Blob([f.content], { type: f.mime })
    }
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = leaf
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }
}
