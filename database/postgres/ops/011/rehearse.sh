#!/usr/bin/env bash
# Local rehearsal of migration 011. Never connects to a hosted Supabase project.
# Usage: npm run db:rehearse:011
#
# Self-contained by default: creates propertyflow_011_rehearse on the local
# cluster, applies the role stub, schema, migrations 001-010, 011a, and
# local/seed_two_agencies.sql.
#
# Later, point this at `supabase start` and a shared fixture without a second seed:
#   REHEARSE_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:54322/postgres'
#   REHEARSE_SKIP_BOOTSTRAP=1          # stack already has roles, schema, 001-011a
#   REHEARSE_SEED_SQL=path/to/shared-two-agencies.sql
#   TENANT_A_AUTH_ID=...               # override when the shared fixture uses other ids
# Reset that local database first (`supabase db reset`). This script still
# inserts the seed and applies 011.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../../../.." && pwd)"
DB_NAME="propertyflow_011_rehearse"
ADMIN_URL="postgresql:///postgres?host=/var/run/postgresql"
LOG="${REHEARSE_LOG:-/tmp/propertyflow-011-rehearse.log}"
WORK="${REHEARSE_WORK:-/tmp/propertyflow-011-rehearse}"
SEED_SQL="${REHEARSE_SEED_SQL:-$HERE/local/seed_two_agencies.sql}"
mkdir -p "$WORK"
: >"$LOG"

# Defaults match local/seed_two_agencies.sql. Override with the shared fixture's ids.
export TENANT_A_AUTH_ID="${TENANT_A_AUTH_ID:-11111111-1111-4111-8111-000000000005}"
export TENANT_A_USER_ID="${TENANT_A_USER_ID:-11111111-1111-4111-8111-000000000005}"
export STAFF_A_AUTH_ID="${STAFF_A_AUTH_ID:-11111111-1111-4111-8111-000000000001}"
export AGENCY_A_ID="${AGENCY_A_ID:-11111111-1111-4111-8111-111111111111}"
export AGENCY_B_ID="${AGENCY_B_ID:-22222222-2222-4222-8222-222222222222}"
export LANDLORD_A_USER_ID="${LANDLORD_A_USER_ID:-11111111-1111-4111-8111-000000000004}"
export LANDLORD_A_AUTH_ID="${LANDLORD_A_AUTH_ID:-11111111-1111-4111-8111-000000000004}"
export UNLINKED_A_USER_ID="${UNLINKED_A_USER_ID:-11111111-1111-4111-8111-000000000007}"
export STAFF_A_USER_ID="${STAFF_A_USER_ID:-11111111-1111-4111-8111-000000000001}"
export NOVERIF_LANDLORD_ID="${NOVERIF_LANDLORD_ID:-11111111-1111-4111-8111-000000000008}"

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

for id in "$TENANT_A_AUTH_ID" "$STAFF_A_AUTH_ID" "$AGENCY_A_ID" "$AGENCY_B_ID" "$LANDLORD_A_USER_ID" "$UNLINKED_A_USER_ID" "$NOVERIF_LANDLORD_ID"; do
  grep -q "$id" "$SEED_SQL" || {
    echo "seed file is missing fixture $id ($SEED_SQL)" >&2
    exit 1
  }
done

