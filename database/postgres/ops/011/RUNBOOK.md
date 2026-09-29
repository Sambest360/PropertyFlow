# Apply migration 011 (tenant isolation)

011 tightens Row Level Security so a landlord, tenant, or contractor cannot read another agency's rows, blocks self-service changes to privilege columns on `users`, hides `password_hash` from the `authenticated` role, and replaces the public marketplace RPCs with an explicit column allow-list. Landlord objects expose `landlord_id` and `display_name`, not email.

It has not been applied to the hosted database. Do not apply it until the CEO approves this procedure. Do not merge this branch to `main` as part of the apply.

The hosted project was not contacted from the rehearsal environment. Production drift (hand-edited policies, objects that are not in migrations 001-010) is untested. The pre-apply assert below stops the apply if the wide `leads_select` policy is already gone, but it is not a full schema diff.

## What was rehearsed locally

`npm run db:rehearse:011` builds a throwaway Postgres database, applies `schema.sql` and migrations 001-010 in filename order, loads two agencies, proves the isolation checks fail before 011, applies 011, proves they pass, rolls back, and diffs the catalog. Docker was not available in the rehearsal VM, so this uses plain Postgres with `anon`, `authenticated`, `service_role`, `auth.uid()` / `auth.jwt()`, `auth.users`, and an empty `supabase_realtime` publication. It is not the Supabase CLI stack and it is not the hosted project. Hosted Supabase is Postgres 15; the rehearsal cluster is Postgres 16. 011 does not use version-specific syntax beyond what both support (`EXECUTE FUNCTION` on triggers, no `CREATE INDEX CONCURRENTLY`).

011 itself has no top-level `BEGIN`/`COMMIT` and no statement that cannot run inside a transaction. `apply.sh` rejects the file if that changes. The `BEGIN` keywords inside 011 are PL/pgSQL bodies, not transaction control.

## 1. Confirm backups before anything else

In the Supabase dashboard open **Database → Backups** for this project.

| Plan | Daily backups | Point-in-Time Recovery |
| --- | --- | --- |
| Free | Not included. Take your own logical dump and keep it off-site. | Not available. |
| Pro | Last 7 days, under Database → Backups. | Add-on. Needs at least a Small compute add-on. Enabling PITR stops the separate daily backup job because PITR is finer. |
| Team | Last 14 days. | Same add-on. |
| Enterprise | Up to 30 days. | Same add-on. |

PITR, when enabled, is under **Database → Backups → Point in Time**. WAL is archived about every two minutes (sooner if the volume is high). The dashboard shows the earliest and latest recovery points. If there has been no recent write, the latest point can lag the clock while still matching the current data.

Write down, in the change ticket:

- the plan name
- whether daily backups are listed and the time of the newest one
- whether PITR is enabled and the latest recovery point

If the project is on the Free plan, or PITR is off and you cannot see a daily backup from today, do not apply 011 until a fresh logical dump (next section) is stored and someone else has confirmed they can see the file.

Restoring a daily backup or a PITR point from the dashboard takes the project offline until it finishes. Subscriptions and replication slots other than Realtime have to be dropped before a dashboard restore and recreated after. Daily backups do not include passwords for custom roles. Storage objects are not in the database backup.

## 2. Take a logical dump as well

Use the **direct** connection string (host `db.<project-ref>.supabase.co`, port **5432**), from **Project Settings → Database → Connection string → Direct**. Do not use the transaction pooler on port **6543**. `apply.sh` refuses port 6543.

Store dumps outside the git repo and outside Vercel. A private operator machine or an encrypted bucket the company already uses for database backups is enough. Restrict the file to the people who can already read production.

```bash
export DATABASE_URL='postgresql://postgres.<ref>:<password>@db.<ref>.supabase.co:5432/postgres?sslmode=require'
mkdir -p "$HOME/propertyflow-backups"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"

# Schema and data. This is the copy you would reload from.
pg_dump "$DATABASE_URL" --format=custom --no-owner \
  --file="$HOME/propertyflow-backups/pre-011-${stamp}.dump"

# Public schema only, including ACLs, for a readable diff.
database/postgres/ops/011/schema_dump.sh \
  "$HOME/propertyflow-backups/pre-011-${stamp}-public-schema.sql"

# Catalog of the objects 011 touches (policies, functions, grants, triggers, RLS flags).
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -A -t \
  -f database/postgres/ops/011/pre_apply_snapshot.sql \
  >"$HOME/propertyflow-backups/pre-011-${stamp}-snapshot.txt"
```

