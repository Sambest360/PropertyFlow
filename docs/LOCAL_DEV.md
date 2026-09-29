# Local development

PropertyFlow runs against a Supabase CLI stack on your machine: Postgres, GoTrue auth, and Storage. Do not point this checkout at a hosted Supabase project, Vercel, PayFast, or Mailtrap.

## Prerequisites

- Node.js 20 or newer
- Docker
- [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started) (`supabase --version`)

## Start the stack

From the repo root:

```bash
supabase start
```

That boots Postgres (port 54322), the API gateway and GoTrue (port 54321), Storage, Studio (port 54323), and Mailpit (port 54324). The first start applies `database/postgres/schema.sql` and the migrations under `database/postgres/migrations/`.

Check it:

```bash
supabase status
```

`realtime` and `analytics` are off in `supabase/config.toml`. Auth, Postgres, and Storage do not need them, and the Realtime container fails to boot in some local Docker setups.

### How migrations are loaded

`supabase/migrations/` holds copies of the SQL, prefixed so they run in this order:

1. `database/postgres/schema.sql`
2. `001` through `006`, in number order
3. The duplicate `007_*` files in filename order: `007_clear_demo_applications.sql`, `007_public_marketplace_rooms.sql`, `007_trust_banking.sql`
4. The duplicate `008_*` files in filename order: `008_public_marketplace_lite.sql`, `008_realtime_publication.sql`, `008_ticket_updates_rls.sql`
5. `009`, `010`, `011_tenant_isolation.sql`, then `011a_public_rpc_stopgap.sql`

The `007` and `008` numbers are duplicated on purpose. This setup does not renumber them. Another task will add a migration runner.

`011a_public_rpc_stopgap_rollback.sql` and `011a_public_rpc_stopgap_verify.sql` are not applied. The rollback puts the anonymous marketplace leak back, and the verify script only selects inside a transaction it rolls back. Run those by hand in a SQL editor if you are checking that stopgap.

The copies are real files, not symlinks. The CLI bind-mounts `supabase/migrations` into the database container, and a symlink back to `database/postgres` does not resolve there. After you edit SQL under `database/postgres/`, refresh the copies:

```bash
npm run db:sync-migrations
```

A unit test fails if a copy drifts from its source.

## Environment

```bash
cp .env.example .env.local
```

`.env.example` is already aimed at the local stack (the Hono API reads this same root file; there is no separate API env file):

| Variable | Local value |
| --- | --- |
| `VITE_SUPABASE_URL` / `SUPABASE_URL` | `http://127.0.0.1:54321` |
| `DATABASE_URL` / `DIRECT_URL` | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | anon key from `supabase status` |
| `SUPABASE_SECRET_KEY` | service role key from `supabase status` |

The anon and service role JWTs in `.env.example` are the CLI's default local demo keys (`ANON_KEY` and `SERVICE_ROLE_KEY`). Confirm them:

```bash
supabase status -o env
```

If your status output shows different keys, paste those into `.env.local`. `PUBLISHABLE_KEY` / `SECRET_KEY` (`sb_publishable_` / `sb_secret_`) are the newer names for the same local project. Either pair works. Do not paste a hosted project key.

Leave PayFast and Mailtrap blank.

Email confirmations stay on (`enable_confirmations = true` under `[auth.email]`). A new sign-up is not pre-confirmed. The confirmation message is delivered to the local mail catcher that `supabase start` starts (Mailpit, formerly Inbucket) at http://127.0.0.1:54324. Seeded users are inserted already confirmed, so those accounts can sign in without opening that mailbox.

## Seed

```bash
npm run db:seed:local
```

`supabase db reset` loads `supabase/seed.sql` after the migrations. That SQL does not contain a login password. `npm run db:seed:local` runs the same SQL, sets one password on every `@example.test` account, and uploads one fake text file per agency into the local `documents` bucket.

Set `SEED_USER_PASSWORD` in `.env.local` before seeding if you want a password you chose. If it is unset, the script generates a strong password and prints it once. There is no default password.

The fixture is `database/fixtures/localDevSeed.ts`. Import `localDevSeed` (or `localDevUsers` / `localDevAgencies` / `uploadPersonas`) from tests instead of copying ids.

```ts
import { localDevSeed, uploadPersonas } from '../../database/fixtures/localDevSeed.ts'

localDevSeed.seedPasswordEnvVar   // 'SEED_USER_PASSWORD'
localDevSeed.roles                // every UI role, including applicant
localDevSeed.agencies[]           // { id, frontendId, name, building, publishedUnit, leasedUnit, lead, application, lease, ticket, document, payment, ... }
localDevSeed.users[]              // { role, dbRole, frontendRole, email, authUserId, userId, frontendId, agencyId, persona }
uploadPersonas.tenantWithMaintenanceTicket   // Northwind tenant Finn Ledger plus ticket
uploadPersonas.applicantWithApplication      // Northwind applicant Hal Ledger; not staff of that agency
```

`applicant` is not its own database role. Those users are `END_USER` / frontend role `tenant`, with `persona: 'applicant'` and no lease. `agent` is stored as `GROUND_AGENT` with frontend role `agent`.

Emails are `@example.test`. The password is whatever this seed run used.

| Role | Northwind | Southridge |
| --- | --- | --- |
| super_admin | `sam.platform@example.test` (platform, not tied to an agency) | same account |
| client_admin | `ada.ledger@example.test` | `iris.pebble@example.test` |
| agent_admin | `ben.ledger@example.test` | `jules.pebble@example.test` |
| ground_agent | `cara.ledger@example.test` | `kit.pebble@example.test` |
| agent | `dan.ledger@example.test` | `lee.pebble@example.test` |
| landlord | `eva.ledger@example.test` | `mo.pebble@example.test` |
| tenant | `finn.ledger@example.test` | `nia.pebble@example.test` |
| contractor | `gus.ledger@example.test` | `omar.pebble@example.test` |
| applicant | `hal.ledger@example.test` | `pat.pebble@example.test` |

Each agency has a building, a published listing, an occupied unit, a lead, an application, an active lease, an open maintenance ticket, a document, and a paid rent row.

## App

```bash
npm run dev
```

Vite is http://127.0.0.1:5173. Sign in with any email above and the seed password from this run. The API (optional) is `npm run dev:full`.

## Reset

```bash
supabase db reset
npm run db:seed:local
```

`db reset` drops the local database, replays migrations, and runs `supabase/seed.sql`. The npm script is idempotent, sets the seed password, and refreshes the storage files. It refuses to run if `DATABASE_URL` / `DIRECT_URL` or `SUPABASE_URL` is not local (`localhost`, `127.0.0.1`, `::1`, `host.docker.internal`, `db`, or `supabase_db_*`).

## Troubleshooting

- **`supabase start` exits while initialising the schema.** Confirm Docker is running. If containers can resolve each other but TCP times out, bridge netfilter may be dropping packets (`sysctl net.bridge.bridge-nf-call-iptables=0`). Ports 54321–54324 must be free.
- **Login returns invalid credentials.** Run `npm run db:seed:local` again and use the password it prints, or the value of `SEED_USER_PASSWORD`. `supabase db reset` alone does not set a login password. A brand-new sign-up must confirm via Mailpit at http://127.0.0.1:54324 before it can sign in.
- **Seed script refuses a URL.** The host is not local. Point `.env.local` at `127.0.0.1` as in `.env.example`.
- **Migration copy test fails.** Run `npm run db:sync-migrations` after editing `database/postgres/`.
- **Studio.** http://127.0.0.1:54323
