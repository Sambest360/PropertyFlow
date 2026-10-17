# Lekaya — QA User Roles & Test Guide (Live)

**For testers on the live site.** No terminal or local setup required.

## Shareable URL (not linked in the app UI)

| | |
|---|---|
| **Live QA guide** | `https://your-live-domain/qa-guide` |
| **Alternate** | `https://your-live-domain/qa-guide.html` |

This page is served as a static document — it does not appear in the marketplace header, workspace sidebar, or any navigation menu. Share the `/qa-guide` URL directly with testers.

After deploy, replace `your-live-domain` with your production host (e.g. `property-flow.vercel.app`).

## Document files (repo)

| Format | File |
|--------|------|
| **Deployed (public)** | [`public/qa-guide.html`](../public/qa-guide.html) |
| **Source copy** | [`docs/QA-USER-ROLES.html`](./QA-USER-ROLES.html) |

Open in Word: **File → Open** the HTML file → **Save As .docx**

## Quick credentials

| Account | Email | Password |
|---------|-------|----------|
| Super Admin | `sambampo200@gmail.com` | `secret` |
| All other test users | `@propertyflow.demo` emails in the guide | `secret` |

## What's in the full guide

1. Test environment setup (linked pages)
2. Complete user roster (staff, tenants, contractors)
3. Role definitions & permission matrix
4. Tenant lifecycle / occupancy gating
5. Detailed test scripts for every role (A–J)
6. Cross-role workflows
7. UI checklist & troubleshooting
8. Property ↔ tenant map
9. **CRUD tests** — Create / Read / Update / Delete matrix and scripts
10. Bug reporting appendix

**Browser only — no commands required.**
