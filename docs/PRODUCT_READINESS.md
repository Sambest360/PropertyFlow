# Product readiness

Review of PropertyFlow as a product to sell to more than one agency. Findings are ordered by severity. "Fixed" means the change is in this branch. It does not mean the hosted Supabase database has been migrated: that was deliberately not touched.

`npm test`, `npm run lint`, and `npm run build` pass on this branch (lint reports existing warnings, no errors).

## Security

### Critical

1. **Anonymous marketplace RPC returned full user rows.** `get_public_marketplace_bootstrap` and `_lite` are `SECURITY DEFINER` and granted to `anon`. They selected `to_jsonb(u)` from `users`, which includes `password_hash` and `metadata` (ID documents, ID numbers). Files: `database/postgres/migrations/006_public_marketplace_bootstrap.sql`, `007_public_marketplace_rooms.sql`, `008_public_marketplace_lite.sql`. **Fixed in `011_tenant_isolation.sql`** (safe projection). **Not applied** to the hosted database. Run `npm run db:migrate:isolation` against `DIRECT_URL` before treating production as closed.

2. **Any landlord, tenant, or contractor could read every agency's rows.** `003_rls_bootstrap.sql` adds `OR current_app_user_role() IN ('LANDLORD', 'END_USER', 'CONTRACTOR')` to the SELECT policy of leads, applications, leases, payments, documents, messages, and the other `client_id` tables. Postgres ORs permissive policies, so the later "own row" policies do not narrow this. A signed-in tenant can `select *` across agencies, including income, ID numbers, and payment history. **Fixed in `011`** by scoping SELECT to super admin or the caller's `client_id`, plus explicit own-row and published-listing policies. **Not applied** to the hosted database.

3. **A user could promote themselves to super admin.** `users_update_own` allows an authenticated user to update their own row, and `authenticated` has table UPDATE. Nothing stopped `role`, `metadata.frontend_role`, or `metadata.enabledPermissions` from changing. The session reader prefers `frontend_role` (`server/auth.ts`). The same hole exists on insert: `users_insert_admin` lets any agency staff insert a `SUPER_ADMIN`. **Fixed in `011`** (before-insert/update trigger, tighter insert policy) and, for the API, in `server/userWriteGuard.ts`. **The trigger is not applied** until `011` is run. The API guard is in this branch but the Hono API is not what Vercel serves today.

4. **Actor headers were the API identity.** `resolveRequestActor` in `server/index.ts` returned `X-User-Id` / `X-Role` / `X-Agency-Id` (or the same fields in the body) before it looked at the session. Anyone who could reach the API could persist as any user, including super admin. The README used to describe this as intended. **Fixed.** The session is the identity. A different user id is impersonation and is checked with `canImpersonateUser`; role and agency come from the database. Confirmed against the code, not only the README. The current Vercel site does not serve this API (`/api/health` returns the SPA). The fix matters for local API mode and for the day the API is deployed.

5. **`GET /api/bootstrap` without a session returned the whole database**, including user metadata and trust rows (`server/index.ts`). **Fixed** (401 without a session). Same deployment note as item 4. Authenticated responses are also filtered: other agencies' users are dropped, and ID documents are removed unless the caller administers that person (`server/scopeGate.ts`). Property-scoped roles no longer receive trust books. A null `agencyId` used to let those roles through the trust filter.

### High

6. **`password_hash` was selectable by every signed-in user** in the same agency (`GRANT SELECT` on `users` plus `users_select_self_agency`). The app's own query does not ask for the column; a direct PostgREST call can. **Fixed in `011`** (column privileges, and the same-client policy now requires a landlord portfolio or the existing staff policy). **Not applied** until the migration runs.

7. **PayFast checkout trusted the client's amount.** `server/payfastRoutes.ts` used `amountCents` from the body when it was positive, so a caller could open a checkout for a different amount than the ledger. The ITN amount check would then refuse to mark the ledger paid, but the payer could still be charged the wrong amount. **Fixed.** Checkout uses the ledger amount only, requires a session, and only the payer, their agency staff, or a super admin can start it. Live mode now refuses to start without a passphrase (merchant id and key are in the browser form, so an unsigned ITN is forgeable). A missing source IP no longer skips the live IP check. **Not reachable on the current Vercel deploy** until the API is served.

