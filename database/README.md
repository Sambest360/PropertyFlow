# Letkaya database

Two schemas ship side-by-side:

| Path | Engine | Role |
|------|--------|------|
| `database/schema.sql` + `database/seed.sql` | **MySQL 8** | Legacy Property24-style PMS (clients → agencies → properties) |
| `database/postgres/schema.sql` + `seed_empty.sql` (default) / `seed.sql` + `seed_pe_bulk.sql` (demo) | **PostgreSQL 13+** | **Asset OS** — empty-start by default; optional demo personas + PE bulk |

**Do not treat them as drop-in replacements.** MySQL remains for older tooling; PostgreSQL is the forward schema for the Asset OS product.

---

## PostgreSQL — Asset OS (recommended)

Hierarchy:

```
clients
  └─ buildings
       └─ units
            ├─ rooms  (floor-plan layout_x/y/w/h, 0–100)
            └─ internal_assets  (appliances, furniture, …)
```

Also includes: `client_lookup_configs`, `users`, `applications`, `leases`, `viewing_slots`, `bookings` (viewings), `maintenance_tickets`, `leads`, `payments`, `documents`, `media_assets`, `notifications`, `message_threads` / `messages`, `vendor_category_routes`, optional `permissions` / `role_permissions`, plus `event_log` (activity feed + property timeline), `suite_alerts`, `automation_rules`, and the **billing engine** (`billing_plans`, `client_subscriptions`, `invoices`, `v_billing_usage`).

**Geocoding / maps:** `buildings` and `units` store `lat`, `lng`, `place_id`, `formatted_address`, `geocoded_at`. Frontend flat listings (`PropertyAsset`) mirror these fields; see the mapping comment block at the top of `postgres/schema.sql`.

### Frontend domain mapping (no ORM)

| Postgres | Vite `types/domain` / seed |
|----------|----------------------------|
| `clients` | `Agency` |
| `users` | `AppUser` |
| `buildings` + `units` | `PropertyAsset` (+ infra `Building` / `Unit`) |
| `leases` | `Tenancy` |
| `viewing_slots` | `ViewingSlot` |
| `bookings` | `Viewing` |
| `documents` / `media_assets` | `PropertyDocument` / `images[]` |
| `payments` | `PaymentRecord` |
| `notifications` | `AppNotification` |
| `event_log` (`activity`) | `Activity` |
| `event_log` (`property_event`) | `PropertyEvent` |
| `suite_alerts` | `SuiteAlertRule` |
| `invoices` | `PlatformInvoice` |

The Vite app hydrates from Postgres when the local API is running (`npm run dev` starts API + Vite). Domain mapping is documented at the top of `postgres/schema.sql`.

### Local API (Hono + `pg`)

```bash
# From repo root — uses DATABASE_URL from .env.local (see .env.example)
npm run dev:api          # http://127.0.0.1:8787
curl http://127.0.0.1:8787/api/health
curl http://127.0.0.1:8787/api/counts
curl http://127.0.0.1:8787/api/bootstrap | head
```

Vite proxies `/api` → `:8787`. AppStore merges bootstrap entities into state when the API is reachable; otherwise local seed/localStorage is used.

### Supabase (hosted Postgres) + Vercel

**Primary PMS database is Postgres** (local or Supabase). Do not use Firebase/Firestore or the Supabase JS Data API as the app’s system of record.

1. Create a Supabase project → run `database/postgres/schema.sql` then `seed.sql` (SQL editor or `psql`).
2. Enable RLS on public tables and revoke `anon` / `authenticated` table grants so only the server role can read/write. Do **not** use `FORCE ROW LEVEL SECURITY` if the API connects as `postgres` (FORCE would lock the server out).
3. Set `DATABASE_URL` to the **Transaction pooler** URI (`…pooler.supabase.com:6543`, user `postgres.<project-ref>`), not the direct `db.*.supabase.co:5432` URL, for serverless. Prefer **Session** pooler (`:5432` on the pooler host) for long local bootstrap sessions if transaction mode stalls.
4. Local / Vercel env checklist:
   - `DATABASE_URL` — pooler URI with `sslmode=require` (server rewrites to libpq-compat)
   - `AUTH_SECRET` — long random string
   - `NODEJS_HELPERS=0` — on Vercel (Hono POST body compatibility)
   - Optional: `CORS_ORIGINS`, `DATABASE_SSL=1`
5. Deploy: Vite SPA + `api/index.ts` (Hono via `hono/vercel`). `vercel.json` rewrites `/api/*` to the function and SPA routes to `/index.html`.
6. Verify:

```bash
npm test                              # unit + scoped bootstrap filters
PF_API_SMOKE=1 npm test               # live health / bootstrap / persist (API must be up)
curl -sS "$PREVIEW_URL/api/health"
```

