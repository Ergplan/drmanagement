#!/usr/bin/env bash
# Nightly custom-format dump of the drm database to gs://$BACKUP_BUCKET (30-day lifecycle on the bucket).
# The dump runs inside the postgres:17 container, so client and server versions always match.
set -euo pipefail
cd "$(dirname "$0")/../.."
: "${BACKUP_BUCKET:?set BACKUP_BUCKET in .env.backup}"
STAMP=$(date -u +%Y-%m-%dT%H%MZ)
OUT="gs://${BACKUP_BUCKET}/drm/drm-${STAMP}.dump"
docker compose -f docker-compose.db.yml exec -T db pg_dump -U drm_admin -d drm -Fc -Z 6 | gcloud storage cp - "$OUT"
SIZE=$(gcloud storage ls -l "$OUT" | awk 'NR==1{print $1}')
echo "backup ok: $OUT ($SIZE bytes)"
[ "${SIZE:-0}" -gt 100000 ] || { echo "backup looks too small"; exit 1; }
