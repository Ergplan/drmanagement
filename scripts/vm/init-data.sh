#!/usr/bin/env bash
# One-time (and safe to rerun): migrate the VM database, load reference data and demo users, and backfill
# simulated history. Run after start-db.sh, from the repo root on the VM. Secrets stay on the VM.
set -euo pipefail
cd "$(dirname "$0")/../.."
[ -f .env.db ] || { echo "Run scripts/vm/start-db.sh first."; exit 1; }
APP_PASSWORD=$(grep '^APP_PASSWORD=' .env.db | cut -d= -f2)
# Same host: TLS over 127.0.0.1 (the certificate is for the public IP, so no CA check on this hop).
export DATABASE_URL="postgres://drm_app:${APP_PASSWORD}@127.0.0.1:5432/drm?sslmode=require"
unset PG_CA_CERT
pnpm install --frozen-lockfile
pnpm --filter @drm/db migrate
if [ -z "${DEMO_PASSWORD:-}" ]; then read -r -s -p "Demo user password (the same DEMO_PASSWORD you set in Vercel): " DEMO_PASSWORD; echo; fi
export DEMO_PASSWORD
pnpm --filter @drm/db seed
# History for forecasts, baselines and reports (simulated, flagged as such). Skip with SKIP_BACKFILL=1.
if [ "${SKIP_BACKFILL:-0}" != "1" ]; then BACKFILL_FROM="${BACKFILL_FROM:-$(date -u -d '-35 days' +%Y-%m-%dT00:00:00+05:30)}" pnpm --filter @drm/edge backfill; fi
echo "Database ready. Next: start the edge (Step 5)."
