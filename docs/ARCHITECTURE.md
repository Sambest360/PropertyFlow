# PropertyFlow architecture

PropertyFlow is a multi-tenant property management and sales product aimed at South African agencies. One platform account (a super admin) creates agencies. Each agency runs its own book: buildings and units, listings, leads, applications, viewings, leases, maintenance, documents, messaging, and a trust-account style ledger. Landlords, tenants, contractors, and applicants use narrower portals into the same data.

The interface is a Vite + React 19 single-page app. The database is Postgres, hosted on Supabase in the deployed environment. A Hono API in `server/` is the local and future server path. It is not what the current Vercel deployment serves.

## What a user can do

Public visitors browse and search published listings, save favourites, and use bond/transfer calculators (`/`, `/browse`, `/listing/:id`). They can enquire or book a viewing without an account, and they can register and apply.

Agency staff work in `/workspace`: properties, a lead pipeline, applications, viewings, maintenance and contractors, documents, messages, payments, compliance, trust books, and reports. Principals manage staff and agency settings. The super admin creates agencies, reviews landlord and contractor verification, and can impersonate a user to see their workspace.

Portals:

- Landlord (`/workspace/portals/owner`) — own buildings, listings, applications, maintenance.
- Tenant (`/workspace/portals/tenant`) — applications, viewings, maintenance, messages, complaints.
- Contractor (`/workspace/portals/contractor`) — assigned jobs.

PayFast is wired for tenant and sale payments (sandbox by default). There is an internal SaaS billing calculator (plans, subscriptions, invoices) for charging agencies by portfolio size. It does not yet collect those fees.

## Roles

Stored in `users.role` (database) and `users.metadata.frontend_role` (what the UI uses).

| UI role | Database role | Who they are |
| --- | --- | --- |
| `super_admin` | `SUPER_ADMIN` | Platform owner. First account on an empty database. Not tied to one agency. |
| `client_admin` | `AGENCY_ADMIN` | Agency principal. Full agency book, staff, settings. |
| `agent_admin` | `AGENT_ADMIN` | Agency admin. Team and operations, not platform setup. |
| `ground_agent` / `agent` | `GROUND_AGENT` | Field agent. Own listings and deals, not the whole agency. |
| `landlord` | `LANDLORD` | Property owner. Self-registration creates a private portfolio client. |
| `tenant` | `END_USER` | Occupant or applicant. Public registration as "applicant" is stored as tenant. |
| `contractor` | `CONTRACTOR` | Maintenance vendor. Jobs they are assigned. |

Permissions live in `src/lib/permissions.ts` and can be narrowed per agency (`clients.settings.enabledPermissions`) and per user (`users.metadata.enabledPermissions`). Routes are wrapped in `Guard` / `RequirePermission` in `src/App.tsx`. That check is client-side. The real boundary is row-level security in Supabase mode, and `server/scopeGate.ts` in API mode.

## Main features

- **Agencies and people.** Super admin creates agencies. Principals add staff. Landlords and contractors submit ID documents and wait for approval (`users.metadata.verification`).
- **Portfolio.** Buildings, units, rooms, internal assets, listing publish state, photos.
- **Sales.** Leads with a configurable stage pipeline (`LeadPipelineSettingsPage`), applications, viewings and slots, lease creation on approval.
- **Operations.** Maintenance tickets, contractor assignment, documents, in-app messages, notifications.
- **Money.** Rent and deposit payments, PayFast checkout and ITN, a trust cashbook (transactions, allocations, payouts, deposits, arrears, CSV import).
- **Marketplace.** Guest browse of published listings, enquiries, applications.
- **Platform billing.** `billing_plans`, `client_subscriptions`, `invoices`, and `src/lib/billingEngine.ts`. A super-admin screen previews usage fees. It is not a customer checkout.
- **Email.** Mailtrap (SMTP or API) for welcome, enquiry, application, verification, and payment mail. See `server/mailtrap.ts`.

## Data model

