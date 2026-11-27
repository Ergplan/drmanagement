#!/usr/bin/env bash
# Installs the boot-time stack unit and the nightly backup timer. Run once on the VM: sudo bash scripts/vm/install-ops.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
[ -f .env.backup ] || { echo "Create .env.backup with BACKUP_BUCKET=<bucket name> first (see docs/RUNBOOK.md)."; exit 1; }
cp scripts/vm/drm-stack.service scripts/vm/drm-backup.service scripts/vm/drm-backup.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now drm-stack.service
systemctl enable --now drm-backup.timer
systemctl list-timers drm-backup.timer --no-pager
echo "Installed. Reboot test: sudo reboot, then within 2 minutes: docker compose -f docker-compose.edge.yml logs --tail 5 edge"
