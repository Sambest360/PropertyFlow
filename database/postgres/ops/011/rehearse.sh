#!/usr/bin/env bash
# Local rehearsal of migration 011. Never connects to a hosted Supabase project.
# Usage: npm run db:rehearse:011
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../../../.." && pwd)"
DB_NAME="propertyflow_011_rehearse"
ADMIN_URL="postgresql:///postgres?host=/var/run/postgresql"
export DATABASE_URL="postgresql:///${DB_NAME}?host=/var/run/postgresql"
LOG="${REHEARSE_LOG:-/tmp/propertyflow-011-rehearse.log}"
WORK="${REHEARSE_WORK:-/tmp/propertyflow-011-rehearse}"
mkdir -p "$WORK"
: >"$LOG"

# Fixed fixtures in local/seed_two_agencies.sql. verify.sql reads the same ids.
export TENANT_A_AUTH_ID="11111111-1111-4111-8111-000000000005"
export TENANT_A_USER_ID="11111111-1111-4111-8111-000000000005"
export STAFF_A_AUTH_ID="11111111-1111-4111-8111-000000000001"
export AGENCY_A_ID="11111111-1111-4111-8111-111111111111"
export AGENCY_B_ID="22222222-2222-4222-8222-222222222222"
export LANDLORD_A_USER_ID="11111111-1111-4111-8111-000000000004"

TABLES=(
  buildings units rooms internal_assets leads applications
  leases bookings viewing_slots payments documents
  maintenance_tickets message_threads messages notifications
  suite_alerts client_lookup_configs client_subscriptions invoices
  event_log
)

MIGRATIONS=(
  001_performance_indexes.sql
  002_supabase_auth.sql
  003_rls_bootstrap.sql
  004_ensure_user_profile.sql
  005_public_listing_enquiry.sql
  006_public_marketplace_bootstrap.sql
  007_clear_demo_applications.sql
  007_public_marketplace_rooms.sql
  007_trust_banking.sql
  008_public_marketplace_lite.sql
  008_realtime_publication.sql
  008_ticket_updates_rls.sql
  009_fix_auth_user_profile_sync.sql
  010_lead_metadata.sql
)

for id in "$TENANT_A_AUTH_ID" "$STAFF_A_AUTH_ID" "$AGENCY_A_ID" "$AGENCY_B_ID" "$LANDLORD_A_USER_ID"; do
  grep -q "$id" "$HERE/local/seed_two_agencies.sql" || {
    echo "seed file is missing fixture $id" >&2
    exit 1
  }
done

if ! pg_isready -h /var/run/postgresql -q; then
  sudo pg_ctlcluster 16 main start
fi

echo "rehearsal log: $LOG"
psql "$ADMIN_URL" -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE);" >>"$LOG"
psql "$ADMIN_URL" -v ON_ERROR_STOP=1 -c "CREATE DATABASE ${DB_NAME};" >>"$LOG"

apply_file() {
  local file="$1"
  echo "  $(basename "$file")"
  if ! psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f "$file" >>"$LOG" 2>&1; then
    echo "FAILED $file" >&2
    tail -50 "$LOG" >&2
    exit 1
  fi
}

echo "stub roles and auth.uid()"
apply_file "$HERE/local/supabase_roles.sql"
echo "schema"
apply_file "$ROOT/database/postgres/schema.sql"
echo "migrations 001-010"
for name in "${MIGRATIONS[@]}"; do
  apply_file "$ROOT/database/postgres/migrations/$name"
done
echo "seed two agencies"
apply_file "$HERE/local/seed_two_agencies.sql"

run_verify() {
  local dest="$1"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
    -v tenant_a_auth_id="$TENANT_A_AUTH_ID" \
    -v tenant_a_user_id="$TENANT_A_USER_ID" \
    -v staff_a_auth_id="$STAFF_A_AUTH_ID" \
    -v agency_a_id="$AGENCY_A_ID" \
    -v agency_b_id="$AGENCY_B_ID" \
    -v landlord_a_user_id="$LANDLORD_A_USER_ID" \
    -A -F $'\t' --pset footer=off \
    -f "$HERE/verify.sql" >"$dest"
}

result_of() {
  local file="$1" id="$2"
  awk -F '\t' -v id="$id" '$1 == id { print $2; found = 1 } END { if (!found) print "MISSING" }' "$file"
}

expect_result() {
  local file="$1" id="$2" want="$3"
  local got
  got="$(result_of "$file" "$id")"
  if [[ "$got" != "$want" ]]; then
    echo "expected $id=$want before/after check, got $got" >&2
    grep -F "$id" "$file" >&2 || true
    exit 1
  fi
}

echo "verify before 011 (isolation checks must FAIL)"
run_verify "$WORK/verify-before.txt"
for id in a_anon_bootstrap a_anon_bootstrap_lite a_password_hash_column \
  c_role c_client_id c_active c_frontend_role c_enabled_permissions c_verification; do
  expect_result "$WORK/verify-before.txt" "$id" FAIL
done
for tbl in "${TABLES[@]}"; do
  expect_result "$WORK/verify-before.txt" "b_end_user_${tbl}" FAIL
