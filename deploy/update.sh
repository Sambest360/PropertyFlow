#!/usr/bin/env bash
# Pull latest code and redeploy.
set -euo pipefail
cd /var/www/propertyflow
git pull
npm ci
NODE_OPTIONS=--max-old-space-size=2048 npx vite build
pm2 restart propertyflow-api
echo "Updated."
