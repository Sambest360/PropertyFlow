# PropertyFlow database

Two schemas ship side-by-side:

| Path | Engine | Role |
|------|--------|------|
| `database/schema.sql` + `database/seed.sql` | **MySQL 8** | Legacy Property24-style PMS (clients → agencies → properties) |
| `database/postgres/schema.sql` + `database/postgres/seed.sql` | **PostgreSQL 13+** | **New Asset OS** (clients → buildings → units → rooms → internal assets) |

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

Also includes: `client_lookup_configs`, `users`, `applications`, `leases`, `bookings` (viewings), `maintenance_tickets`, `vendor_category_routes`, optional `permissions` / `role_permissions`, plus light `event_log` + `automation_rules`, and the **billing engine** (`billing_plans`, `client_subscriptions`, `invoices`, `v_billing_usage`).

### API UX contracts (demo TypeScript mirrors)

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

### Seed story (South Africa)

| Client | Subdomain | Focus |
|--------|-----------|--------|
| Horizon Realty | `horizon` | Midrand / Sandton / Rosebank |
| Cape Coastal Estates | `cape-coastal` | V&A Waterfront + Constantia |

Horizon users: Amelia (`AGENCY_ADMIN`), Lerato (`AGENT_ADMIN`), James & Priya (`GROUND_AGENT`), 2 landlords, Lucas (tenant), Nomsa & Fatima (applicants).

Cape Coastal: Sipho (`AGENCY_ADMIN`), Anya (`GROUND_AGENT`), 2 landlords.

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
- Carlswald house unit: `a4000001-0001-4000-8000-000000000001`
- Skyline B12 (leased): `a4000001-0001-4000-8000-000000000002`
- B12 microwave asset (ticket): `a6000001-0001-4000-8000-000000000012`

### Demo password

All seeded `password_hash` values use the **same bcrypt-looking placeholder**:

```text
$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy
```

Documented plaintext intent: `demo-password`. This is **not** a production-ready verified hash — replace with a real bcrypt/argon2 hash before enabling app auth.

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
| `sipho@capecoastal.co.za` | Client Admin | Cape Coastal |

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
