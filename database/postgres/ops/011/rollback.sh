#!/usr/bin/env bash
# Restore pre-011 policies, functions, triggers, and grants in one transaction.
# Usage: export DATABASE_URL=...; database/postgres/ops/011/rollback.sh
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$HERE/lib.sh"

TARGET="$HERE/rollback.sql"
assert_transaction_safe "$TARGET"
resolve_database_url

echo "psql \"\$DATABASE_URL\" -v ON_ERROR_STOP=1 --single-transaction -c \"SET lock_timeout = '5s'\" -c \"SET statement_timeout = '60s'\" -c \"SET idle_in_transaction_session_timeout = '60s'\" -f $TARGET"
psql_in_one_transaction "$TARGET"
echo "rolled back 011 objects to the 001-010 definitions"
