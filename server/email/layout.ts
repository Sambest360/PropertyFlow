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

const DEFAULT_SITE = 'https://lekayarentals.site'

/**
 * Public site address used in links and for the logo image. In production a
 * localhost / 127.0.0.1 value (a copied dev .env) falls back to the real site,
 * so no email ever links to someone's own machine.
 */
export function appUrl(): string {
  const configured = (process.env.PUBLIC_APP_URL || process.env.PAYFAST_PUBLIC_URL || DEFAULT_SITE).replace(/\/+$/, '')
  if (process.env.NODE_ENV === 'production' && /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i.test(configured)) return DEFAULT_SITE
  return configured
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

/**
 * Main call-to-action button. Bulletproof markup: Outlook on Windows draws the
 * VML rounded rectangle, every other client the padded link, so the whole
 * button is clickable everywhere. Solid blue with white text and a matching
 * border reads the same when a mail app switches to dark mode.
 */
export function button(label: string, href: string): string {
  const url = escapeHtml(appLink(href))
  const text = escapeHtml(label)
  const width = Math.min(520, Math.max(160, Math.round(label.length * 9 + 56)))
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 20px;"><tr><td align="left">
<!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${url}" style="height:46px;v-text-anchor:middle;width:${width}px;" arcsize="18%" strokecolor="${BRAND.primary}" fillcolor="${BRAND.primary}"><w:anchorlock/><center style="color:#ffffff;font-family:Arial,sans-serif;font-size:15px;font-weight:bold;">${text}</center></v:roundrect><![endif]-->
<!--[if !mso]><!--><a class="pf-btn" href="${url}" target="_blank" style="display:inline-block;background:${BRAND.primary};border:1px solid ${BRAND.primary};border-radius:8px;padding:13px 24px;font-family:${FONT};font-size:15px;font-weight:600;line-height:20px;color:#ffffff;text-decoration:none;">${text}</a><!--<![endif]-->
</td></tr></table>`
}

/** Plain-text twin of a button: the label with its full link written out. */
export function buttonText(label: string, href: string): string {
  return `${label}: ${appLink(href)}`
}

/** A quieter text link under the main button. */
export function textLink(label: string, href: string): string {
  return `<p style="margin:-6px 0 18px;font-size:14px;line-height:1.5;font-family:${FONT};"><a href="${escapeHtml(appLink(href))}" target="_blank" style="color:${BRAND.primary};font-weight:600;text-decoration:underline;">${escapeHtml(label)}</a></p>`
}

/** What the property card shows. Every field is plain text (escaped here). */
export type PropertyCard = {
  title: string
  /** "Suburb, City" — never the street address. */
  area?: string | null
  /** e.g. "R 8 500 / month" or "R 1 250 000". */
  price?: string | null
  /** Absolute https photo URL (never a data: URL). */
  imageUrl?: string | null
  /** Where "View property" goes: the public listing, or the property in the workspace. */
  viewUrl?: string | null
}

const CARD_W = 536
const CARD_IMG_H = 300

/**
 * The property an email is about: photo, title, area, price and a "View
 * property" link. Stacked table layout so it reads the same on a phone; the
 * photo has width and height set, and a tinted panel stands in when there is none.
 */
export function propertyCard(card: PropertyCard): string {
  const view = card.viewUrl ? escapeHtml(appLink(card.viewUrl)) : ''
  const title = escapeHtml(card.title)
  const photo =
    card.imageUrl && /^https:\/\//i.test(card.imageUrl)
      ? `<img src="${escapeHtml(card.imageUrl)}" alt="Photo of ${title}" width="${CARD_W}" height="${CARD_IMG_H}" style="display:block;width:100%;max-width:${CARD_W}px;height:auto;border:0;outline:none;text-decoration:none;border-radius:11px 11px 0 0;background:${BRAND.soft};color:${BRAND.muted};font-family:${FONT};font-size:13px;" />`
      : `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" height="96" style="height:96px;background:${BRAND.soft};border-radius:11px 11px 0 0;color:${BRAND.muted};font-family:${FONT};font-size:13px;">No photo yet</td></tr></table>`
  const media = view ? `<a href="${view}" target="_blank" style="text-decoration:none;">${photo}</a>` : photo
  const heading = view ? `<a href="${view}" target="_blank" style="color:${BRAND.ink};text-decoration:none;">${title}</a>` : title
  return `<table role="presentation" class="pf-card" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:${CARD_W}px;margin:4px 0 20px;border:1px solid ${BRAND.border};border-radius:12px;background:#ffffff;">
<tr><td style="padding:0;">${media}</td></tr>
<tr><td style="padding:14px 18px 16px;">
<p class="pf-card-title" style="margin:0 0 4px;font-family:${FONT};font-size:17px;line-height:1.35;font-weight:700;color:${BRAND.ink};">${heading}</p>${
    card.area ? `\n<p style="margin:0 0 6px;font-family:${FONT};font-size:14px;line-height:1.4;color:${BRAND.text};">${escapeHtml(card.area)}</p>` : ''
  }${
    card.price ? `\n<p style="margin:0 0 6px;font-family:${FONT};font-size:15px;line-height:1.4;font-weight:700;color:${BRAND.primary};">${escapeHtml(card.price)}</p>` : ''
  }${
    view ? `\n<p style="margin:8px 0 0;font-family:${FONT};font-size:14px;line-height:1.4;"><a href="${view}" target="_blank" style="color:${BRAND.primary};font-weight:600;text-decoration:underline;">View property &rarr;</a></p>` : ''
  }
</td></tr></table>`
}

/** Small photo + title + area row, for summaries that list several items. */
export function propertyCardCompact(card: PropertyCard): string {
  const view = card.viewUrl ? escapeHtml(appLink(card.viewUrl)) : ''
  const title = escapeHtml(card.title)
  const thumb =
    card.imageUrl && /^https:\/\//i.test(card.imageUrl)
      ? `<img src="${escapeHtml(card.imageUrl)}" alt="Photo of ${title}" width="88" height="50" style="display:block;width:88px;height:50px;border:0;border-radius:6px;object-fit:cover;background:${BRAND.soft};" />`
      : `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="88" height="50" style="width:88px;height:50px;background:${BRAND.soft};border-radius:6px;font-size:0;line-height:0;">&nbsp;</td></tr></table>`
  const name = view ? `<a href="${view}" target="_blank" style="color:${BRAND.ink};text-decoration:none;">${title}</a>` : title
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 4px;"><tr>
<td valign="top" width="88" style="width:88px;padding:0 12px 0 0;">${thumb}</td>
<td valign="middle" style="font-family:${FONT};"><div class="pf-card-title" style="font-size:14px;font-weight:700;line-height:1.3;color:${BRAND.ink};">${name}</div>${
    card.area || card.price
      ? `<div style="font-size:13px;line-height:1.4;color:${BRAND.text};">${escapeHtml([card.area, card.price].filter(Boolean).join(' · '))}</div>`
      : ''
  }</td></tr></table>`
}

/** Plain-text twin of the property card, with the link written out. */
export function propertyCardText(card: PropertyCard): string {
  return [
    `Property: ${card.title}`,
    card.area ? `Area: ${card.area}` : '',
    card.price ? `Price: ${card.price}` : '',
    card.viewUrl ? `View property: ${appLink(card.viewUrl)}` : '',
  ]
    .filter(Boolean)
    .join('\n')
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
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><title>${escapeHtml(title)}</title>
<style>
@media (max-width:620px){.pf-pad{padding-left:18px !important;padding-right:18px !important}.pf-outer{padding:12px 6px !important}}
@media (prefers-color-scheme:dark){
.pf-bg{background:#0b1622 !important}
.pf-frame,.pf-card{background:#13202f !important;border-color:#24364a !important}
.pf-frame h1,.pf-frame p,.pf-card-title a{color:#e6eef7 !important}
.pf-frame a{color:#8cc2ff !important}
.pf-frame a.pf-btn{color:#ffffff !important;background:#0B63C8 !important}
.pf-foot{background:#0f1a27 !important;border-color:#24364a !important}
.pf-frame .pf-foot p{color:#a9bccf !important}
.pf-logo{background:#ffffff !important;border-radius:8px;padding:6px 10px !important}
}
</style></head>
<body class="pf-bg" style="margin:0;padding:0;background:${BRAND.soft};">
${pre}
<table role="presentation" class="pf-bg pf-outer" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.soft};padding:28px 12px;">
  <tr><td align="center">
    <table role="presentation" class="pf-frame" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid ${BRAND.border};border-radius:14px;overflow:hidden;">
      <tr><td style="height:4px;background:${BRAND.primary};font-size:0;line-height:0;">&nbsp;</td></tr>
      <tr><td class="pf-pad" style="padding:22px 32px 6px;">
        <a href="${escapeHtml(appUrl())}" style="text-decoration:none;"><img class="pf-logo" src="${escapeHtml(logo)}" alt="${BRAND.name}" width="150" style="display:block;border:0;height:auto;max-width:150px;" /></a>
      </td></tr>
      <tr><td class="pf-pad" style="padding:18px 32px 12px;">
        <h1 style="margin:0 0 16px;font-family:${FONT};font-size:22px;line-height:1.3;color:${BRAND.ink};font-weight:700;">${escapeHtml(title)}</h1>
        ${bodyHtml}
      </td></tr>
      <tr><td class="pf-pad pf-foot" style="padding:18px 32px;background:${BRAND.soft};border-top:1px solid ${BRAND.border};">
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
