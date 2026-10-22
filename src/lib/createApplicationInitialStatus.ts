import type { Application } from '../types/domain'

/** Public listing apply: documents to follow — land on documents_requested. */
export function initialWorkflowForCreate(input: {
  skipGuards?: boolean
  uploadedDocs?: Application['uploadedDocs']
}): { workflowStatus: 'documents_requested' | 'application_submitted'; stage: string } {
  const hasUploadedUrls =
    Boolean(input.uploadedDocs?.bankStatementsUrl?.trim()) ||
    Boolean(input.uploadedDocs?.idCopyUrl?.trim()) ||
    Boolean(input.uploadedDocs?.payslipUrl?.trim())
  if (!input.skipGuards && !hasUploadedUrls) {
    return { workflowStatus: 'documents_requested', stage: 'Documents requested' }
  }
  return { workflowStatus: 'application_submitted', stage: 'Application submitted' }
}
