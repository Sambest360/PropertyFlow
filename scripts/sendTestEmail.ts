/**
 * Send a test email through the configured provider (Brevo, SMTP or Mailtrap).
 *
 * Usage (on the server, from /var/www/propertyflow):
 *   npx tsx scripts/sendTestEmail.ts someone@email.com
 *
 * Provider settings live in .env — see the EMAIL block in .env.example.
 */
import { config as loadEnv } from 'dotenv'
import { resolve } from 'node:path'

loadEnv({ path: resolve(process.cwd(), '.env.local') })
loadEnv({ path: resolve(process.cwd(), '.env') })

const to = process.argv[2]?.trim() || process.env.EMAIL_TEST_TO?.trim()
if (!to) {
  console.error('Usage: npx tsx scripts/sendTestEmail.ts <recipient@email.com>')
  process.exit(1)
}

const { emailProvider, emailSender } = await import('../server/email/send.js')
const { sendTemplateEmail } = await import('../server/email/templates.js')

const provider = emailProvider()
if (provider === 'log') {
  console.error('No email provider configured — set BREVO_API_KEY or SMTP_HOST/SMTP_USER/SMTP_PASS in .env.')
  process.exit(1)
}
console.log(`provider: ${provider} · from ${emailSender().email}`)

const result = await sendTemplateEmail('test', { to, name: 'there' })
if (result.sent) {
  console.log(`sent ✓  message id: ${result.messageId ?? 'n/a'}`)
} else {
  console.error(`failed ✗  ${result.reason}`)
  process.exit(1)
}