`pg_dump` from Postgres 16 prints a random `\restrict` line. That line differs on every run. Strip `^\restrict` and `^\unrestrict` before diffing two schema dumps. The snapshot file does not have that token; diff that file directly.

### How to restore

Prefer the smallest restore that fixes the failure.

1. **011 committed, but `verify.sql` fails or the smoke test fails.** Run the rollback in section 6. That puts policies, functions, triggers, and grants back to migrations 001-010 as they are in the repo. It does not reload data. It does not put back a policy somebody edited by hand in the dashboard.
2. **The apply script errors.** The script is one transaction. Postgres rolls it back. Do not also run `rollback.sh` unless you confirmed 011's objects exist (`protect_user_privileged_columns`).
3. **Rollback is not enough (drift, or data was damaged).** Dashboard → Database → Backups → restore the daily backup from before the change, or PITR to a time before the apply. The project is unavailable during the restore.
4. **Logical reload, last resort.** This overwrites the database with the dump:

```bash
pg_restore --clean --if-exists --no-owner \
  --dbname="$DATABASE_URL" \
  "$HOME/propertyflow-backups/pre-011-${stamp}.dump"
```

`--clean` drops objects before recreating them. Do this only when dashboard PITR or a daily restore is not possible. Take a new dump of the broken database first if you still need it.

## 3. Rehearse where a mistake is cheap

Local, already done when this branch is green:

```bash
npm run db:rehearse:011
```

Before production, repeat the apply on a **copy** of production. A Supabase preview branch (or a separate staging project restored from the dump) is the right copy, because it includes production policies if they have drifted. **Do not create that branch or project until someone with billing access approves it.** This rehearsal did not create one.

On that copy:

1. Run `pre_apply_snapshot.sql` and diff it against the production snapshot from section 2. They should match if the branch was cloned after the dump.
2. Run `apply.sh`, then `verify.sh` with real agency UUIDs from that copy (section 5).
3. Run `rollback.sh` and diff the snapshot again. It must be empty only if that database was built from the same 001-010 definitions. If production has drifted, the diff will not be empty and you stop.

Migration order used for 001-010, because `007` and `008` are reused: lexicographic filename. `007_clear_demo_applications.sql` deletes every application. It is already applied on production if staff see an empty applicants list; do not re-run it against production as part of this change.

## 4. Apply

Low traffic. The script sets `lock_timeout` to 5 seconds and `statement_timeout` to 60 seconds, then runs 011 in a single transaction. If a live query holds a lock on `users` or another touched table, the apply errors and rolls back instead of waiting. That is the intended failure. Look at `pg_blocking_pids` / the dashboard query report, and retry once the blocker is gone. Do not raise `lock_timeout` so the migration sits behind an unknown session.

```bash
export DATABASE_URL='postgresql://postgres.<ref>:<password>@db.<ref>.supabase.co:5432/postgres?sslmode=require'
npm run db:migrate:isolation
```

That npm script is `database/postgres/ops/011/apply.sh`. The command it runs:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 --single-transaction \
  -c "SET lock_timeout = '5s'" \
  -c "SET statement_timeout = '60s'" \
  -c "SET idle_in_transaction_session_timeout = '60s'" \
  -f database/postgres/migrations/011_tenant_isolation.sql
```

`apply.sh` first checks that 011 is transaction-safe, then runs `pre_apply_assert.sql`. The assert refuses to continue if `protect_user_privileged_columns` already exists, or if `leads_select` is no longer the wide 003 policy (the expression must still mention `END_USER`). A refusal means production does not match the repo. Stop and compare the snapshot to `rollback.sql` before trying again.

`DIRECT_URL` is accepted if `DATABASE_URL` is unset, because older npm scripts used that name. Set `DATABASE_URL` anyway so the command matches this runbook.

## 5. Verify

Pick an `END_USER` and an `AGENCY_ADMIN` in agency A, and a second agency B that actually has rows in the tenant tables (a published landlord listing in A is required for the anon RPC check). Run this read-only lookup on the direct connection and keep the result in the operator session, not in a ticket:

```sql
SELECT c.id AS agency_id, c.company_name,
       u.id AS user_id, u.auth_user_id, u.role
