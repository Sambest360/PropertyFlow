#!/usr/bin/env bash
# Pull latest code and redeploy.
set -euo pipefail
cd /var/www/propertyflow
git pull
npm ci
# Same dist-next build + safe swap as release.sh (do not empty live dist/).
# shellcheck source=deploy/build-and-swap-dist.sh
. deploy/build-and-swap-dist.sh
propertyflow_build_and_swap_dist
pm2 restart propertyflow-api
echo "Updated."