8. **`GET /api/v1/units` listed every unit**, including drafts and `NOT_LISTED`, with no session (`server/unitsFeed.ts`). **Fixed** to published statuses only.

9. **`GET /api/counts` was anonymous** and reported table sizes. **Fixed** to super admin only.

10. **Registration passwords** were only checked for length (`server/auth.ts`, `server/supabase/registerUser.ts`). **Fixed** to the same strength rule as the UI (`passwordMeetsPolicy`). Common prefixes such as `password123!` are rejected.

11. **Client-supplied `passwordHash` on user persist** was written straight into `users.password_hash` (`server/writes.ts`). **Fixed.** Hashes from the client are ignored. A password is hashed only for the signed-in user themselves or for an agency admin setting a temporary password.

12. **CORS allowed any `*.vercel.app` origin** (`server/index.ts`). **Fixed** to localhost, this project's Vercel host, `VERCEL_URL` / `VERCEL_PROJECT_PRODUCTION_URL`, and `CORS_ORIGINS`. Same-origin production traffic does not need that header. A `*` entry in `CORS_ORIGINS` is no longer honoured.

13. **Verification files and ID numbers live in `users.metadata` and `applications`.** Even after the marketplace projection, agency staff who can read `metadata` still see ID documents, and the public RPC still returns the landlord's email because the guest mapper keys off it (`src/lib/supabase/mapGuestMarketplace.ts`). **Not fully fixed.** Move documents to private object storage and stop returning email on the public payload.

14. **`entity_id_map` can be rewritten by any agency staff** (`entity_id_map_mutate` in `003_rls_bootstrap.sql` is `FOR ALL` for `is_agency_staff()`). That table is global, so one agency can retarget another agency's frontend ids. **Not fixed.** It needs a `client_id` (or equivalent) on the map before updates can be scoped. The app upserts this table on every create, so locking it to super admin would break creates.

15. **The whole workspace is copied into `localStorage` (`propertyflow-v18`)** by `src/context/AppStore.tsx`, including people, applications, and messages. On a shared computer that is a POPIA exposure, and it survives logout of the data even when auth keys are cleared. **Not fixed.** Stop persisting the workspace; keep only UI preferences.

16. **Session token is also stored in `localStorage` (`propertyflow-auth-token`)** (`src/lib/api/authClient.ts`) beside the httpOnly cookie. Any XSS can replay it for 14 days (`TOKEN_TTL_SEC` in `server/auth.ts`). Logout deletes the cookie and not a server-side session. **Not fixed.**

### Medium

17. **Rate limits are in-memory** (`server/rateLimit.ts`). They reset on every cold start and are not shared across instances. Fine for one Node process. Not enough for a multi-instance API.

18. **`POST /api/notify/application-received` sends mail to whatever address is posted**, with a per-address cap and no proof that an application exists. Listing enquiries are public by design and are now on a separate IP limit.

19. **No password reset** in either auth mode (`docs/auth-resilience-audit.md`).

20. **New accounts are pre-confirmed.** Someone can register an address they do not own. Landlord and contractor publish paths stay behind manual verification, which limits the blast radius but is not a substitute for confirming email.

21. **Staff-created users default to the temporary password `ChangeMe123!`** (`src/pages/admin/AdminUserCreatePage.tsx`, `src/context/AppStore.tsx`). It is shown to the admin. It is still a known password if they do not change it.

22. **PayFast live IP check trusts `X-Forwarded-For`.** Clients can spoof that header unless the platform overwrites it. The passphrase check is the control that matters. Sandbox mode still skips the IP allow-list on purpose.

23. **Cookies** are `Secure` in production now. JWT lifetime is still 14 days.

24. **POPIA.** The product stores ID numbers, income, employment notes, and document images, and it does not yet have a recorded lawful basis, retention limit, export, or deletion workflow. Public enquiry accepts an ID number (`server/publicEnquiry.ts`). There is no operator agreement or subprocessor list (Supabase, Vercel, PayFast, Mailtrap, Google Maps). Cross-tenant reads (items 1 and 2) are the urgent POPIA failures; the rest is product work.

