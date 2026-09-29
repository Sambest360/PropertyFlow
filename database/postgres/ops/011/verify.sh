#!/usr/bin/env bash
# Run verify.sql. Exits non-zero when any check is FAIL.
# Required environment (UUIDs of two real agencies on the database you are checking):
#   TENANT_A_AUTH_ID TENANT_A_USER_ID STAFF_A_AUTH_ID STAFF_A_USER_ID
#   AGENCY_A_ID AGENCY_B_ID LANDLORD_A_USER_ID LANDLORD_A_AUTH_ID UNLINKED_A_USER_ID
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$HERE/lib.sh"
resolve_database_url

required=(TENANT_A_AUTH_ID TENANT_A_USER_ID STAFF_A_AUTH_ID STAFF_A_USER_ID AGENCY_A_ID AGENCY_B_ID LANDLORD_A_USER_ID LANDLORD_A_AUTH_ID UNLINKED_A_USER_ID)
for name in "${required[@]}"; do
  if [[ -z "${!name:-}" ]]; then
    echo "missing $name" >&2
    exit 1
  fi
done

out="$(psql "$DATABASE_URL_RESOLVED" -v ON_ERROR_STOP=1 \
  -v tenant_a_auth_id="$TENANT_A_AUTH_ID" \
  -v tenant_a_user_id="$TENANT_A_USER_ID" \
  -v staff_a_auth_id="$STAFF_A_AUTH_ID" \
  -v staff_a_user_id="$STAFF_A_USER_ID" \
  -v agency_a_id="$AGENCY_A_ID" \
  -v agency_b_id="$AGENCY_B_ID" \
  -v landlord_a_user_id="$LANDLORD_A_USER_ID" \
  -v landlord_a_auth_id="$LANDLORD_A_AUTH_ID" \
  -v unlinked_a_user_id="$UNLINKED_A_USER_ID" \
  -A -F $'\t' --pset footer=off \
  -f "$HERE/verify.sql")"
printf '%s\n' "$out"

if printf '%s\n' "$out" | awk -F '\t' '$2 == "FAIL" { found = 1 } END { exit (found ? 0 : 1) }'; then
  echo "verify: one or more checks FAILED" >&2
  exit 1
fi
echo "verify: all checks PASSED"
