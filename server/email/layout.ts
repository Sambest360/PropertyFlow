/**
 * Branded HTML layout shared by every email (system theme: Lekaya blue
 * #0B63C8, ink #0f2744, Outfit font with safe fallbacks). Table-based and
 * inline-styled so it renders the same in Gmail, Outlook and phone clients.
 */

export const BRAND = {
  name: 'Lekaya Rentals',
  primary: '#0B63C8',
  primaryDark: '#08488f',
  ink: '#0f2744',
  text: '#2f4a6a',
  muted: '#6b8aaa',
  soft: '#f0f6fc',
  border: '#dceaf8',
  accent: '#F04332',
}

/** Public site address used in links and for the logo image. */
export function appUrl(): string {
  return (process.env.PUBLIC_APP_URL || process.env.PAYFAST_PUBLIC_URL || 'https://lekayarentals.site').replace(/\/+$/, '')
}

/** Absolute link into the app (paths starting with / are prefixed with the site address). */
export function appLink(path: string): string {
  if (/^https?:\/\//i.test(path)) return path
  return `${appUrl()}${path.startsWith('/') ? '' : '/'}${path}`
}

export function escapeHtml(v: string): string {
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const FONT = `'Outfit', 'Segoe UI', Arial, Helvetica, sans-serif`

/** A paragraph. `html` is trusted markup: escape user text before passing it in. */
export function para(html: string): string {
  return `<p style="margin:0 0 14px;color:${BRAND.text};font-size:15px;line-height:1.6;font-family:${FONT};">${html}</p>`
}

/** Main call-to-action button. */
export function button(label: string, href: string): string {
  const url = escapeHtml(appLink(href))
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 20px;"><tr><td style="border-radius:8px;background:${BRAND.primary};">
<a href="${url}" style="display:inline-block;padding:12px 22px;font-family:${FONT};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">${escapeHtml(label)}</a>
</td></tr></table>`
}

/** Small grey note under a button (e.g. "This link expires in 1 hour"). */
export function note(text: string): string {
  return `<p style="margin:0 0 14px;color:${BRAND.muted};font-size:13px;line-height:1.5;font-family:${FONT};">${escapeHtml(text)}</p>`
}

/** Label / value rows in a soft box. Values are escaped. */
export function details(rows: Array<[string, string | number | null | undefined]>): string {
  const body = rows
    .filter(([, v]) => v != null && String(v).trim() !== '')
    .map(
      ([k, v]) =>
        `<tr><td style="padding:6px 0;color:${BRAND.muted};font-size:13px;font-family:${FONT};width:40%;">${escapeHtml(k)}</td><td style="padding:6px 0;color:${BRAND.ink};font-size:14px;font-family:${FONT};font-weight:600;">${escapeHtml(String(v))}</td></tr>`,
    )
    .join('')
  if (!body) return ''
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 18px;background:${BRAND.soft};border:1px solid ${BRAND.border};border-radius:10px;padding:10px 16px;">${body}</table>`
}

export type LayoutOptions = {
  /** Hidden preview line shown by mail apps next to the subject. */
  preheader?: string
  /** Footer line about notification settings (notification emails only). */
  manageNotifications?: boolean
}

/** Wraps an email body in the branded frame. `title` is plain text (escaped here). */
export function layout(title: string, bodyHtml: string, opts: LayoutOptions = {}): string {
  const logo = `${appUrl()}/brand/lekaya-logo-1024.png`
  const settings = appLink('/workspace/account/settings')
  const pre = opts.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(opts.preheader)}</div>`
    : ''
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background:${BRAND.soft};">
${pre}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.soft};padding:28px 12px;">
  <tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid ${BRAND.border};border-radius:14px;overflow:hidden;">
      <tr><td style="height:4px;background:${BRAND.primary};font-size:0;line-height:0;">&nbsp;</td></tr>
      <tr><td style="padding:22px 32px 6px;">
        <a href="${escapeHtml(appUrl())}" style="text-decoration:none;"><img src="${escapeHtml(logo)}" alt="${BRAND.name}" width="150" style="display:block;border:0;height:auto;max-width:150px;" /></a>
      </td></tr>
      <tr><td style="padding:18px 32px 12px;">
        <h1 style="margin:0 0 16px;font-family:${FONT};font-size:22px;line-height:1.3;color:${BRAND.ink};font-weight:700;">${escapeHtml(title)}</h1>
        ${bodyHtml}
      </td></tr>
      <tr><td style="padding:18px 32px;background:${BRAND.soft};border-top:1px solid ${BRAND.border};">
        <p style="margin:0 0 6px;color:${BRAND.muted};font-size:12px;line-height:1.5;font-family:${FONT};">This email was sent from a no-reply address. Please don't reply to it. For help, open <a href="${escapeHtml(appLink('/workspace/help'))}" style="color:${BRAND.primary};">Help &amp; support</a> in your account.</p>
        ${
          opts.manageNotifications
            ? `<p style="margin:0 0 6px;color:${BRAND.muted};font-size:12px;line-height:1.5;font-family:${FONT};">You get this because notifications are on. <a href="${escapeHtml(settings)}" style="color:${BRAND.primary};">Change your notification settings</a>.</p>`
            : ''
        }
        <p style="margin:0;color:${BRAND.muted};font-size:12px;font-family:${FONT};">&copy; ${new Date().getFullYear()} ${BRAND.name} &middot; <a href="${escapeHtml(appUrl())}" style="color:${BRAND.muted};">${escapeHtml(appUrl().replace(/^https?:\/\//, ''))}</a></p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`
}
