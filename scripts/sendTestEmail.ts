/**
 * Send a test email through the configured Mailtrap transport.
 *
 * Usage:
 *   npx tsx scripts/sendTestEmail.ts                    # to MAILTRAP_TEST_TO or the logged-in user's own address
 *   npx tsx scripts/sendTestEmail.ts someone@email.com  # explicit recipient
 *
 * Requires MAILTRAP_API_KEY in .env.local (see .env.example MAILTRAP_* block).
 * Sandbox mode also requires MAILTRAP_INBOX_ID.
 * Check delivery: https://mailtrap.io/sending/email_logs
 */
import { config as loadEnv } from 'dotenv'
import { resolve } from 'node:path'

loadEnv({ path: resolve(process.cwd(), '.env.local') })
loadEnv({ path: resolve(process.cwd(), '.env') })

const to = process.argv[2]?.trim() || process.env.MAILTRAP_TEST_TO?.trim()
if (!to) {
  console.error(
    'Usage: npx tsx scripts/sendTestEmail.ts <recipient@email.com>\n' +
      '(or set MAILTRAP_TEST_TO in .env.local)',
  )
  process.exit(1)
}

const { sendMailtrapEmail, mailtrapConfigFromEnv } = await import('../server/mailtrap.js')

const cfg = mailtrapConfigFromEnv()
if (!cfg) {
  console.error('No Mailtrap transport configured — set MAILTRAP_SMTP_USER/MAILTRAP_SMTP_PASS or MAILTRAP_API_KEY in .env.local (see .env.example).')
  process.exit(1)
}
const mode =
  cfg.transport === 'smtp'
    ? `SMTP ${cfg.smtp?.host}:${cfg.smtp?.port}`
    : `API ${cfg.api?.sandbox ? `SANDBOX (inbox ${cfg.api?.testInboxId})` : 'LIVE'}`
console.log(`transport: ${mode} · from ${cfg.fromEmail}`)

const result = await sendMailtrapEmail({
  to,
  subject: 'PropertyFlow · Mailtrap integration test',
  text: 'Congrats — PropertyFlow sent this test email through Mailtrap.',
  html:
    '<h2 style="font-family:Arial,sans-serif;">It works 🎉</h2>' +
    '<p style="font-family:Arial,sans-serif;">PropertyFlow sent this test email through the Mailtrap API.</p>',
  category: 'Integration Test',
})

if (result.sent) {
  console.log(`sent ✓  message id: ${result.messageId ?? 'n/a'}`)
  console.log('Check delivery at https://mailtrap.io/sending/email_logs')
} else {
  console.error(`failed ✗  ${result.reason}`)
  process.exit(1)
}
