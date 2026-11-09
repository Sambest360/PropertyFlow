/**
 * Guest-house photos are uploads (/api/files/...) and pasted links, kept in
 * one list (server photoList: http(s) or '/' only, at most 20). The editor
 * shows uploads in a dropzone and links in a text box; these helpers split
 * and rejoin them. A data: URL is an upload that failed (the inline fallback
 * of storePhotoDataUrl) and would be dropped by the server, so it is counted.
 */
const MAX_PHOTOS = 20

export function splitGuesthousePhotos(photos: string[]): { uploaded: string[]; links: string } {
  const uploaded: string[] = []
  const links: string[] = []
  for (const p of photos ?? []) (p.startsWith('/api/files/') ? uploaded : links).push(p)
  return { uploaded, links: links.join('\n') }
}

export function joinGuesthousePhotos(uploaded: string[], linksText: string): { photos: string[]; failedUploads: number } {
  const failedUploads = uploaded.filter((p) => p.startsWith('data:')).length
  const all = [...uploaded.filter((p) => !p.startsWith('data:')), ...linksText.split(/\s+/)]
  const photos: string[] = []
  for (const raw of all) {
    const p = raw.trim()
    if (p && !photos.includes(p)) photos.push(p)
    if (photos.length >= MAX_PHOTOS) break
  }
  return { photos, failedUploads }
}