Postgres schema: `database/postgres/schema.sql`. An agency is a row in `clients` (company, subdomain, status, settings JSON). Almost every business table has `client_id`.

Core tables: `users`, `buildings`, `units`, `rooms`, `internal_assets`, `leads`, `applications`, `leases`, `viewing_slots`, `bookings`, `maintenance_tickets`, `payments`, `documents`, `message_threads`, `messages`, `notifications`, `event_log`, `client_lookup_configs`.

Trust tables were added in `database/postgres/migrations/007_trust_banking.sql`. Billing tables are `billing_plans`, `client_subscriptions`, `invoices`.

The UI does not use database UUIDs as its primary keys. `entity_id_map` translates frontend ids (`ag-…`, `u-…`, `PR-…`) to UUIDs. User and agency ids are also copied into `users.metadata.frontend_id` and `clients.settings.frontend_id`.

Photos and registration documents are often base64 data URLs inside JSON (`units.images`, `users.metadata.verification.documents`), not object storage. That is why marketplace reads have a "lite" variant that returns only the cover image.

Migrations are numbered SQL files under `database/postgres/migrations/`, applied by hand with `psql`. Numbers 007 and 008 are each used more than once, so order is the filename, not a single sequence. `npm run db:migrate` only applies `001_performance_indexes.sql`. `npm run db:migrate:isolation` applies `011_tenant_isolation.sql`.

## Auth and multi-tenancy

There are two ways to sign in. Which one runs is decided in the browser by `src/lib/api/config.ts`.

**Supabase mode** (production today). If `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` are set, the browser uses `@supabase/supabase-js`. Sign-in is GoTrue `signInWithPassword`. Registration prefers `POST /api/auth/register-supabase` (the server inserts a pre-confirmed `auth.users` row) and falls back to GoTrue signup when that route is not JSON. A trigger (`handle_new_auth_user`) creates `public.users` and links `auth_user_id`. The first user becomes super admin. Reads and writes go through the browser client, so Postgres row-level security is the isolation boundary. Helpers `current_app_client_id()`, `is_super_admin()`, and `is_agency_staff()` are in `database/postgres/migrations/002_supabase_auth.sql`.

**API mode** (local, and production only if the Supabase env vars are absent). The Hono server checks email and bcrypt `users.password_hash`, then sets an HMAC JWT (`AUTH_SECRET`) as an httpOnly cookie and returns it to the client. Writes go to `POST /api/persist`. The server used to trust `X-User-Id`, `X-Role`, and `X-Agency-Id`. It no longer does. The session is the identity. A different user id is an impersonation request, allowed only when `canImpersonateUser` passes, and the target's role and agency are loaded from the database. Property scope is enforced in `server/scopeGate.ts` using the same rules as `src/lib/scope.ts`.

Impersonation in the UI (`src/context/AuthContext.tsx`) switches the actor the client sends. In Supabase mode the browser still uses the real user's JWT, so row-level security sees the real user. In API mode the server now checks that impersonation.

`GET /api/bootstrap` loads a workspace snapshot for the caller. It resolves the session before any database read. Anonymous callers get 401 and no query runs. Agency and role predicates are in the SQL, so another agency's rows are not loaded; an in-memory filter remains as a second check. Property-scoped roles do not receive trust books or other agencies' users. ID numbers and verification files are stripped from users the caller does not administer.

The guest marketplace does not use that snapshot. It calls the security-definer functions `get_public_marketplace_bootstrap` and `get_public_marketplace_bootstrap_lite`, which return published listings only.

## Which backends are live

