#!/usr/bin/env bash
# Copy database/postgres schema + migrations into supabase/migrations.
#
# Symlinks do not work: `supabase start` bind-mounts supabase/migrations into
# the database container, and a symlink to database/postgres points at a path
# that does not exist inside that container. These copies are the files the
# CLI applies. Do not edit them by hand — edit database/postgres and re-run
# this script. scripts/sync-supabase-migrations.test.ts fails if they drift.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
dest="$root/supabase/migrations"
mkdir -p "$dest"

# Remove previously generated copies only (timestamp prefix we own).
find "$dest" -maxdepth 1 -type f -name '202601010000*.sql' -delete

copy() {
  local version="$1"
  local source="$2"
  cp -L "$root/$source" "$dest/${version}_$(basename "$source")"
}

# Filename order is the apply order. 007a/007b/007c and 008a/008b/008c replace
# the old duplicate 007 and 008 names. 011, 012, and 013 are reserved
# (011 is the existing tenant-isolation migration; 012 and 013 have no files).
# 011a rollback and verify are operator scripts, not forward migrations:
# rollback re-opens the anonymous marketplace leak, and verify only SELECTs
# inside a transaction it rolls back.
copy 20260101000000 database/postgres/schema.sql
copy 20260101000001 database/postgres/migrations/001_performance_indexes.sql
copy 20260101000002 database/postgres/migrations/002_supabase_auth.sql
copy 20260101000003 database/postgres/migrations/003_rls_bootstrap.sql
copy 20260101000004 database/postgres/migrations/004_ensure_user_profile.sql
copy 20260101000005 database/postgres/migrations/005_public_listing_enquiry.sql
copy 20260101000006 database/postgres/migrations/006_public_marketplace_bootstrap.sql
copy 20260101000007 database/postgres/migrations/007a_clear_demo_applications.sql
copy 20260101000008 database/postgres/migrations/007b_public_marketplace_rooms.sql
copy 20260101000009 database/postgres/migrations/007c_trust_banking.sql
copy 20260101000010 database/postgres/migrations/008a_public_marketplace_lite.sql
copy 20260101000011 database/postgres/migrations/008b_realtime_publication.sql
copy 20260101000012 database/postgres/migrations/008c_ticket_updates_rls.sql
copy 20260101000013 database/postgres/migrations/009_fix_auth_user_profile_sync.sql
copy 20260101000014 database/postgres/migrations/010_lead_metadata.sql
copy 20260101000015 database/postgres/migrations/011_tenant_isolation.sql
copy 20260101000016 database/postgres/migrations/011a_public_rpc_stopgap.sql

echo "Copied $(find "$dest" -maxdepth 1 -name '202601010000*.sql' | wc -l) migrations into supabase/migrations"
