#!/usr/bin/env bash
# Everything on this VM, one command, safe to rerun:
#   PostgreSQL (TLS) → schema, site data, demo users, 35 days of history → web app + HTTPS (Caddy) → edge + pdf
#   → boot units, daily job, nightly backup. Demo sign-in: admin / admin (DEMO_ADMIN=1).
#   bash scripts/vm/go-live.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
HOST=${SITE_HOST:-globe.joulewise.tech}
say() { printf '\n== %s\n' "$*"; }

say "Checks"
docker info >/dev/null 2>&1 || { echo "Docker is not usable by $USER. Run: newgrp docker  (or log out and in), then rerun."; exit 1; }
IP=$(curl -fs -H Metadata-Flavor:Google http://metadata.google.internal/computeMetadata/v1/instance/network-interfaces/0/access-configs/0/external-ip)
echo "VM external IP: $IP · disk: $(df -h / | awk 'NR==2{print $2" total, "$4" free"}')"
command -v pnpm >/dev/null || sudo npm install -g pnpm@10.28.0

say "Database"
bash scripts/vm/start-db.sh >/tmp/start-db.log 2>&1 || { cat /tmp/start-db.log; exit 1; }
grep -E "ready|Created" /tmp/start-db.log || true
APP_PASSWORD=$(grep '^APP_PASSWORD=' .env.db | cut -d= -f2)

say "Secrets (.env.app and .env, created once, stay on this VM)"
if [ ! -f .env.app ]; then
  umask 077
  cat > .env.app <<ENV
DATABASE_URL=postgres://drm_app:${APP_PASSWORD}@127.0.0.1:5432/drm?sslmode=require
AUTH_SECRET=$(openssl rand -base64 33 | tr -d '\n')
AUTH_TRUST_HOST=true
EDGE_DEVICE_ID=edge-globe-lko-01
EDGE_DEVICE_SECRET=$(openssl rand -hex 32)
CRON_SECRET=$(openssl rand -hex 24)
DEMO_ADMIN=1
DEMO_PASSWORD=admin
PUBLIC_URL=https://${HOST}
REPORT_BASE_URL=http://127.0.0.1:3100
ENV
  echo "Created .env.app"
fi
DEVICE_SECRET=$(grep '^EDGE_DEVICE_SECRET=' .env.app | cut -d= -f2)
[ -f .env ] || cp .env.example .env
setkv() { if grep -q "^$1=" .env; then sed -i "s#^$1=.*#$1=$2#" .env; else echo "$1=$2" >> .env; fi; }
setkv CLOUD_URL http://127.0.0.1:3100
setkv DEVICE_ID edge-globe-lko-01
setkv DEVICE_SECRET "$DEVICE_SECRET"
setkv EDGE_BUFFER /app/apps/edge/data/outbox.sqlite
chmod 600 .env
echo "Edge .env points at the local web app with the matching device secret"

say "Schema, site data, demo users, history"
DEMO_PASSWORD=admin SKIP_BACKFILL=$([ -f .backfilled ] && echo 1 || echo 0) bash scripts/vm/init-data.sh
touch .backfilled

say "Web app + HTTPS"
GIT_SHA=$(git rev-parse --short HEAD) docker compose -f docker-compose.app.yml up -d --build
echo -n "Waiting for the web app"; for _ in $(seq 1 60); do curl -fs http://127.0.0.1:3100/api/health >/dev/null && { echo " up."; break; }; echo -n "."; sleep 3; done
curl -fs http://127.0.0.1:3100/api/health; echo

say "Edge + pdf"
docker compose -f docker-compose.edge.yml up -d --build
sleep 20
docker compose -f docker-compose.edge.yml logs --tail 5 edge

say "Boot units, daily job, nightly backup"
sudo bash scripts/vm/install-ops.sh

say "Public access"
DNS=$(getent hosts "$HOST" | awk '{print $1}' | head -1 || true)
echo "DNS $HOST → ${DNS:-nothing} (needs $IP)"
if curl -fs --max-time 10 "https://$HOST/api/health" >/dev/null; then
  echo "LIVE: https://$HOST  · sign in admin / admin"
else
  echo "Not reachable on https://$HOST yet. Two things make it public:"
  echo " 1. DNS: an A record  globe.joulewise.tech → $IP  (joulewise.tech is on Vercel DNS: vercel dns add joulewise.tech globe A $IP)"
  echo " 2. Firewall (Cloud Shell): gcloud compute firewall-rules create drm-allow-web --network default --allow tcp:80,tcp:443 --target-tags drmanagement --source-ranges 0.0.0.0/0"
  echo "Then: docker compose -f docker-compose.app.yml restart caddy"
fi
say "Done"
