import { persistToApi } from '../api/persist'
import { isSupabaseMode } from '../api/config'
import { supabaseAttachPendingRegistrationDocs } from '../supabase/auth'
import { createClient } from '../../utils/supabase/client'
import type { AppUser } from '../../types/domain'
import type { VerificationDocument, VerificationProfile } from '../verification'
import { isLegacyDataUrl, isStorageRef, toStorageRef } from './contract'
import { getFileStorage } from './index'
import { registrationDocumentTarget } from './targets'

export type RegistrationDocDraft = VerificationDocument & {
  /** Held in memory until the account exists. Never written to Postgres. */
  file?: File
  /** Object URL for the form preview only. */
  localPreviewUrl?: string
}

export function fileFromDataUrl(dataUrl: string, name: string, mimeType: string): File {
  const comma = dataUrl.indexOf(',')
  const header = comma >= 0 ? dataUrl.slice(0, comma) : ''
  const body = comma >= 0 ? dataUrl.slice(comma + 1) : ''
  const mime = /data:([^;,]+)/.exec(header)?.[1] || mimeType || 'application/octet-stream'
  const binary = atob(body)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return new File([bytes], name || 'document', { type: mime })
}

function persistedDocument(doc: VerificationDocument, fileId: string): VerificationDocument {
  return {
    key: doc.key,
    label: doc.label,
    name: doc.name,
    mimeType: doc.mimeType,
    dataUrl: toStorageRef(fileId),
    fileId,
    uploadedAt: doc.uploadedAt || new Date().toISOString(),
  }
}

/**
 * Upload registration files onto the user's owning agency path and return
 * records that store a file id, not a data URL.
 * A data URL is accepted only as a sessionStorage stash from an interrupted
 * sign-up — it is uploaded and then dropped.
 */
export async function uploadRegistrationDocuments(opts: {
  agencyId: string | null
  userId: string
  documents: readonly RegistrationDocDraft[]
}): Promise<VerificationDocument[]> {
  const storage = getFileStorage()
  const stored: VerificationDocument[] = []
  for (const doc of opts.documents) {
    if (doc.fileId && isStorageRef(doc.dataUrl)) {
      stored.push(persistedDocument(doc, doc.fileId))
      continue
    }
    let file = doc.file
    if (!file && doc.dataUrl && isLegacyDataUrl(doc.dataUrl)) {
      file = fileFromDataUrl(doc.dataUrl, doc.name, doc.mimeType)
    }
    if (!file) continue
    const target = registrationDocumentTarget({
      agencyId: opts.agencyId,
      userId: opts.userId,
      docKey: doc.key,
    })
    const result = await storage.upload({ ...target, file })
    stored.push(persistedDocument({ ...doc, mimeType: doc.mimeType || file.type }, result.file_id))
  }
  return stored
}

/** Write storage refs onto the user. Does not send data URLs. */
export async function persistRegistrationDocuments(opts: {
  user: AppUser
  role: string
  profile?: VerificationProfile
  documents: VerificationDocument[]
}): Promise<void> {
  if (!opts.documents.length) return
  if (isSupabaseMode) {
    const { data } = await createClient().auth.getSession()
    const authUserId = data.session?.user?.id
    if (!authUserId) {
      throw new Error('Sign in again to finish saving your documents.')
    }
    await supabaseAttachPendingRegistrationDocs({
      authUserId,
      role: opts.role,
      profile: opts.profile,
      documents: opts.documents,
    })
    return
  }
  await persistToApi({
    resource: 'user',
    action: 'upsert',
    id: opts.user.id,
    data: {
      id: opts.user.id,
      name: opts.user.name,
      email: opts.user.email,
      role: opts.user.role,
      agencyId: opts.user.agencyId,
      phone: opts.user.phone,
      active: opts.user.active,
      company: opts.user.company,
      idNumberOrPassport: opts.user.idNumberOrPassport,
      verification: {
        status: 'pending',
        submittedAt: new Date().toISOString(),
        profile: opts.profile ?? {},
        documents: opts.documents,
      },
    },
  })
}

/** Session stash only — used when sign-up returns before a session exists. */
export function dataUrlToFile(dataUrl: string, name: string, mimeType: string): File {
  const comma = dataUrl.indexOf(',')
  const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return new File([bytes], name, { type: mimeType || 'application/octet-stream' })
}

export async function registrationDraftsToStash(
  documents: readonly RegistrationDocDraft[],
): Promise<VerificationDocument[]> {
  const stashed: VerificationDocument[] = []
  for (const doc of documents) {
    if (doc.file) {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result ?? ''))
        reader.onerror = () => reject(reader.error)
        reader.readAsDataURL(doc.file as File)
      })
      stashed.push({
        key: doc.key,
        label: doc.label,
        name: doc.name,
        mimeType: doc.mimeType,
        dataUrl,
        uploadedAt: doc.uploadedAt,
      })
      continue
    }
    stashed.push({
      key: doc.key,
      label: doc.label,
      name: doc.name,
      mimeType: doc.mimeType,
      dataUrl: doc.dataUrl,
      fileId: doc.fileId,
      uploadedAt: doc.uploadedAt,
    })
  }
  return stashed
}