25. **First registered user becomes super admin** (`server/auth.ts`, `handle_new_auth_user`). Correct for an empty project. Dangerous if `users` is ever truncated on a database that is still reachable.

### What was checked and is in decent shape

- SQL identifiers in `server/writes.ts` and `server/scopeGate.ts` are quoted and constrained. Writes use parameters.
- Passwords are bcrypt.
- JWT signatures use a timing-safe compare. `AUTH_SECRET` is required.
- PayFast passphrase and merchant key are server-side. ITN signatures are checked, and a COMPLETE ITN must match the ledger amount.
- Firestore is gone. The old rules file denied client access; the SDK was unused and has been removed.
- Firebase project ids in the old `.env.example` were public config, not secrets. They are no longer in the example file.

## Architecture and scale

**Two write paths.** Production writes with the user's Supabase JWT. Local/API mode writes with the database owner, which bypasses RLS, and must enforce scope itself. Both have to stay correct. That split is the main structural risk.

**The API is not deployed.** `vercel.json` has no function. `/api/*` on the production host is the SPA. Signup already falls back to GoTrue when the response is not JSON (`src/lib/supabase/auth.ts`). Email side-effects that call `/api` do nothing in production until a function is added. Adding one is a deploy change: do it only together with `011` and `AUTH_SECRET`.

**Bootstrap is a wide read.** `server/bootstrap.ts` and `src/lib/supabase/data.ts` load most tables for the signed-in user (caps of a few hundred to 10,000 rows, images included on the full pass). `buildActorPropertyScope` loads every unit, application, lease, and ticket to authorize one write. That is acceptable for a demo book and will not hold a large agency, and it is an N-pattern against Postgres on every save.

**Indexes.** `001_performance_indexes.sql` and the schema cover the main foreign keys and the listing feed. There is no keyset pagination on the workspace load, only a row cap.

**Files.** Images and PDFs are data URLs in JSONB. One listing photo can be megabytes. The lite marketplace RPC exists because the full payload was timing out. Object storage (Supabase Storage, private buckets, signed URLs) is the replacement. Do not put ID documents in a public bucket.

**Serverless fit.** The Hono process keeps a `pg` pool, an in-memory id map, and in-memory rate-limit buckets. `server/dbConfig.ts` already warns that Vercel must use the transaction pooler. Those caches are wrong once more than one instance runs. Do not turn the API on as a long-lived Node server and as a fan-out of lambdas without moving that state out.

**Client cache.** `localStorage` of the full store will hit quota as soon as real photos are in the snapshot, and it duplicates the authorization bug if a previous user's snapshot is still on disk.

## Infrastructure

- **Deploy.** Vercel static SPA. No preview-database story, no migration step in the deploy.
- **Schema change.** Ad-hoc `psql` files. Duplicate `007_*` and `008_*` numbers. No migration runner, no record of what has been applied. `011` will not apply itself.
- **Backups.** Not described in the repo. Whatever Supabase's plan provides is the backup. There is no tested restore.
- **Secrets.** `.env.example` is a template. `.gitignore` ignores `.env` and `.env.*`. Server secrets are not `VITE_` prefixed. The publishable Supabase key is in the client bundle on purpose.
- **Observability.** `console.error` on a few routes and Vercel Speed Insights in the client. No structured logs, no alert on failed login spikes, no audit table for impersonation, role changes, or payment status changes. `event_log` exists and is not a security audit.
- **CI.** No workflow. Quality depends on someone running the three npm scripts.
- **Email and payments.** Sandbox defaults. Going live is documented for Mailtrap (`docs/mailtrap-going-live.md`) and is a config change, not code.

## Quality

| Check | Result |
| --- | --- |
| `npm test` | Pass. 335 tests, 5 skipped. The skipped file is the live API smoke (`src/lib/apiSmoke.test.ts`), which runs only when `PF_API_SMOKE=1`. Those smoke cases now expect anonymous bootstrap, counts, and header-only writes to be rejected. |
| `npm run lint` | Pass (oxlint). Remaining warnings are existing unused imports and escape-character nits, not this change. |
| `npm run build` | Pass (`tsc -b` and Vite). The main chunk is about 800 kB minified. |