**Writes:** AppStore mutations call `POST /api/persist` (also REST: `POST|PATCH|DELETE /api/{agencies|users|buildings|properties|leads|applications|payments|tickets|viewing-slots|suite-alerts|activities|property-events|invoices|…}`). Frontend demo IDs (`ag-horizon`, `PR-1001`, …) are mapped to UUIDs via `entity_id_map` + seed aliases in `server/idMap.ts`. On API failure the UI keeps optimistic state + localStorage (degraded mode). Application approve uses `POST /api/applications/:id/approve` (transaction: application + lease + unit OCCUPIED).

```bash
curl -s -X POST http://127.0.0.1:8787/api/persist \
  -H 'Content-Type: application/json' \
  -d '{"resource":"lead","action":"upsert","id":"LD-demo","data":{"agencyId":"ag-horizon","propertyId":"PR-1001","name":"Demo","stage":"New","type":"Rent"}}'

# Viewing slot / invoice examples
curl -s -X POST http://127.0.0.1:8787/api/persist \
  -H 'Content-Type: application/json' \
  -d '{"resource":"viewing_slot","action":"upsert","id":"VS-demo","data":{"agencyId":"ag-horizon","propertyId":"PR-1002","agentId":"u-james","date":"2026-07-28","time":"15:00","capacity":3,"booked":0,"status":"Open"}}'
```

### Incremental DDL (existing DB without full reset)

If you already have a populated local DB and prefer not to wipe it:

```sql
CREATE TABLE IF NOT EXISTS viewing_slots ( ... ); -- see postgres/schema.sql
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS slot_id UUID REFERENCES viewing_slots(id) ON DELETE SET NULL;
CREATE TABLE IF NOT EXISTS suite_alerts ( ... );
-- then: npm run db:seed  (or re-insert only the new seed blocks)
```

Prefer `npm run db:reset` for an empty platform, or `npm run db:reset:demo` for personas + PE bulk.

### Demo API UX contracts (TypeScript mirrors)

| Endpoint | Module | Notes |
|----------|--------|-------|
| `GET /api/v1/units` | `src/lib/api/unitsApi.ts` | Cursor pagination, geospatial + utility-tier filters, card payload (`primary_image`, `is_load_shedding_free`, `total_entry_fees`, nested `building`, `actions`, `display_metadata`) |
| `PATCH /api/v1/applications/{id}/status` | `src/lib/api/applicationStatusApi.ts` | Atomic APPROVED → collision check, lease, unit OCCUPIED, invoice, PayFast/Peach checkout bridge |
| `GET /api/v1/tickets` | `src/lib/api/ticketsApi.ts` | Kanban columns OPEN → IN_PROGRESS → RESOLVED with embedded `asset_health` (REPAIR vs REPLACE) |

Postgres views: `v_unit_search_cards`, `v_ticket_kanban` (plus enriched `v_unit_summary` with entry fees / load-shedding flags). Feed indexes: `idx_units_feed_cursor`, `idx_units_geo`, `idx_buildings_utility_tier`, `idx_tickets_kanban_cursor`, `idx_leases_unit_active`.

Composite indexes cover tenant isolation, asset tree, ops, billing cycles, and maintenance dashboards (see `idx_*` in `postgres/schema.sql`).

### SaaS billing (asset footprint)

At midnight on each client’s `billing_cycle_anchor_day`, charge:

`base_monthly_fee + (GLA × per_sqm_rate) + (units × per_unit_rate) + (rooms × per_room_rate) + (Grade P buildings × grade_p_premium_fee) + 15% VAT`

Demo UI: **Workspace → Platform → SaaS billing**. Application income guards (3× rent) live in `src/lib/applicationApi.ts` and the listing apply form.

### Maintenance workflow

Create → warranty detect on `internal_assets.warranty_expires_at` → auto-assign via `vendor_category_routes` by `category_key` → EMERGENCY open > 2h escalates to agency admin → RESOLVED syncs `condition_status` + `cost_actual`. Demo: `src/lib/maintenanceApi.ts` + Operations → Maintenance.

### TablePlus — PostgreSQL connection

1. Open TablePlus → **Create a new connection** → **PostgreSQL**
2. Typical local settings (Homebrew / Postgres.app / Docker / ServBay):
   - **Host:** `127.0.0.1`
   - **Port:** `5432`
   - **User:** `postgres` (or your local role)
   - **Password:** your local password
   - **Database:** create `propertyflow` first (see below), then select it
3. Create the database once:

```sql
CREATE DATABASE propertyflow;
```

4. In TablePlus, connect to `propertyflow`, then run in order:

