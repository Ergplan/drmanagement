# Stage 2 report · edge runtime, drivers, hospital simulator, uplink, backfill

Date: 27 Nov 2026 · Builder: Claude (cloud session)

## Built
- **packages/drivers**
  - `Driver` contract (read / actuate / health).
  - **Hospital simulator** (`sim/`): seeded and deterministic.
    - Loads follow the Flexibility Registry November profiles, reshaped by Lucknow weather (with 3 h building thermal lag), daylight-driven lighting, OPD days and holidays, imaging scans (CT, MRI, cath lab), meals and staff shifts.
    - Also modelled: a hot-water store with its own state and BMS timer, grid outages, PF with APFC.
    - Actuation acts with response lags, deferred energy and 60-minute rebound.
  - `SimDriver` serves all 90 points, with fault injection and scenarios (normal, hot_june_evening, interlock_trip, stale_meter, outage).
  - **Modbus TCP driver** (16/32-bit and float decoding, both word orders, register writes for actuation) tested against a Modbus server simulator.
  - **CSV import driver.**
- **Calibration** (`pnpm --filter @drm/drivers calibrate` → `reference/calibration.json`):
  - Base load is the November reference.
  - Cooling falls 7%/°C below November temperatures and rises 1%/°C above them; a heat wave adds 6%/°C of anomaly.
  - One shared May–Sep base factor is fitted to the May–Sep bill.
  - An evening-coincidence factor per month is fitted to each month's MD.
  - Targets and their sources are in `reference/calibration-targets.yaml`; months with no bill are marked "assumed" and are not used to fit energy.
- **Contracts**: signed `IngestBatch` now carries a live snapshot, 1-minute readings, IST blocks, IST days and control events (interlock, command, ceiling, DR log).
- **Cloud**: `/api/edge/ingest` persists batches idempotently (`persistBatch`). New `/api/live/main`, `/api/day?date=` and `/api/points/:id/series`.
- **apps/edge**:
  - Driver registry from `edge.config.yaml` (points → driver; switching to a real meter is configuration only).
  - Collector (1-minute averages, IST blocks, IST days and live snapshot via `packages/domain`).
  - SQLite outbox and signed uplink.
  - `backfill` that replays the same driver and collector minute by minute.
  - Dockerfile on Node 24 with the reference data.

## Checks
| Check | Result |
|---|---|
| MD within ±3% for all 12 months (Dec 2025–Nov 2026) | Pass (largest gap Jan, 2.3%) |
| May–Sep energy vs bill (6,207 kVAh/day) | 6,384 (+2.8%) · Pass |
| Nov energy vs bill (6,617 kVAh/day) | 6,579 (−0.6%) · Pass |
| Nov mean-day shape vs design reference | r ≥ 0.95 · Pass |
| Nov solar vs design (973 kWh/day over 31 days) | within 5% · Pass |
| Hot June evening, uncontrolled | 630–655 kVA · Pass |
| Driver tests (all points, actuation and rebound, faults, determinism, Modbus, CSV) | Pass |
| Backfill of 26 days | 14 s; days average 6,581 kVAh, MD 510 kVA, solar 997 kWh |
| Edge → web → Postgres end to end | Live snapshot, 90 readings per minute, blocks; `/api/live/main`, `/api/day`, `/api/points/:id/series` return data |
| Cloud down for 2 minutes | Outbox held 180 readings; replayed fully on reconnect, 0 left |
| Restart mid-block | Unseen minutes estimated at the first observed rate; block marked `estimated` |

## Findings and limits
- **Summer energy:** the bills show summer energy close to November's but a much higher peak. The fit therefore uses a low summer daytime base load and a strong evening factor (about 2.1–2.3). Daily totals and peaks match the bills; the summer daily *shape* should be re-fitted from real meter data.
- **Assumed targets:** Dec–Apr and October energy are assumptions (no bill, or the disputed October bill).
- **Monthly MD after a restart:** the live snapshot's `todayKvah`/`monthMdKva` restart from zero when the edge restarts. Screens compute today's totals from stored blocks; Stage 4 adds an edge resume from the cloud.

## Deviations
- **Drivers not built:** DLMS (IS 15959), BACnet/IP, OCPP and MQTT are deferred to Stage 7's real-driver harness to protect the timeline. Modbus TCP (which also covers SunSpec register maps) and CSV are done. Recorded in KNOWN-GAPS.
- **Not run:** the independent review (no codex in this session).
- **Stage tags:** kept locally because this session cannot push tags.
