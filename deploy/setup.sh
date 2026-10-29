#!/usr/bin/env bash
# One-time server setup. Run as root from /var/www/propertyflow after copying .env in.
set -euo pipefail
cd /var/www/propertyflow
[ -f .env ] || { echo "Missing .env — copy deploy/server.env here as .env first"; exit 1; }
npm ci
NODE_OPTIONS=--max-old-space-size=2048 npx vite build
cp deploy/ecosystem.config.cjs /var/www/propertyflow/ecosystem.config.cjs
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup systemd -u root --hp /root | tail -1 | bash || true
cp deploy/nginx-propertyflow.conf /etc/nginx/sites-available/propertyflow
ln -sf /etc/nginx/sites-available/propertyflow /etc/nginx/sites-enabled/propertyflow
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
# Daily lease reminders at 07:00 SAST (replaces the Vercel cron)
CS=$(grep '^CRON_SECRET=' .env | cut -d= -f2)
( crontab -l 2>/dev/null | grep -v lease-reminders; echo "0 5 * * * curl -s -H 'Authorization: Bearer $CS' http://127.0.0.1:8787/api/cron/lease-reminders >/dev/null" ) | crontab -
# Hourly escalations: overdue faults / tickets, rent increase notices and increases
( crontab -l 2>/dev/null | grep -v api/cron/escalations; echo "5 * * * * curl -s -H 'Authorization: Bearer $CS' http://127.0.0.1:8787/api/cron/escalations >/dev/null" ) | crontab -
# Daily storage allowance check at 08:15 SAST (alerts super admins)
( crontab -l 2>/dev/null | grep -v storage-alerts; echo "15 6 * * * curl -s -H 'Authorization: Bearer $CS' http://127.0.0.1:8787/api/cron/storage-alerts >/dev/null" ) | crontab -
sleep 2; curl -s -o /dev/null -w "API status: %{http_code}\n" http://127.0.0.1:8787/api/auth/me
echo "Done. Next: point DNS to $(curl -s -4 ifconfig.me), then run certbot."