- `database/postgres/schema.sql`
- `database/postgres/seed.sql`

CLI equivalent:

```bash
# From project root
createdb propertyflow   # if needed
psql -h 127.0.0.1 -U postgres -d propertyflow -f database/postgres/schema.sql
psql -h 127.0.0.1 -U postgres -d propertyflow -f database/postgres/seed.sql
```

### Seed story (Port Elizabeth / Gqeberha, Eastern Cape)

| Client | Subdomain | Focus |
|--------|-----------|--------|
| Horizon Realty | `horizon` | Walmer / Humewood / Mill Park / Summerstrand |
| Algoa Bay Estates | `algoa-bay` (`ag-cape`) | Newton Park + Mount Pleasant + Richmond Hill |
| Bayview Property Group | `bayview` (`ag-garden`) | Framesby cottage |

Horizon users: Amelia (`AGENCY_ADMIN`), Lerato (`AGENT_ADMIN`), James & Priya (`GROUND_AGENT`), 2 landlords, Lucas (tenant), Nomsa & Fatima (applicants).

Algoa Bay: Sipho (`AGENCY_ADMIN`), Zane / Nandi / Theo / Anya, landlords, Aya (tenant), BayFix.

Bayview: Gita (`AGENCY_ADMIN`), Leigh (`GROUND_AGENT`), Mia (tenant), Coastal Fix.

### Fixed UUID prefixes (Postgres seed)

| Entity | Prefix |
|--------|--------|
| Clients | `a1000001-…` |
| Lookups | `a1100001-…` |
| Users | `a2000001-…` |
| Buildings | `a3000001-…` |
| Units | `a4000001-…` |
| Rooms | `a5000001-…` |
| Internal assets | `a6000001-…` |
| Applications | `a7000001-…` |
| Leases | `a8000001-…` |
| Bookings | `a9000001-…` |
| Tickets | `aa000001-…` |
| Permissions | `ab000001-…` |
| Automation | `ac000001-…` |
| Events | `ad000001-…` |

Examples:

- Horizon client: `a1000001-0001-4000-8000-000000000001`
- Walmer house unit: `a4000001-0001-4000-8000-000000000001`
- Humewood B12 (leased): `a4000001-0001-4000-8000-000000000002`
- B12 microwave asset (ticket): `a6000001-0001-4000-8000-000000000012`

### Demo password

**Super admin (seeded):**

| Email | Password |
|-------|----------|
| `sambampo200@gmail.com` | `secret` |

Other seeded users still use the shared bcrypt-looking placeholder:

```text
$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy
```

Documented plaintext intent for those rows: `demo-password`. Replace with real bcrypt/argon2 hashes before production auth for non-admin demo accounts.

### Useful Postgres queries

```sql
SELECT * FROM v_unit_summary;
SELECT * FROM v_application_pipeline ORDER BY submitted_at DESC NULLS LAST;
SELECT * FROM client_lookup_configs WHERE client_id = 'a1000001-0001-4000-8000-000000000001';
SELECT t.title, a.item_name, a.brand, a.condition_status
FROM maintenance_tickets t
JOIN internal_assets a ON a.id = t.asset_id;
```

---

## MySQL — Legacy (unchanged)

Property24-style multi-tenant PMS: clients → agencies → properties, plus leads, viewings, applications, tenancies, payments, automation.

### TablePlus — MySQL connection

1. Open TablePlus → **Create a new connection** → **MySQL**
2. Typical ServBay local settings:
   - **Host:** `127.0.0.1`
   - **Port:** `3306`
   - **User / Password:** your ServBay MySQL credentials
   - **Database:** leave blank first, or use `propertyflow` after schema load
3. Run:

```bash
mysql -h 127.0.0.1 -u root -p < database/schema.sql
mysql -h 127.0.0.1 -u root -p < database/seed.sql
```

Or use `database/load.sh` if the `mysql` CLI is available.

### Legacy demo emails

| Email | Role | Client |
|-------|------|--------|
| `super@propertyflow.app` | Super Admin | Platform |
| `amelia@horizonrealty.co.za` | Client Admin | Horizon |
| `lerato@horizonrealty.co.za` | Agent | Horizon |
| `james@horizonrealty.co.za` | Agent | Horizon |
| `lucas@email.com` | Tenant | Horizon |
| `sipho@capecoastal.co.za` | Client Admin | Algoa Bay Estates |

---

## Files

```
database/
  README.md                 ← this file
  schema.sql                ← MySQL legacy schema
  seed.sql                  ← MySQL legacy seed
  load.sh                   ← MySQL helper
  postgres/
    schema.sql              ← PostgreSQL Asset OS schema
    seed.sql                ← PostgreSQL SA demo seed
```
