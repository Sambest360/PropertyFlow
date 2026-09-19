# RLS policy baseline — applications (audit reference)

> **Status:** this file documents the row-level-security contract the frontend
> depends on. The authoritative policies live in the **hosted Supabase project**
> (there is no `supabase/migrations/` in this repo). Compare this baseline
> against Dashboard → Authentication → Policies before any re-GO. Do not apply
> this file blindly — it is a checklist, not a migration.

## Why P0-2C depends on this

A failed register must leave the browser anonymous **and** unable to read
another identity's applications. The frontend clears all local artifacts on
failure (`src/lib/auth/sessionArtifacts.ts`), but the server-side guarantee is
RLS: even a stale or wrong JWT must yield zero foreign application rows.

## Required policies — `applications`

Columns referenced by the FE mapper (`src/lib/supabase/data.ts`,
`src/lib/supabase/persist.ts`): `client_id`, `unit_id`, `agent_id`,
`applicant_id`, `reference_code`, `application_type`, `status`,
`monthly_income`, `metadata->>frontend_id`.

```sql
-- 1. Applicant reads own applications.
--    applications.applicant_id must map 1:1 to public.users.id, and
--    public.users.auth_user_id = auth.uid() for the registrant.
create policy "applications_select_own"
  on applications for select
  using (
    applicant_id in (
      select id from public.users where auth_user_id = auth.uid()
    )
  );

-- 2. Agency staff read applications scoped to their client (agency).
create policy "applications_select_agency"
  on applications for select
  using (
    client_id in (
      select client_id from public.users where auth_user_id = auth.uid()
    )
  );

-- 3. Applicants insert their own applications (create-your-own apply path).
create policy "applications_insert_own"
  on applications for insert
  with check (
    applicant_id in (
      select id from public.users where auth_user_id = auth.uid()
    )
  );

-- 4. Staff update applications within their agency (approve / reject / stage).
create policy "applications_update_agency"
  on applications for update
  using (
    client_id in (
      select client_id from public.users where auth_user_id = auth.uid()
    )
  );
```

## Smoke checks (run as the QA fresh user's JWT)

```sql
-- must return 0 rows for a brand-new registrant (no foreign apps):
select count(*) from applications;

-- must return only own rows once the user has applied:
select reference_code from applications
where applicant_id in (select id from public.users where auth_user_id = auth.uid());
```

Browser equivalent: register a fresh user, hard-refresh `/workspace`, and
confirm no application from any other account is visible.

## Helper used by the FE after signup

`ensure_user_profile` (RPC) creates the `public.users` row on first login —
the FE calls it once when the profile lookup misses
(`src/lib/supabase/auth.ts`). `approve_application` (RPC) writes the tenancy +
audit trail on staff approval; it must remain `security definer` with a
staff-role guard inside the function body.
