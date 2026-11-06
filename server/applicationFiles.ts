/**
 * Application document files stay out of the bootstrap: each one can be up to
 * 2 MB, and the bootstrap is downloaded on every page load and after every
 * save. The bootstrap keeps each file's name and type plus `src`, the URL that
 * returns that one file (read through the same actor filter as the bootstrap).
 */
type Row = Record<string, unknown>

export function applicationFileSrc(applicationId: string, key: string): string {
  return `/api/application-file?app=${encodeURIComponent(applicationId)}&key=${encodeURIComponent(key)}`
}

/** The bootstrap with every application document's file content left out. */
export function withoutApplicationFiles<T extends Record<string, unknown>>(data: T): T {
  const apps = data.applications
  if (!Array.isArray(apps)) return data
  return {
    ...data,
    applications: (apps as Row[]).map((app) => {
      const docs = app?.documents
      if (!Array.isArray(docs)) return app
      return {
        ...app,
        documents: (docs as Row[]).map((d) => {
          const file = d?.file as Row | null | undefined
          if (!file || typeof file.dataUrl !== 'string' || !file.dataUrl) return d
          return { ...d, file: { ...file, dataUrl: '', src: applicationFileSrc(String(app.id), String(d.key)) } }
        }),
      }
    }),
  }
}

/** One document file from a filtered bootstrap, or null when the actor cannot see it. */
export function findApplicationFile(
  data: Record<string, unknown>,
  applicationId: string,
  key: string,
): { name: string; mimeType: string; dataUrl: string } | null {
  const apps = Array.isArray(data.applications) ? (data.applications as Row[]) : []
  const app = apps.find((a) => a?.id === applicationId)
  const docs = Array.isArray(app?.documents) ? (app!.documents as Row[]) : []
  const file = docs.find((d) => d?.key === key)?.file as Row | undefined
  if (!file || typeof file.dataUrl !== 'string' || !file.dataUrl) return null
  return {
    name: String(file.name ?? 'document'),
    mimeType: String(file.mimeType ?? 'application/octet-stream'),
    dataUrl: file.dataUrl,
  }
}
