#!/usr/bin/env bash
# Diff a live schema-only dump against the rehearsal's pre-011 (post-011a) public schema.
# Usage:
#   database/postgres/ops/011/diff_live_schema.sh /path/to/live-public-schema.sql
#   database/postgres/ops/011/diff_live_schema.sh /path/to/live-public-schema.sql /path/to/rehearsal-schema.sql
# A live dump may be produced later. This script does not connect to a database.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIVE="${1:-}"
REF="${2:-$HERE/rehearsal/pre-011-public-schema.sql}"
if [[ -z "$LIVE" || ! -f "$LIVE" ]]; then
  echo "usage: $0 /path/to/live-public-schema.sql [rehearsal-schema.sql]" >&2
  exit 1
fi
if [[ ! -f "$REF" ]]; then
  echo "rehearsal reference missing: $REF" >&2
  echo "Run npm run db:rehearse:011 first. It writes database/postgres/ops/011/rehearsal/." >&2
  exit 1
fi
live_norm="$(mktemp)"
ref_norm="$(mktemp)"
trap 'rm -f "$live_norm" "$ref_norm"' EXIT
grep -v -E '^\\(un)?restrict ' "$LIVE" >"$live_norm" || true
grep -v -E '^\\(un)?restrict ' "$REF" >"$ref_norm" || true
if diff -u "$ref_norm" "$live_norm"; then
  echo "live schema dump matches the rehearsal pre-011 public schema"
  exit 0
fi
echo "live schema dump differs from the rehearsal pre-011 public schema" >&2
echo "Read the diff. Role names on ALTER DEFAULT PRIVILEGES often differ (ubuntu vs postgres)." >&2
echo "Differences in policies, function bodies, or grants mean rollback.sql ASSUMES-REPO steps will not restore this database." >&2
exit 1
