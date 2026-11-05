#!/usr/bin/env bash
# One-step release on the server: backup, pull, add-only migrations, build, crons, restart.
#   cd /var/www/propertyflow && git pull && bash deploy/release.sh
# Migrations listed below must be add-only and safe to run again (IF NOT EXISTS).
set -euo pipefail
cd /var/www/propertyflow

MIGRATIONS=(
  database/postgres/migrations/032_reviews.sql
  database/postgres/migrations/033_complaints_warnings.sql
  database/postgres/migrations/034_contractor_bookings.sql
  database/postgres/migrations/035_email_system.sql
  database/postgres/migrations/036_saas_billing.sql
  database/postgres/migrations/037_units_erf_size.sql
  database/postgres/migrations/038_sms_listing_approvals.sql
)

echo "== Backup"
bash deploy/backup.sh

echo "== Pull"
git pull --ff-only

echo "== Migrations"
for f in "${MIGRATIONS[@]}"; do
  echo "   $f"
  # Uses the app's pg driver: the DATABASE_URL password contains an @, which psql URLs mangle.
  node --env-file=.env --input-type=module -e "
    import pg from 'pg'
    import { readFileSync } from 'node:fs'
    const db = new pg.Client({ connectionString: process.env.DATABASE_URL })
    await db.connect()
    try { await db.query(readFileSync(process.argv[1], 'utf8')) } finally { await db.end() }
  " "$f"
done

echo "== Build"
npm ci
NODE_OPTIONS=--max-old-space-size=2048 npx vite build

echo "== Crons"
bash deploy/crons.sh

echo "== Restart"
pm2 restart propertyflow-api
sleep 3
curl -fsS "http://127.0.0.1:${API_PORT:-8787}/api/health?db=1" && echo
echo "Released $(git rev-parse --short HEAD)."
