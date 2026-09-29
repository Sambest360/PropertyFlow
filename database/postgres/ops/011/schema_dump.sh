#!/usr/bin/env bash
# Schema-only dump of public, including ACLs. Pass an output path.
# Usage: database/postgres/ops/011/schema_dump.sh /secure/path/pre_011_public_schema.sql
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$HERE/lib.sh"
resolve_database_url

OUT="${1:-}"
if [[ -z "$OUT" ]]; then
  echo "usage: $0 /secure/path/pre_011_public_schema.sql" >&2
  exit 1
fi
mkdir -p "$(dirname "$OUT")"
pg_dump "$DATABASE_URL_RESOLVED" \
  --schema-only \
  --no-owner \
  --schema=public \
  --file="$OUT"
echo "wrote $OUT"
echo "pg_dump \"\$DATABASE_URL\" --schema-only --no-owner --schema=public --file=$OUT"
