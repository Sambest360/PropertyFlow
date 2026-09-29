import type { StorageUploadTarget } from './contract'

export function propertyImageTarget(agencyId: string, propertyId: string): StorageUploadTarget {
  return {
    bucket: 'property-media',
    agencyId,
    entityType: 'property',
    entityId: propertyId,
    kind: 'property_image',
    fileClass: 'image',
  }
}

export function assetImageTarget(agencyId: string, assetId: string): StorageUploadTarget {
  return {
    bucket: 'property-media',
    agencyId,
    entityType: 'asset',
    entityId: assetId,
    kind: 'property_image',
    fileClass: 'image',
  }
}

export function ticketAttachmentTarget(agencyId: string, ticketId: string): StorageUploadTarget {
  return {
    bucket: 'property-media',
    agencyId,
    entityType: 'ticket',
    entityId: ticketId,
    kind: 'ticket_attachment',
    fileClass: 'image',
  }
}

export function propertyDocumentTarget(
  agencyId: string,
  propertyId: string,
  kind = 'property_document',
): StorageUploadTarget {
  return {
    bucket: 'documents',
    agencyId,
    entityType: 'property',
    entityId: propertyId,
    kind,
    fileClass: 'document',
  }
}

/**
 * Tenants and applicants upload onto the owning agency's path.
 * A lease file uses the tenancy id; every other application file uses the application id.
 */
export function applicationDocumentTarget(opts: {
  agencyId: string
  applicationId: string
  leaseId?: string | null
  docKey: string
  docLabel?: string
}): StorageUploadTarget {
  const lease = Boolean(opts.leaseId) && /lease/i.test(`${opts.docKey} ${opts.docLabel ?? ''}`)
  return {
    bucket: 'documents',
    agencyId: opts.agencyId,
    entityType: lease ? 'lease' : 'application',
    entityId: lease ? opts.leaseId! : opts.applicationId,
    kind: opts.docKey || (lease ? 'lease_document' : 'application_document'),
    fileClass: 'document',
  }
}

export function registrationDocumentTarget(opts: {
  agencyId: string | null
  userId: string
  docKey: string
}): StorageUploadTarget {
  return {
    bucket: 'documents',
    agencyId: opts.agencyId?.trim() || opts.userId,
    entityType: 'user',
    entityId: opts.userId,
    kind: opts.docKey === 'id_copy' ? 'id_document' : 'registration_document',
    fileClass: 'document',
  }
}

export function paymentDocumentTarget(agencyId: string, paymentId: string): StorageUploadTarget {
  return {
    bucket: 'documents',
    agencyId,
    entityType: 'payment',
    entityId: paymentId,
    kind: 'payment_document',
    fileClass: 'document',
  }
}

export function leadDocumentTarget(agencyId: string, leadId: string, kind = 'document'): StorageUploadTarget {
  return {
    bucket: 'documents',
    agencyId,
    entityType: 'lead',
    entityId: leadId,
    kind,
    fileClass: 'document',
  }
}