FROM users u
JOIN clients c ON c.id = u.client_id
WHERE u.role IN ('END_USER', 'AGENCY_ADMIN', 'LANDLORD')
ORDER BY c.company_name, u.role;
```

`tenant_a_user_id` is `public.users.id`. `tenant_a_auth_id` is `users.auth_user_id` (what `auth.uid()` returns). `landlord_a_user_id` is the `public.users.id` of a landlord whose building has a published unit, so the anon payload is not empty. `landlord_a_auth_id` is that landlord's `auth.uid()`. `staff_a_user_id` is the agency admin's `public.users.id`. `unlinked_a_user_id` is an `END_USER` in agency A with no lease and no application on that landlord's buildings.

The privilege updates run inside a subtransaction that rolls back. The script aborts if that tenant's role or first name changed. Still run it on the staging copy first.

```bash
export TENANT_A_AUTH_ID='...'
export TENANT_A_USER_ID='...'
export STAFF_A_AUTH_ID='...'
export AGENCY_A_ID='...'
export AGENCY_B_ID='...'
export LANDLORD_A_USER_ID='...'
export LANDLORD_A_AUTH_ID='...'
export STAFF_A_USER_ID='...'
export UNLINKED_A_USER_ID='...'
database/postgres/ops/011/verify.sh
```

Equivalent:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -v tenant_a_auth_id="$TENANT_A_AUTH_ID" \
  -v tenant_a_user_id="$TENANT_A_USER_ID" \
  -v staff_a_auth_id="$STAFF_A_AUTH_ID" \
  -v agency_a_id="$AGENCY_A_ID" \
  -v agency_b_id="$AGENCY_B_ID" \
  -v staff_a_user_id="$STAFF_A_USER_ID" \
  -v landlord_a_user_id="$LANDLORD_A_USER_ID" \
  -v landlord_a_auth_id="$LANDLORD_A_AUTH_ID" \
  -v unlinked_a_user_id="$UNLINKED_A_USER_ID" \
  -f database/postgres/ops/011/verify.sql
```

Claims match migration 002. `auth.uid()` reads `request.jwt.claim.sub`, then `request.jwt.claims ->> 'sub'`. `current_app_user_id()`, `current_app_client_id()`, and `current_app_user_role()` are `SECURITY DEFINER` and select `public.users` where `auth_user_id = auth.uid()`.

Every data row must be `PASS`, including:

- `a_anon_bootstrap` and `a_anon_bootstrap_lite`: anon calls both RPCs. Every key is on the allow-list (no `password_hash`, `metadata`, `email`, building `notes`, or unit `deposit_amount`). Each user object has `landlord_id` and `display_name`, and the published landlord's id is in the payload.
- `b_landlord_sees_linked_tenant`: the landlord can `count(id)` the tenant on their building.
- `b_landlord_hides_staff` and `b_landlord_hides_unlinked_tenant`: the landlord cannot see the agency admin or an `END_USER` who is not a tenant or applicant on their buildings.
- `c_service_role_can_set_role` and `c_direct_admin_can_set_role`: `SET ROLE service_role` with a `service_role` JWT, and a direct admin session with the JWT cleared, can still change `role`. The probe rolls that update back.
- `a_password_hash_column`: `authenticated` cannot `SELECT password_hash`.
- `b_end_user_<table>`: the tenant JWT sees zero rows of agency B on each table 011 rewrites. Unpublished units are the fixture, because 011 still allows any signed-in user to read published listings across agencies.
- `c_*`: the tenant's `role`, `client_id`, `active`, `auth_user_id`, `metadata.frontend_role`, `metadata.enabledPermissions`, and `metadata.verification` do not change. `first_name` and an ordinary metadata key do change, then the savepoint rolls that back.
- `d_staff_*`: the agency admin still sees every row of their own agency.
- `d_tenant_own_notification` and `d_tenant_own_application`: the tenant still sees their own rows.

