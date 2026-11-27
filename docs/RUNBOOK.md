# Runbook · ergOS for Globe Medicare

Everything here runs on the VM `drmanagement` (GCP project replanner-513407, asia-south2-b) from `/work/drmanagement`, unless it says Vercel or Cloud Shell. Reach the VM: Cloud Shell → `gcloud compute ssh drmanagement --zone asia-south2-b --tunnel-through-iap`.

## Check health (start of every session)
```bash
cd /work/drmanagement
docker compose -f docker-compose.db.yml ps && docker compose -f docker-compose.edge.yml ps
docker compose -f docker-compose.edge.yml logs --tail 20 edge      # no "uplink failed" lines
curl -s https://globe.joulewise.tech/api/health                     # {"ok":true,…}
```
On the site: the top bar shows the ceiling pill (not "Edge offline"); Clinical safety shows 9 of 9 interlocks healthy.

## Start and stop the edge
```bash
docker compose -f docker-compose.edge.yml up -d --build    # start or update (rebuild after dependency changes)
docker compose -f docker-compose.edge.yml restart edge     # restart: it restores every load on start, then re-pulls armed events
docker compose -f docker-compose.edge.yml stop             # stop: loads stay as the devices hold them; use manual mode first
```
The whole stack (database, edge, pdf) starts on boot via `drm-stack.service`. After a reboot the edge is uplinking within 2 minutes; check with the logs line above.

## Put the site in manual mode (no automatic control)
1. In `.env` set `ENGINEER_ARMED=false`, then `docker compose -f docker-compose.edge.yml up -d`.
2. The "duty engineer armed" interlock trips. The edge restores every curtailed load within one tick and refuses every new command (ceiling, DR, heat-pump schedule) until it is set back to `true`.
3. Clinical safety shows the trip; tell the facility manager.
Monitoring, reports and Street View keep working.

## Rotate the edge device token
1. Make a new secret on the VM: `openssl rand -hex 32` (do not paste it into chat).
2. Vercel → drmanagement → Settings → Environment Variables → `EDGE_DEVICE_SECRET` → edit, then redeploy production.
3. On the VM put the same value in `.env` as `DEVICE_SECRET`, then `docker compose -f docker-compose.edge.yml up -d`.
4. Between steps 2 and 3 the edge buffers locally (uplink 401). It replays automatically once both match.

## Switch a point to a real meter
1. On the site's Commissioning page (Clinical safety → Commissioning) follow the checklist.
2. Probe the device (read-only):
   ```bash
   pnpm edge:probe --driver modbus-tcp --host 10.0.0.21 --port 502 --map apps/edge/maps/lt-panel.yaml
   ```
3. Add the driver and the point lines to `apps/edge/edge.config.yaml`, for example:
   ```yaml
   drivers:
     lt-panels: { type: modbus-tcp, host: 10.0.0.21, port: 502, map: maps/lt-panel.yaml }
   points:
     overrides:
       lt-main.kw: lt-panels
   ```
4. `docker compose -f docker-compose.edge.yml up -d --build`.
5. On Commissioning the point's source changes from `sim` to `lt-panels` with quality `good`.

Record the change on the Commissioning page too (Map), so the database shows what the edge uses.

## Backups and restore
- **Setup:** nightly `pg_dump` at 02:30 IST to `gs://$BACKUP_BUCKET/drm/` (30-day lifecycle). Set it up once with the Cloud Shell commands in docs/vm/SETUP.md "Backups", then on the VM:
  ```bash
  echo "BACKUP_BUCKET=replanner-513407-drm-backups" > .env.backup
  sudo bash scripts/vm/install-ops.sh
  sudo systemctl start drm-backup.service && journalctl -u drm-backup.service --no-pager | tail -3
  ```
- **Restore test** (monthly; touches nothing live): `bash scripts/vm/restore.sh`. It loads the latest dump into `drm_restore` and prints row counts against the live database.
- **Real recovery:**
  1. Stop the edge first.
  2. Run `RESTORE_INTO=drm bash scripts/vm/restore.sh gs://…/drm-<stamp>.dump`. It asks you to type RESTORE and keeps the old database as `drm_before_restore_*`.
  3. Start the edge again. It replays whatever it buffered.

## Read the audit log
- **On the site:** Clinical safety → "Approval, override and refusal history" (7 days, CSV export), or the weekly duty report PDF (Reports & M&V).
- **Full history:**
  ```bash
  docker compose -f docker-compose.db.yml exec db psql -U drm_admin -d drm -c "select at, actor, action, entity, entity_id, after from audit_log order by at desc limit 50"
  ```
- **Command record:**
  ```bash
  docker compose -f docker-compose.db.yml exec db psql -U drm_admin -d drm -c "select sent_at, asset_id, action, reason, result, detail from command order by sent_at desc limit 50"
  ```

`audit_log`, `approval`, `command`, `dr_event_log`, `interlock_event` and `notification` refuse UPDATE and DELETE (invariant 7).

## Uptime check
A Cloud Monitoring uptime check polls `https://globe.joulewise.tech/api/health` every 5 minutes and emails when it fails (setup in docs/vm/SETUP.md "Uptime check"). Edge freshness shows on the site: "Edge offline" in the top bar after 60 seconds without a batch.

## When something is wrong
| Symptom | Check | Fix |
|---|---|---|
| Top bar "Edge offline" | edge logs | restart the edge; if the logs show `uplink failed 401`, the device secret does not match (rotate it) |
| An interlock shows "stale" | Commissioning, that point's age | the device or BMS feed dropped; the edge blocks commands until it is fresh again |
| Reports stuck on "Queued for the edge" | `docker compose -f docker-compose.edge.yml logs pdf` | `docker compose -f docker-compose.edge.yml up -d pdf` |
| A DR event lapsed | it was not armed by 17:00 | expected; propose again the next day |
| A refused command on Clinical safety | the detail column | a clinical-exclusion refusal means someone tried to target a protected or critical load; review the audit log |
