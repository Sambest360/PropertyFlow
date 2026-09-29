import pg from 'pg'

const { Client } = pg

export type MigrateIdDocumentsOptions = {
  databaseUrl: string
  supabaseUrl: string
  serviceRoleKey: string
}

export type MigrateIdDocumentsResult = {
  uploaded: number
  migrated: number
  pending: number
}

type PlanRow = {
  user_id: string
  doc_index: number
  doc_key: string
  file_id: string
  bucket: string
  path: string
  mime_type: string
  byte_size: string
  data_url: string
}

function decodeDataUrl(dataUrl: string): Buffer {
  const comma = dataUrl.indexOf(',')
  if (comma < 0) throw new Error('ID document data URL has no payload')
  return Buffer.from(dataUrl.slice(comma + 1).replace(/\s/g, ''), 'base64')
}

/**
 * Uploads ID documents that still live as data URLs in users.metadata, then
 * calls migrate_user_metadata_documents() to register them and strip the bytes
 * from the row. Safe to re-run: the path is a stable uuid v5 and the SQL
 * function leaves a data URL in place until the object exists.
 */
export async function migrateUserMetadataDocuments(
  opts: MigrateIdDocumentsOptions,
): Promise<MigrateIdDocumentsResult> {
  const client = new Client({ connectionString: opts.databaseUrl })
  await client.connect()
  try {
    const plan = await client.query<PlanRow>('SELECT * FROM public.metadata_document_plan()')
    let uploaded = 0
    for (const row of plan.rows) {
      const bytes = decodeDataUrl(row.data_url)
      const res = await fetch(
        `${opts.supabaseUrl.replace(/\/$/, '')}/storage/v1/object/${row.bucket}/${row.path}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${opts.serviceRoleKey}`,
            apikey: opts.serviceRoleKey,
            'Content-Type': row.mime_type,
            'x-upsert': 'false',
          },
          body: bytes,
        },
      )
      if (res.status === 409 || res.status === 400) {
        const text = await res.text()
        if (!/already exists|Duplicate/i.test(text)) {
          throw new Error(`ID document upload failed (${res.status}): ${text}`)
        }
      } else if (!res.ok) {
        throw new Error(`ID document upload failed (${res.status}): ${await res.text()}`)
      } else {
        uploaded += 1
        await res.arrayBuffer()
      }
    }
    const done = await client.query<{ migrated: number; pending: number }>(
      'SELECT * FROM public.migrate_user_metadata_documents()',
    )
    const row = done.rows[0] as { migrate_user_metadata_documents: { migrated: number; pending: number } } | undefined
    const payload = row?.migrate_user_metadata_documents ?? { migrated: 0, pending: 0 }
    return { uploaded, migrated: payload.migrated, pending: payload.pending }
  } finally {
    await client.end()
  }
}
