# Mailtrap — Going Live with Real Email Sending

Current state: emails are sent through Mailtrap's **sandbox** SMTP host
(`sandbox.smtp.mailtrap.io`). Everything lands in a testing inbox and **no real
customer ever receives mail**. Nothing reaches production until you switch
credentials.

## What is already wired (production-ready code paths)

| Event | Recipient | Category |
| --- | --- | --- |
| Registration completed (Supabase mode) | New user | `welcome` |
| Guest enquiry / viewing request — confirmation | Guest | `listing-enquiry` |
| Guest enquiry / viewing request — agent + landlord alert | Agent, Landlord | `listing-lead-alert` |
| Application submitted — confirmation | Applicant | `application-received` |
| Application approved | Applicant | `application-approved` |
| PayFast payment settled | Payer | `payment-receipt` |
| Rent dunning notice (staff action; **flag default OFF**) | Tenant | `rent-dunning` |

Every send site is fire-and-forget: a mail failure can never fail the API route
or user flow that triggered it. Unconfigured mail = silent no-op (a reason is
logged, nothing throws).


### Rent dunning (`rent-dunning`) — DQ-M4 Mode A

Requires `ENABLE_EMAIL_DUNNING=true` (or `DUNNING_EMAIL_ENABLED=true`). When unset/false,
staff dunning stays **in-app only** (Mode A always). When on + Mailtrap configured, the
staff "Send dunning notice" action may also fire a sandbox email. This is **not**
WhatsApp, SMS, or carrier delivery confirmation. Failures never fail the UI.

## Switch to real sending — checklist

1. **Verify your sending domain** at https://mailtrap.io/domains
   (add `yourdomain.co.za`, add the DNS records Mailtrap shows: DKIM, SPF,
   verification). Sender addresses must be on this domain for live sending.
2. **Get production SMTP credentials**: Mailtrap → Sending → Inboxes →
   your production inbox → SMTP Settings shows a **different host/user/pass**
   than the sandbox one (e.g. `send.smtp.mailtrap.io` vs
   `sandbox.smtp.mailtrap.io`).
3. **Update `.env.local`** (and Vercel env vars for production):

   ```sh
   MAILTRAP_SMTP_HOST=send.smtp.mailtrap.io   # production host from step 2
   MAILTRAP_SMTP_PORT=587
   MAILTRAP_SMTP_USER=<production inbox user>
   MAILTRAP_SMTP_PASS=<production inbox pass>
   MAILTRAP_FROM_EMAIL=no-reply@yourdomain.co.za   # must be on the verified domain
   MAILTRAP_FROM_NAME=PropertyFlow
   ```

   Alternatively (API transport): keep `MAILTRAP_API_KEY`, set
   `MAILTRAP_USE_SANDBOX=false`, and delete `MAILTRAP_INBOX_ID`.
4. **Test** with `npm run email:test you@realemail.com` and confirm it arrives
   in a real inbox (check spam too), then verify at
   https://mailtrap.io/sending/email_logs (category + status per message).
5. **Watch the logs** after go-live: every send logs
   `[mailtrap] sent (smtp) to <addr> msg=<id>` — grep `/tmp/pf-api.log` (local)
   or Vercel logs.

## Sandbox vs live — what the code does

- Sandbox creds in `.env.local` right now → all mail lands in the testing
  inbox. Safe for QA.
- The code has **no sandbox/live logic beyond transport choice** — whichever
  SMTP host you configure is the one it uses. Accidental live blasts can't
  happen from a stale sandbox credential; they could only happen if someone
  pastes production credentials into a dev environment, so keep them in Vercel
  only.
- `hello@demomailtrap.co` is only valid in sandbox — live sending requires the
  verified-domain address above (the default changes automatically once
  `MAILTRAP_FROM_EMAIL` is set).

## Deliverability hygiene

- Warm up gradually: Mailtrap docs recommend ramping volume over the first
  weeks rather than blasting at once.
- Keep the transactional categories (see table) — Mailtrap's email logs let you
  monitor bounces/spam complaints per category.
- Every email includes a plain-text part (required by many spam filters) — the
  wrapper always sends `text` + `html`.
