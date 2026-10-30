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
# Scheduled jobs (lease reminders, escalations, storage alerts, screening purge)
bash deploy/crons.sh
sleep 2; curl -s -o /dev/null -w "API status: %{http_code}\n" http://127.0.0.1:8787/api/auth/me
# TLS is not automated here. After DNS points at this box, run the certbot nginx
# plugin with --redirect (it edits the installed file); see deploy/README.md.
echo "Done. Next: point DNS to $(curl -s -4 ifconfig.me), then run: certbot --nginx --redirect -d lekayarentals.site -d www.lekayarentals.site (see deploy/README.md)"
echo "After certbot --nginx: add include conf.d/propertyflow-security-headers.conf; inside the 443 location /assets/ block (see deploy/README.md)"
