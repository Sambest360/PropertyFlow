# Local rehearsal for migration 011

011 tightens Row Level Security so a landlord, tenant, or contractor cannot read another agency's rows, blocks self-service changes to privilege columns on `users`, hides `password_hash` from the `authenticated` role, and replaces the public marketplace RPCs with an explicit column allow-list. User objects keep `email` and add `landlord_id` and `landlord_name`. `verification.status` is copied only when it is stored. Buildings, units, and rooms use an explicit column list, so `buildings.notes` is not returned.

`011a_public_rpc_stopgap.sql` is applied before 011 in this rehearsal. 011 replaces the same two function signatures (`boolean` in, `jsonb` out) and does not put back `buildings.notes`, a default verification status, or a string `isGlobalConfigClient`. Rollback of 011 returns to that post-011a catalog. `011b_drop_marketplace_landlord_email.sql` removes landlord email and is rehearsed after 011, then rolled back. Apply 011b only with the frontend that keys landlords on `landlord_id` and `landlord_name`.

No production apply. 011a is on hold as well.

## Run the rehearsal

```bash
npm run db:rehearse:011
```

That creates a throwaway database on the local Postgres cluster, applies `schema.sql`, migrations 001-010, 011a, and `database/postgres/ops/011/local/seed_two_agencies.sql`, then:

- After 011a, the isolation checks fail and these three still pass: `a_buildings_notes_absent`, `a_client_flag_is_boolean`, `a_verification_only_when_stored`.
- After 011, every `verify.sql` row passes (allow-list, landlord portfolio, privilege trigger, helper execute grants).
- Rollback matches the post-011a catalog snapshot and a `pg_dump --schema-only` of `public`. The three checks above still pass.
- Re-apply passes again.
- 011b removes `email` from the public user payload (`b_email_absent`, `landlord_id` and `landlord_name` still present). Its rollback puts `email` back. The three checks still pass.

The seed is only the rows those checks need: two agencies, one unpublished agency-B row per tightened table, a published landlord, a landlord with no verification status, a linked tenant, and an unlinked end user. `isGlobalConfigClient` is the JSON boolean `false`. Published buildings store `INTERNAL-NOTE-LEAK` so a `to_jsonb` regression fails the notes check.

`local/supabase_roles.sql` stands in for Supabase: `anon`, `authenticated`, `service_role`, `auth.uid()`, and `ALTER DEFAULT PRIVILEGES` granting `EXECUTE` to those roles. The verify checks that `REVOKE FROM PUBLIC` is not enough to hide marketplace helpers.

## Pointing this at `supabase start` later

Another branch is adding the Supabase CLI and a shared two-agency fixture. This harness stays self-contained until that lands. When it does, do not add a second seed here. Reset the local stack, then:

```bash
REHEARSE_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:54322/postgres' \
REHEARSE_SKIP_BOOTSTRAP=1 \
REHEARSE_SEED_SQL=path/to/shared-two-agencies.sql \
npm run db:rehearse:011
```

`REHEARSE_DATABASE_URL` must be local (`127.0.0.1`, `localhost`, or a socket). Hosted Supabase and port 6543 are refused. `REHEARSE_SKIP_BOOTSTRAP=1` means that database already has the API roles, `schema.sql`, migrations 001-010, and 011a. Override `TENANT_A_AUTH_ID` and the other ids in `rehearse.sh` when the shared fixture uses different uuids. The seed file must contain whatever ids you pass. `REHEARSE_SEED_SQL` defaults to `local/seed_two_agencies.sql`.

## Hono connection

`011c_security_review.sql` forces row level security on the tenant tables. The API should connect as a role that is not the table owner and does not have `BYPASSRLS`. This branch does not change the API process.

## Before any future production apply

Not in scope. When that changes, take a backup first and confirm the live catalog matches migrations 001-010 plus 011a before running `apply.sh`. `rollback.sql` rewrites policies and the marketplace functions from those files.

## What verify.sql checks

After 011 every row is `PASS`, including:

- `a_buildings_notes_absent`, `a_client_flag_is_boolean`, `a_verification_only_when_stored` (also after 011a and after rollback)
- `a_anon_bootstrap` and `a_anon_bootstrap_lite`: allow-listed keys only; `email`, `landlord_id`, and `landlord_name` are present
- `e_marketplace_helpers_locked`: `anon` and `authenticated` cannot execute the JSON helpers
- `e_public_rpcs_executable`: both roles can execute the two public RPCs
- `b_landlord_sees_linked_tenant`, `b_landlord_hides_staff`, `b_landlord_hides_unlinked_tenant`
- `c_role` stays `END_USER`; `c_service_role_can_set_role` and `c_direct_admin_can_set_role` can change it, then the probe rolls back
- `b_end_user_<table>`: the tenant sees no agency-B row; `d_staff_<table>`: staff still see their own agency
