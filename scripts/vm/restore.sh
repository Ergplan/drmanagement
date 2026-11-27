#!/usr/bin/env bash
# Restore test (default): load the latest (or a named) dump into a scratch database drm_restore and compare row
# counts with the live database. Nothing live is touched.
#   bash scripts/vm/restore.sh                 # latest dump → drm_restore, then compare
#   bash scripts/vm/restore.sh gs://…/x.dump   # a specific dump
# Real recovery (replaces the live database; stop the edge first, see RUNBOOK): RESTORE_INTO=drm bash scripts/vm/restore.sh <dump>
set -euo pipefail
cd "$(dirname "$0")/../.."
set -a; [ -f .env.backup ] && . ./.env.backup; set +a
: "${BACKUP_BUCKET:?set BACKUP_BUCKET in .env.backup}"
DUMP=${1:-$(gcloud storage ls "gs://${BACKUP_BUCKET}/drm/" | sort | tail -1)}
TARGET=${RESTORE_INTO:-drm_restore}
DC="docker compose -f docker-compose.db.yml exec -T db"
echo "restoring $DUMP into $TARGET"
if [ "$TARGET" = "drm" ]; then
  read -r -p "This replaces the LIVE database. Type RESTORE to continue: " ok
  [ "$ok" = "RESTORE" ] || exit 1
fi
$DC psql -U drm_admin -d postgres -v ON_ERROR_STOP=1 -c "drop database if exists ${TARGET}_tmp" -c "create database ${TARGET}_tmp owner drm_app"
gcloud storage cat "$DUMP" | $DC pg_restore -U drm_admin -d "${TARGET}_tmp" --no-owner --role=drm_app
if [ "$TARGET" = "drm" ]; then
  $DC psql -U drm_admin -d postgres -c "select pg_terminate_backend(pid) from pg_stat_activity where datname = 'drm' and pid <> pg_backend_pid()" >/dev/null
  $DC psql -U drm_admin -d postgres -v ON_ERROR_STOP=1 -c "alter database drm rename to drm_before_restore_$(date -u +%Y%m%d%H%M)" -c "alter database ${TARGET}_tmp rename to drm"
  echo "live database replaced; the previous one is kept as drm_before_restore_*"
else
  $DC psql -U drm_admin -d postgres -c "drop database if exists ${TARGET}" -c "alter database ${TARGET}_tmp rename to ${TARGET}"
  for t in block_15m day_1d dr_event command audit_log settlement; do
    a=$($DC psql -U drm_admin -d drm -Atc "select count(*) from $t")
    b=$($DC psql -U drm_admin -d "$TARGET" -Atc "select count(*) from $t")
    echo "$t live=$a restored=$b"
  done
  echo "restore test done (rows written since the dump explain small differences)"
fi