| Path | Status |
| --- | --- |
| Supabase Postgres + GoTrue, browser client | **Live in production.** The deployed JS bundle is configured with a Supabase project URL and a publishable key. |
| Hono API + `DATABASE_URL` | **Live locally** (`npm run dev:full`, port 8787, Vite proxy). **Not served on Vercel today.** `https://property-flow-jet.vercel.app/api/health` returns the SPA HTML, because `vercel.json` rewrites every non-asset path to `index.html` and there is no `api/` function. |
| `localStorage` key `propertyflow-v18` | **Degraded cache**, not the source of truth. `AppStore` mirrors the whole workspace there so a refresh paints before the network returns. It still holds personal data on the device. |
| Firebase / Firestore | **Removed.** The client module was unused. `firestore.rules` denied all reads except a health document. Nothing in the app imported it. |
| In-memory demo seed | **Fallback** when neither Supabase nor the API can load listings (`buildPublicMarketplaceDemoBootstrap`). Not the production data. |

`src/lib/supabase/data.ts` and `src/lib/supabase/persist.ts` are the production read and write path. `src/lib/api/postgresClient.ts` and `src/lib/api/persist.ts` are the API-mode path.

## Deployment

- **Hosting.** Vite build (`npm run build`) uploaded to Vercel. `vercel.json` sets long-lived cache headers for hashed assets and SPA fallback. There is no serverless function entry for the Hono app, even though `server/index.ts` exports the app and skips `serve()` when `VERCEL` is set.
- **Database.** Supabase Postgres. The app expects the transaction pooler (port 6543) on Vercel and the direct connection (`DIRECT_URL`, port 5432) for migrations. See `server/dbConfig.ts`. Remote connections verify TLS (`rejectUnauthorized: true`). Set `DATABASE_SSL_CA` to the pooler CA PEM when Node does not already trust it. Plain connections are allowed only to localhost.
- **Config.** Client variables are `VITE_*` and are baked into the bundle. Server secrets (`DATABASE_URL`, `AUTH_SECRET`, `SUPABASE_SECRET_KEY`, PayFast, Mailtrap) must not use the `VITE_` prefix. Template: `.env.example`.
- **Email.** Mailtrap sandbox by default (`MAILTRAP_USE_SANDBOX=true`).
- **Payments.** PayFast sandbox unless `PAYFAST_MODE=live`. Live mode refuses to start without `PAYFAST_PASSPHRASE`. ITNs require a signature in sandbox and live, a matching merchant id, a ledger amount match, and a PayFast source IP taken only from the platform header (`x-real-ip` on Vercel). `X-Forwarded-For`, `Forwarded`, and `X-Client-IP` are ignored. A payment is marked paid only after the validate postback returns VALID. `PAYFAST_VALIDATE_URL` can point that postback at a local stub. `PAYFAST_ITN_LOCAL=1` is a QA-only mode: the platform address and an in-process validate stub are secret-gated, so a normal request cannot set them. See `docs/payfast-itn-qa.md`. Duplicate ITNs do not credit twice. The checkout contract is `POST /api/payfast/create` (see `server/payfastRoutes.ts`).
- **CI.** GitHub Actions runs `npm test`, `npm run lint`, `npm run build`, and `npm run secrets:scan` (gitleaks on the current tree). `npm run secrets:history` reports leaks still present in git history without rewriting it.

## Request flow (production)

1. Browser loads the SPA from Vercel.
2. Guest browse calls the public marketplace RPC with the publishable key.
3. Sign-in calls GoTrue. The session JWT is stored by supabase-js.
4. Workspace load selects from `public` tables. RLS is supposed to limit rows to the caller's agency, their own applications, or published listings.
5. Edits upsert through the same browser client (`src/lib/supabase/persist.ts`).
6. Some side effects still try the Hono routes (verification decision email, application-received email). Application-received requires a session and a reference code. Another PR deletes that route and sends the mail from application create. On the current Vercel deploy those routes are the SPA, so the calls fail and the UI continues.

## Request flow (local API mode)

1. `npm run dev:full` starts Vite and Hono.
2. Login hits `POST /api/auth/login` and stores the session cookie.
3. `GET /api/bootstrap` returns the workspace filtered for that user.
4. Edits hit `POST /api/persist`, which checks the session, then property scope, then writes with the database owner role (RLS does not apply to that connection).