done
for id in c_first_name c_nickname c_auth_user_id d_staff_users \
  d_tenant_own_notification d_tenant_own_application; do
  expect_result "$WORK/verify-before.txt" "$id" PASS
done
for tbl in "${TABLES[@]}"; do
  expect_result "$WORK/verify-before.txt" "d_staff_${tbl}" PASS
done
echo "  before-011 teeth confirmed ($(awk -F '\t' '$1 != "SUMMARY" && $2 == "FAIL" { c++ } END { print c + 0 }' "$WORK/verify-before.txt") FAIL checks)"

echo "pre-apply snapshot"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -A -t -f "$HERE/pre_apply_snapshot.sql" >"$WORK/snapshot-pre.txt"
bash "$HERE/schema_dump.sh" "$WORK/dump-pre.sql" >>"$LOG"

echo "probe: forced failure must roll the transaction back"
probe="$WORK/probe.sql"
cat "$ROOT/database/postgres/migrations/011_tenant_isolation.sql" >"$probe"
printf '\nDO $$ BEGIN RAISE EXCEPTION '\''rehearsal forced failure'\''; END $$;\n' >>"$probe"
if SKIP_PRECHECK=1 bash "$HERE/apply.sh" "$probe" >>"$LOG" 2>&1; then
  echo "probe apply succeeded; single-transaction rollback is not working" >&2
  exit 1
fi
left="$(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -A -t -c "SELECT count(*) FROM pg_proc WHERE proname = 'protect_user_privileged_columns'")"
if [[ "$left" != "0" ]]; then
  echo "probe left protect_user_privileged_columns in place ($left)" >&2
  exit 1
fi
echo "  probe rolled back (function absent)"

echo "apply 011"
bash "$HERE/apply.sh" >>"$LOG"

echo "verify after 011 (every check must PASS)"
if ! run_verify "$WORK/verify-after.txt"; then
  echo "verify.sql failed to execute after apply" >&2
  cat "$WORK/verify-after.txt" >&2 || true
  exit 1
fi
if awk -F '\t' '$2 == "FAIL" { found = 1 } END { exit (found ? 0 : 1) }' "$WORK/verify-after.txt"; then
  echo "verify after 011 has FAIL rows:" >&2
  awk -F '\t' '$2 == "FAIL"' "$WORK/verify-after.txt" >&2
  exit 1
fi
echo "  $(awk -F '\t' '$1=="SUMMARY"{print $3}' "$WORK/verify-after.txt")"

echo "rollback"
bash "$HERE/rollback.sh" >>"$LOG"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -A -t -f "$HERE/pre_apply_snapshot.sql" >"$WORK/snapshot-post.txt"
if ! diff -u "$WORK/snapshot-pre.txt" "$WORK/snapshot-post.txt" >"$WORK/snapshot.diff"; then
  echo "rollback snapshot diff is not empty" >&2
  head -80 "$WORK/snapshot.diff" >&2
  exit 1
fi
echo "  catalog snapshot diff: empty"

bash "$HERE/schema_dump.sh" "$WORK/dump-post.sql" >>"$LOG"
# pg_dump 16 emits a random \restrict token; strip it before comparing.
grep -v -E '^\\(un)?restrict ' "$WORK/dump-pre.sql" >"$WORK/dump-pre.norm.sql" || true
grep -v -E '^\\(un)?restrict ' "$WORK/dump-post.sql" >"$WORK/dump-post.norm.sql" || true
if ! diff -q "$WORK/dump-pre.norm.sql" "$WORK/dump-post.norm.sql" >"$WORK/dump.diff"; then
  echo "public schema dump diff is not empty (after stripping \restrict tokens)" >&2
  diff -u "$WORK/dump-pre.norm.sql" "$WORK/dump-post.norm.sql" | head -80 >&2
  exit 1
fi
echo "  pg_dump --schema-only public diff: empty"

echo "re-apply 011 and verify again"
bash "$HERE/apply.sh" >>"$LOG"
if ! run_verify "$WORK/verify-reapply.txt"; then
  echo "verify.sql failed after re-apply" >&2
  exit 1
fi
if awk -F '\t' '$2 == "FAIL" { found = 1 } END { exit (found ? 0 : 1) }' "$WORK/verify-reapply.txt"; then
  echo "verify after re-apply has FAIL rows:" >&2
  awk -F '\t' '$2 == "FAIL"' "$WORK/verify-reapply.txt" >&2
  exit 1
fi

echo
echo "REHEARSAL OK"
echo "  database: $DATABASE_URL"
echo "  before 011 FAIL count: $(awk -F '\t' '$1 != "SUMMARY" && $2 == "FAIL" { c++ } END { print c + 0 }' "$WORK/verify-before.txt")"
echo "  after 011: $(awk -F '\t' '$1=="SUMMARY"{print $2, $3}' "$WORK/verify-after.txt")"
echo "  after re-apply: $(awk -F '\t' '$1=="SUMMARY"{print $2, $3}' "$WORK/verify-reapply.txt")"
echo "  rollback catalog diff: empty"
echo "  rollback schema dump diff: empty"
echo "  log: $LOG"