Coverage is thin where it matters most. There are good unit tests for scope filtering, PayFast signatures, rate limits, password strength, and lead requirements. There is no test that boots Postgres and proves one agency cannot read another under RLS. The new tests cover the pure guards (session versus forged headers, user-write privilege, ledger amount, live ITN without an IP). They do not execute `011` against a database.

Critical paths with little or no automated coverage: Supabase signup and the profile trigger, RLS policies, persist of applications and payments, PayFast ITN against a real ledger row, and the guest marketplace RPC shape.

## Product and operations

To sell this to agencies, the missing pieces are operational, not another CRM screen.

- **Onboarding.** An agency is a form the super admin fills in. There is no self-serve trial, invite email that is not a temp password, or checklist (FFC, trust account, bank details, branding).
- **Plans and billing.** The billing engine can draft an invoice from floor area and unit counts. Nothing collects it, dunning does not exist, and a suspended agency is a status flag the UI knows about rather than a subscription PayFast owns.
- **Branding.** `clients.subdomain` is stored. The app is one Vercel host. No custom domain, logo, or colour per agency. Marketplace listings are one combined catalogue, which may be what you want for a portal and is wrong if each agency expects its own site.
- **Admin.** Super admin can create agencies and users and impersonate. There is no support console for "this agency cannot log in", no impersonation audit, and no way for an agency to export or delete a person's data.
- **Docs.** README is a local empty-start guide. There is no agency admin guide, no POPIA notice, and no runbook for restore or incident response.
- **Isolation proof.** You cannot yet hand an agency a one-page answer to "can another agency see our tenants?". After `011` is applied, that answer should be demonstrated with two test accounts, not only by reading SQL.

## Roadmap

Sizes are relative effort for this codebase: **S** is a focused change in a few files, **M** crosses the API and the database, **L** is a new subsystem. None of these belong in the foundations pull request.

### Phase 2 — make the current deploy safe to put a second agency on

Apply and prove isolation before new features.

- Apply `011_tenant_isolation.sql` on the hosted database and re-test with two agencies, a tenant, and an anonymous marketplace call (**S**, operational).
- Add a CI job that applies the schema and migrations to a throwaway Postgres and asserts cross-tenant reads fail (**M**).
- Move ID documents and listing photos to private object storage; stop putting them in JSON and in `localStorage` (**M**).
- Put the Hono app on Vercel as one function (or stop calling `/api` from production), with `AUTH_SECRET` and the pooler URL (**M**). Do not do this before `011`.
- Scope `entity_id_map` to the owning agency (**M**).
- Short-lived sessions, no bearer token in `localStorage`, password reset, and an audit row for impersonation and role changes (**M**).
- POPIA minimum: privacy notice, purpose per data category, retention for applications and documents, and a way to export and delete one person (**M**).

### Phase 3 — an agency can sign up and pay

- Self-serve agency trial: invite principal, email confirmation, forced password change, agency profile (**M**).
- Turn `billing_plans` / `client_subscriptions` into real PayFast subscriptions, with past-due suspension that the API and RLS both honour (**L**).
- Per-agency branding and optional custom domain or subdomain routing (**L**).
- Replace the full-table bootstrap with paged, agency-scoped queries; drop the client-side copy of the database (**L**).
- Shared rate-limit store and structured logs with an alert on auth failures and ITN rejects (**M**).
- Migration runner (one sequence, applied-version table) and a documented backup restore (**M**).

### Phase 4 — operable as a business

- Support admin: impersonation audit, agency health, "login as" that is a server session rather than a client header (**M**).
- Agency-facing admin guide and a data-processing agreement (**S**).
- Background jobs for mail, billing runs, and image processing, instead of fire-and-forget inside the request (**M**).
- Load test the listing feed and the workspace against a book the size of a mid-size agency (**S** once phase 3 pagination exists).
- Decide whether the public marketplace is one national portal or a white-label site per agency, and split the read models accordingly (**L**).

The recommended next phase is phase 2, starting with applying `011` and proving two agencies cannot see each other. Until that migration is on the hosted database, the production Supabase project still has the critical read and privilege bugs described above.