A `FAIL` of `no agency B row to prove isolation` means that table has no row for agency B, so the check cannot prove anything. Pick another agency or treat that table as unverified. Do not read it as a pass.

## 6. Roll back

Run `rollback.sh` if any of these are true after a **committed** apply:

- any `verify.sql` row is `FAIL` (other than a missing fixture you have explained)
- the marketplace (`/` or `/browse`) returns no listings, or the browser console shows the RPC error
- a staff user at `/workspace` cannot see their own agency's properties, leads, or applications
- a tenant at `/workspace/portals/tenant` can see another agency's payment, application, or message
- a user cannot save an ordinary profile change (first name, phone)
- a landlord or contractor registration document does not persist (see the app risks below)
- an agency admin's verification decision does not stick (see below)

```bash
database/postgres/ops/011/rollback.sh
```

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 --single-transaction \
  -c "SET lock_timeout = '5s'" \
  -c "SET statement_timeout = '60s'" \
  -c "SET idle_in_transaction_session_timeout = '60s'" \
  -f database/postgres/ops/011/rollback.sql
```

Then run `verify.sql` again. The isolation and privilege checks should fail the same way they did before 011, and staff reads should still pass. Diff `pre_apply_snapshot.sql` output against the file from section 2. An empty diff means the catalog matches the pre-apply snapshot. A non-empty diff means production was not the repo's 001-010 state; use the logical dump or PITR rather than editing by hand.

`rollback.sql` is safe to run once after a successful 011, and a second time: new objects are dropped if present, and the restored functions use `CREATE OR REPLACE`.

## 7. What the app team should smoke-test

Signed-out browser, then one user of each role. Production writes go through the Supabase client (the Hono API is not what Vercel serves today).

| Surface | Route | What to look for |
| --- | --- | --- |
| Marketplace home and browse | `/`, `/browse` | Listings, buildings, and agency names still render. Landlord cards must not show a password hash, an ID document, or an email. The guest mapper keys landlords on `landlord_id` and shows `display_name`. |
| Listing detail | `/listing/:id` | Cover image and facts load. Enquiry form still posts. |
| Staff dashboard | `/workspace` | Own agency properties, leads, applications, payments. No other agency's names in those lists. |
| Tenant portal | `/workspace/portals/tenant` | Own application, maintenance, messages. Not another agency's. |
| User admin / verification | `/workspace` user screens and compliance | See the trigger risks below before calling the apply done. |

## App code that can break

`src/lib/supabase/mapGuestMarketplace.ts` keys the guest user map on `landlord_id` (falling back to `id` for an older payload) and the display name on `display_name` (falling back to first + last). Email is used only when the payload still contains a string; otherwise the card email is empty. `entity_id_map` is still applied after that, so frontend ids for landlords still resolve when the map row exists. Metadata, phone, and verification are absent from the anon payload, so those badges do not render for guests. `resolveFrontendRole` in `src/lib/supabase/idMap.ts` falls back to the database role for `LANDLORD`. `src/lib/supabase/publicMarketplace.ts` is the caller (`get_public_marketplace_bootstrap_lite`, then the full RPC).

`src/lib/supabase/data.ts` selects named user columns (`id, client_id, email, first_name, last_name, phone, role, active, metadata`) and `select('*')` on the other tenant tables. Those user columns stay granted. `select('*')` on `users` does not: `password_hash` is omitted from the column grant, and Postgres rejects the whole select. `src/lib/supabase/auth.ts` uses that fallback only when `auth_bootstrap_needed` errors (`select('*', { count: 'exact', head: true })` around the bootstrap-needed check). If that RPC is healthy, the fallback does not run.

`src/lib/supabase/persist.ts` `upsertUser` writes `role`, `active`, `client_id`, and metadata `frontend_role`, `enabledPermissions`, and `verification` through the user's JWT. The new trigger puts the stored privilege values back. A staff member editing their own row will see name and phone save, and role or permissions quietly stay as they were. Staff cannot update *other* users through RLS today (`users_update_own` is self or super admin only); that part is unchanged.

`src/lib/supabase/auth.ts` `attachRegistrationDocuments` updates `metadata.verification` on the signed-in user so a new landlord or contractor can store ID documents. The trigger strips `verification` from the incoming JSON and copies the previous value back. If the signup trigger already wrote `verification.status = pending` without the files, the files never land. If there was no `verification` key yet, the key is removed and not restored. **Treat a failed document upload as a rollback trigger** unless product accepts that landlords cannot submit documents until a follow-up change.

`admin_update_user_verification` (migration 003, called from `src/lib/supabase/auth.ts`) is `SECURITY DEFINER`, so it bypasses RLS, but the trigger still runs. The trigger only lets a super admin through (`is_super_admin()`). An agency admin's approve/reject is overwritten with the old verification and the RPC still returns the new JSON from memory. The UI can show success while the row did not change. **Confirm an agency-admin verification decision by reading the row afterwards. If it did not stick, roll back.**

The direct Hono connection is not `anon` or `authenticated` and does not set a client JWT role, so the trigger lets it change privilege columns. That path is not the Vercel production write path.

## Risks inside 011

- **The privilege trigger is `SECURITY INVOKER`.** PostgREST's login role is `authenticator`; `session_user` stays that role after `SET ROLE`, so it cannot tell `anon` from `service_role`. `current_user` is the `SET ROLE` target, which is why the trigger is not `SECURITY DEFINER`. A JWT role of `authenticated` or `anon` also locks the row even if the session role is something else. `service_role` and a direct admin session with no client JWT still change privilege columns. The first-user `SUPER_ADMIN` count goes through `users_count_unscoped()`, which stays `SECURITY DEFINER` so row level security does not hide existing users from the count.
- **Same-agency reads are still wide.** The new `*_select` policy is "super admin or this `client_id`" for every `authenticated` user. A tenant cannot read agency B. A tenant can still read agency A's leads, payments, and applications. 011 closes the cross-agency hole from 003. It does not make those tables staff-only.
- **`password_hash` can still be written.** 011 revokes `SELECT` and grants specific columns. It does not revoke `UPDATE` on `password_hash`. `users_update_own` still allows a user to update their own row. A direct PostgREST update can set `password_hash` to a hash the attacker knows. The API ignores client-supplied hashes; PostgREST does not.
- **Published listings stay cross-agency** via `units_public_read`, `buildings_public_read`, and `viewing_slots_public_read`. That is intentional. The isolation checks use unpublished rows. The building and viewing-slot checks call `building_has_public_listing` and `viewing_slot_on_public_listing` (`SECURITY DEFINER`). Inlining `EXISTS (SELECT FROM units)` recurses with `units_landlord_read` from 003, and Postgres errors instead of returning rows. Execute on those two functions is granted only to `authenticated`.
- **Lock timeout.** A 5 second wait is enough for this DDL once the lock is free. It will fail if a pooler session is idle in a transaction on `users`. Failure leaves the previous policies in place.
- **`rollback.sql` restores repo 001-010, including the known `008` lite bug** that matches `entity_id_map` property ids to building ids. That bug is what production has if 008 was applied as written. Do not "fix" it in the rollback.
- **Within-agency user list.** 011 drops `users_select_self_agency`. Tenants no longer see every colleague. Staff still have `users_select_agency`. `users_select_portfolio` lets a landlord read `END_USER` rows that are a tenant (`leases.tenant_id`) or an applicant (`applications.applicant_id`) on a building they own. It does not return staff, other landlords, or an end user who is not on those buildings. Metadata on those linked rows, including ID documents, is still visible to that landlord.

## Not tested against production

- Whether the hosted catalog matches migrations 001-010. Compare the snapshot before apply. If `pre_apply_assert.sql` fails, stop.
- Dashboard backups, PITR, and a real `pg_dump` of the hosted database. The commands above were rehearsed only against the local cluster.
- The Supabase preview-branch clone. Do not create one without approval.
- PostgREST's actual JWT (cookie / `Authorization`) end to end. Local checks `SET ROLE` and `set_config` the same settings PostgREST sets.
- The SPA in a browser against this database. The smoke table above is for the app team after apply.
- Storage objects, Realtime delivery, and auth email. 011 does not change those, except that 008's publication is untouched.