if [[ -n "${REHEARSE_DATABASE_URL:-}" ]]; then
  case "$REHEARSE_DATABASE_URL" in
    *supabase.co*|*supabase.com*|*:6543*|*:6543/*)
      echo "Refusing hosted Supabase or port 6543. This rehearsal is local only." >&2
      exit 1
      ;;
    postgresql://*@127.0.0.1:*|postgresql://*@localhost:*|postgres://*@127.0.0.1:*|postgres://*@localhost:*|postgresql:///*|postgres:///*)
      export DATABASE_URL="$REHEARSE_DATABASE_URL"
      ;;
    *)
      echo "REHEARSE_DATABASE_URL must be local (127.0.0.1, localhost, or a socket). supabase start uses 127.0.0.1:54322." >&2
      exit 1
      ;;
  esac
else
  if ! pg_isready -h /var/run/postgresql -q; then
    sudo pg_ctlcluster 16 main start
  fi
  export DATABASE_URL="postgresql:///${DB_NAME}?host=/var/run/postgresql"
  echo "rehearsal log: $LOG"
  psql "$ADMIN_URL" -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE);" >>"$LOG"
  psql "$ADMIN_URL" -v ON_ERROR_STOP=1 -c "CREATE DATABASE ${DB_NAME};" >>"$LOG"
fi

echo "rehearsal log: $LOG"
echo "database: $DATABASE_URL"

apply_file() {
  local file="$1"
  echo "  $(basename "$file")"
  if ! psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f "$file" >>"$LOG" 2>&1; then
    echo "FAILED $file" >&2
    tail -50 "$LOG" >&2
    exit 1
  fi
}

if [[ "${REHEARSE_SKIP_BOOTSTRAP:-}" == "1" ]]; then
  echo "skip bootstrap (expect roles, schema, migrations 001-010, and 011a already applied)"
else
  echo "stub roles and auth.uid()"
  apply_file "$HERE/local/supabase_roles.sql"
  echo "schema"
  apply_file "$ROOT/database/postgres/schema.sql"
  echo "migrations 001-010"
  for name in "${MIGRATIONS[@]}"; do
    apply_file "$ROOT/database/postgres/migrations/$name"
  done
  echo "011a public RPC stopgap"
  apply_file "$ROOT/database/postgres/migrations/011a_public_rpc_stopgap.sql"
fi
echo "seed $(basename "$SEED_SQL")"
apply_file "$SEED_SQL"
echo "rehearsal-only service_role table grants"
apply_file "$HERE/local/service_role_grants.sql"

run_verify() {
  local dest="$1"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
    -v tenant_a_auth_id="$TENANT_A_AUTH_ID" \
    -v tenant_a_user_id="$TENANT_A_USER_ID" \
    -v staff_a_auth_id="$STAFF_A_AUTH_ID" \
    -v agency_a_id="$AGENCY_A_ID" \
    -v agency_b_id="$AGENCY_B_ID" \
    -v staff_a_user_id="$STAFF_A_USER_ID" \
    -v landlord_a_user_id="$LANDLORD_A_USER_ID" \
    -v landlord_a_auth_id="$LANDLORD_A_AUTH_ID" \
    -v unlinked_a_user_id="$UNLINKED_A_USER_ID" \
    -v noverif_landlord_id="$NOVERIF_LANDLORD_ID" \
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
  c_role c_client_id c_active c_frontend_role c_enabled_permissions c_verification \
  b_landlord_hides_staff b_landlord_hides_unlinked_tenant \
  d3_nonstaff_leads_bookings d5_nonstaff_same_agency_writes d6_client_id_not_pivoted \
  d8_views_agency_scoped d9_entity_map_no_cross_agency \
  d_enquiry_no_id_income d_enquiry_rate_limited \
  d_screening_rls d_screening_income_nonneg d_trust_staff_only \
  d_anon_privileged_execute d_signup_not_super_admin; do
  expect_result "$WORK/verify-before.txt" "$id" FAIL
done
for tbl in "${TABLES[@]}"; do
  expect_result "$WORK/verify-before.txt" "b_end_user_${tbl}" FAIL
done
for id in c_first_name c_nickname c_auth_user_id d_staff_users \
  d_tenant_own_notification d_tenant_own_application \
  b_landlord_sees_linked_tenant c_service_role_can_set_role c_direct_admin_can_set_role \
  a_buildings_notes_absent a_client_flag_is_boolean a_verification_only_when_stored \
  e_marketplace_helpers_locked e_public_rpcs_executable \
  e_rls_helpers_anon_denied e_rls_helpers_authenticated \
  d1_anon_rpc_no_secrets d2_anon_catalog_denied d4_cross_agency_writes \
  p_portal_writes_kept; do
  expect_result "$WORK/verify-before.txt" "$id" PASS
done
for tbl in "${TABLES[@]}"; do
  expect_result "$WORK/verify-before.txt" "d_staff_${tbl}" PASS
done
echo "  before-011 teeth confirmed ($(awk -F '\t' '$1 != "SUMMARY" && $2 == "FAIL" { c++ } END { print c + 0 }' "$WORK/verify-before.txt") FAIL checks)"

echo "pre-apply snapshot (post-011a, pre-011)"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -A -t -f "$HERE/pre_apply_snapshot.sql" >"$WORK/snapshot-pre.txt"
bash "$HERE/schema_dump.sh" "$WORK/dump-pre.sql" >>"$LOG"
grep -v -E '^\\(un)?restrict ' "$WORK/dump-pre.sql" >"$WORK/dump-pre.norm.sql" || true

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

echo "policy loop tables all have client_id"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q <<'SQL' >>"$LOG"
DO $$
DECLARE
  tbl text;
  missing text[] := ARRAY[]::text[];
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'buildings', 'units', 'rooms', 'internal_assets', 'leads', 'applications',
    'leases', 'bookings', 'viewing_slots', 'payments', 'documents',
    'maintenance_tickets', 'message_threads', 'messages', 'notifications',
    'suite_alerts', 'client_lookup_configs', 'client_subscriptions', 'invoices',
    'event_log'
  ]
  LOOP
    IF to_regclass('public.' || tbl) IS NULL
       OR NOT EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = tbl AND column_name = 'client_id'
       )
    THEN
      missing := missing || tbl;
    END IF;
  END LOOP;
  IF cardinality(missing) > 0 THEN
    RAISE EXCEPTION 'rehearsal: policy loop tables are not tenant-scoped: %', missing;
  END IF;
END $$;
SQL
grep -q '011 refused: policy loop tables are not tenant-scoped' \
  "$ROOT/database/postgres/migrations/011_tenant_isolation.sql"
grep -q -- '--single-transaction' "$HERE/lib.sh"
grep -q 'ON_ERROR_STOP=1' "$HERE/lib.sh"

echo "probe: a mid-script error must not leave a marker table"
cat >"$WORK/half.sql" <<'SQL'
CREATE TABLE rehearsal_marker (id int);
CREATE TABLE rehearsal_no_client (id int);
DO $$ BEGIN
  RAISE EXCEPTION '011 refused: policy loop tables are not tenant-scoped: {rehearsal_no_client}. No policies were changed.';
END $$;
SQL
if bash "$HERE/apply.sh" "$WORK/half.sql" >>"$LOG" 2>&1; then
  echo "half-apply probe succeeded; single-transaction rollback is not working" >&2
  exit 1
fi
marker="$(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -A -t -c "SELECT to_regclass('public.rehearsal_marker') IS NOT NULL")"
if [[ "$marker" != "f" ]]; then
  echo "half-apply probe left rehearsal_marker ($marker)" >&2
  exit 1
fi
echo "  half-apply rolled back (marker absent)"

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

echo "verify 011a invariants after rollback (notes, verification, JSON boolean)"
run_verify "$WORK/verify-after-rollback.txt"
for id in a_buildings_notes_absent a_client_flag_is_boolean a_verification_only_when_stored; do
  expect_result "$WORK/verify-after-rollback.txt" "$id" PASS
done
echo "  invariants still PASS on the post-011a catalog"

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

echo "011b drops landlord email; 011a invariants stay"
apply_file "$ROOT/database/postgres/migrations/011b_drop_marketplace_landlord_email.sql"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -v agency_a_id="$AGENCY_A_ID" \
  -v landlord_a_user_id="$LANDLORD_A_USER_ID" \
  -v noverif_landlord_id="$NOVERIF_LANDLORD_ID" \
  -A -F $'\t' --pset footer=off \
  -f "$ROOT/database/postgres/migrations/011b_drop_marketplace_landlord_email_verify.sql" \
  >"$WORK/verify-011b.txt"
if awk -F '\t' '$2 == "FAIL" { found = 1 } END { exit (found ? 0 : 1) }' "$WORK/verify-011b.txt"; then
  echo "011b verify has FAIL rows:" >&2
  awk -F '\t' '$2 == "FAIL"' "$WORK/verify-011b.txt" >&2
  exit 1
fi
pass_n="$(awk -F '\t' '$2 == "PASS" { c++ } END { print c + 0 }' "$WORK/verify-011b.txt")"
if [[ "$pass_n" != "5" ]]; then
  echo "011b verify expected 5 PASS rows, got $pass_n" >&2
  cat "$WORK/verify-011b.txt" >&2
  exit 1
fi
echo "  011b: 5 checks passed"
apply_file "$ROOT/database/postgres/migrations/011b_drop_marketplace_landlord_email_rollback.sql"
run_verify "$WORK/verify-after-011b-rollback.txt"
for id in a_buildings_notes_absent a_client_flag_is_boolean a_verification_only_when_stored; do
  expect_result "$WORK/verify-after-011b-rollback.txt" "$id" PASS
done
email_back="$(psql "$DATABASE_URL" -q -v ON_ERROR_STOP=1 -A -t -c "SELECT bool_or(u.value ? 'email') FROM jsonb_array_elements(public.get_public_marketplace_bootstrap(true)->'users') AS u(value)")"
if [[ "$email_back" != "t" ]]; then
  echo "011b rollback did not restore landlord email ($email_back)" >&2
  exit 1
fi
echo "  011b rollback restored email; invariants still PASS"

echo
echo "REHEARSAL OK"
echo "  database: $DATABASE_URL"
echo "  before 011 FAIL count: $(awk -F '\t' '$1 != "SUMMARY" && $2 == "FAIL" { c++ } END { print c + 0 }' "$WORK/verify-before.txt")"
echo "  after 011: $(awk -F '\t' '$1=="SUMMARY"{print $2, $3}' "$WORK/verify-after.txt")"
echo "  after re-apply: $(awk -F '\t' '$1=="SUMMARY"{print $2, $3}' "$WORK/verify-reapply.txt")"
echo "  invariants after 011 rollback: PASS"
echo "  011b email removed, then restored"
echo "  rollback catalog diff: empty"
echo "  rollback schema dump diff: empty"
echo "  log: $LOG"
