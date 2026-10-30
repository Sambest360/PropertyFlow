#!/usr/bin/env bash
# (Re)install PropertyFlow's scheduled jobs in root's crontab. Safe to re-run:
# each job's old line is replaced, other crontab lines are kept.
# Times are UTC (server clock);
# SAST = UTC+2.
set -euo pipefail
cd "${APP_DIR:-/var/www/propertyflow}"
CS=$( (grep '^CRON_SECRET=' .env || true) | tail -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
[ -n "$CS" ] || { echo "CRON_SECRET is not set in .env — add one (openssl rand -hex 32) first"; exit 1; }
API=http://127.0.0.1:8787/api/cron
job() { echo "$1 curl -s -m 120 -H 'Authorization: Bearer $CS' $API/$2 >/dev/null"; }
# Read the current crontab in full before writing the new one.
EXISTING=$(crontab -l 2>/dev/null || true)
{
  printf '%s\n' "$EXISTING" | grep -v -E 'api/cron/(lease-reminders|escalations|storage-alerts|screening-purge|saas-billing)' | grep -v '^$' || true
  job '0 5 * * *'  lease-reminders   # 07:00 SAST: lease renewal / expiry reminders
  job '5 * * * *'  escalations       # hourly: overdue faults, rent increase notices
  job '15 6 * * *' storage-alerts    # 08:15 SAST: storage allowance alerts
  job '30 1 * * *' screening-purge   # 03:30 SAST: purge screening results past retention
  job '0 4 * * *'  saas-billing      # 06:00 SAST: monthly Lekaya invoices (from the 1st) + unpaid reminders
} | crontab -
echo "Installed:"; crontab -l | grep -E 'api/cron/' | sed -E 's/Bearer [^ ]+/Bearer ***/'
