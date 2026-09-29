# Auth Resilience Audit — Supabase dependency, risks, and the API-mode exit path

Date: 2026-09-19. Scope: sign-in + registration paths after the plus-address fix
(server-side direct registration in Supabase mode).

## Current architecture (two modes)

- **Supabase mode** (active in dev + prod: `VITE_SUPABASE_*` set): sign-in via
  GoTrue password grant (`signInWithPassword`); registration via our server
  route `/api/auth/register-supabase` (pre-confirmed GoTrue user + trigger
  profile); sessions are supabase-js JWTs in `sb-*` localStorage keys; the
  profile is resolved from `public.users` by `auth_user_id`.
- **API mode** (fallback when Supabase env is absent): Hono server issues
  HMAC-signed session cookies/tokens (`AUTH_SECRET`), bcrypt passwords from
  `public.users.password_hash`, full rate limiting.

## Why signup still needs Supabase (and what can still hurt us)

1. **GoTrue sign-in rate limits.** Supabase throttles password grants per
   project/IP. A burst of failed logins (or a shared office IP) can produce
   429s on **sign-in** — the register path no longer touches GoTrue, but login
   does. Retry-After copy now renders on the client.
2. **Shared project, shared quotas.** Email sending (password recovery,
   magic links if ever enabled) and GoTrue limits are project-wide.
3. **Email is not verified on new accounts.** Direct registration pre-confirms
   users so no confirmation email is needed. Trade-off: someone can register
   with an email they don't own. Mitigations in place: per-IP + per-email
   register throttles, welcome mail bounces surface bad addresses in Mailtrap
   logs, and landlord/contractor accounts remain **verification-gated** before
   they can publish or receive jobs.
4. **Identity matching by email** in some flows (viewings booked by name/email)
   assumes the account email is real — same assumption as before this change.
5. **Anon/publishable key is public by design** — RLS on `public.*` tables is
   the boundary. Supabase-mode writes go through the persist layer with
   server-side scope gates for API mode; RLS policies cover direct browser
   writes.

## The exit path: full API mode (already built, migration steps)

The pieces for Supabase-free auth already exist and are kept green by tests:

- `server/auth.ts` — bcrypt `verifyPassword` **already accepts the pgcrypto
  `$2a$` hashes** that GoTrue's `crypt()` produces, and the profile-sync
  trigger copies `encrypted_password` into `public.users.password_hash` on
  every new user. **The same passwords work in both modes today.**
- `src/lib/api/authClient.ts` — login/register/me/logout against `/api/auth/*`.
- Feature flag: `isSupabaseMode` is false whenever `VITE_SUPABASE_*` env is
  absent — mode switch is an env change, not a code change.

Migration steps if Supabase becomes a liability (outage, pricing, quotas):

1. Deploy the API (already on Vercel functions) with `AUTH_SECRET` set.
2. Remove `VITE_SUPABASE_*` from the client env → client boots in API mode.
3. Keep `DATABASE_URL` (Supabase Postgres can stay as the DB — only **GoTrue
   auth** is bypassed).
4. Verify seeded users sign in (they already have `password_hash`), and new
   registrations go through `/api/auth/register` (rate-limited, profile
   created by `registerUser`).
5. Residual work: password-reset flow (currently none in either mode) and
   re-pointing any direct `supabase.from()` reads in `src/lib/supabase/data.ts`
   — or keep reads on Supabase and move only auth (hybrid), which is what the
   API-mode code already assumes.

## Recommendation

Stay on Supabase mode now (the register blocker is fixed server-side), keep the
per-IP + per-email throttles, and treat API mode as the standing fallback — the
hash compatibility above means a migration is a config flip plus the reset-flow
gap, not a rewrite.
