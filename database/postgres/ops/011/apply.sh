#!/usr/bin/env bash
# Apply migration 011 in one transaction. Fails closed on lock wait or SQL error.
# Usage:
#   export DATABASE_URL='postgresql://...db.<ref>.supabase.co:5432/postgres?sslmode=require'
#   database/postgres/ops/011/apply.sh
#   database/postgres/ops/011/apply.sh /path/to/other.sql   # rehearsal probe only
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../../../.." && pwd)"
# shellcheck source=lib.sh
source "$HERE/lib.sh"

TARGET="${1:-$ROOT/database/postgres/migrations/011_tenant_isolation.sql}"
if [[ ! -f "$TARGET" ]]; then
  echo "migration file not found: $TARGET" >&2
  exit 1
fi

assert_transaction_safe "$TARGET"
resolve_database_url

if [[ "${SKIP_PRECHECK:-}" != "1" && "$TARGET" == "$ROOT/database/postgres/migrations/011_tenant_isolation.sql" ]]; then
  psql "$DATABASE_URL_RESOLVED" -v ON_ERROR_STOP=1 -f "$HERE/pre_apply_assert.sql"
fi

echo "psql \"\$DATABASE_URL\" -v ON_ERROR_STOP=1 --single-transaction -c \"SET lock_timeout = '5s'\" -c \"SET statement_timeout = '60s'\" -c \"SET idle_in_transaction_session_timeout = '60s'\" -f $TARGET"
psql_in_one_transaction "$TARGET"
echo "applied: $TARGET"
