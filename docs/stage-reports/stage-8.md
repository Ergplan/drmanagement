# Stage 8 report · product testing and handover

Date: 27 Nov 2026 · Builder: Claude (cloud session)

## Built
- **Scenario suite** (`apps/edge/test/scenarios.test.ts`): 10 scenarios on the real simulator, collector and edge control loop at 10 s steps, without the cloud. The harness lives in `test/harness.ts`.
- **Contract tests**: edge output parses as `IngestBatch`; intents and acks round-trip; the HMAC rule matches the cloud.
- **API check** (`scripts/api-check.mjs`):
  - all 22 data GETs refuse without a session, and the signed edge routes refuse without a signature;
  - each GET returns the expected shape when signed in;
  - role rules hold on every write, and bad input is refused.
- **Performance check** (`scripts/perf-check.mjs`): chart endpoints with 90 days × 90 points of 1-minute data (11.7 M rows), plus 20 concurrent viewers.
- **Playwright e2e** (`apps/web/e2e`, `pnpm --filter @drm/web e2e`):
  - each of the 6 roles signs in and sees the Simulated data badge;
  - all 12 screens load with no page errors;
  - the full DR chain: propose (FM) → viewer refused 403 → approve (FM) → sign if HVAC (MS) → arm (DE) → abort (DE), with the event log checked;
  - a bill audit PDF is rendered by the edge and downloaded;
  - Street View smoke: canvas, three stops, panel values, badge.
- **Ops**:
  - `drm-stack.service` starts the database, edge and pdf on boot;
  - nightly `pg_dump` at 02:30 IST to Cloud Storage with a 30-day lifecycle (`backup.sh`, timer);
  - `restore.sh` restores into a scratch database and compares row counts by default, or does a guarded live restore;
  - `install-ops.sh`; uptime check and bucket setup in SETUP.md;
  - **RUNBOOK.md**: health, start/stop, manual mode, device token rotation, switching a point to a real meter, backups and restore, reading the audit log, a symptom table.

## Defects found and fixed by the suite
1. **Ceiling flapping on a hot evening.** Restoring a load at 497 kVA brought the next stage minutes later; one block reached 576 kVA. Restores are now load-aware (projected kVA + the load's expected kW must stay under Stage 1). Hot June evening: **557 kVA** (was 576); with a +30 kVA CT/cath-lab burst: **554 kVA**.
2. **Nuisance OT pressure trips in the simulator.** OT 3 sat 1.5 Pa above the 15 Pa limit with noise, so it tripped every few hours and aborted events. The simulated set points now sit further from the limits (DECISIONS).
3. **Event decisions by non-approver roles** returned 409 from the workflow; they now return 403 before the workflow runs.

## Checks
| Check | Result |
|---|---|
| Unit and scenario suites, run twice: domain 27, db 18, control 40, drivers 23, grid 6, edge 17 (10 scenarios + 3 contract + 2 ceiling simulation + 2 probe) | Green both runs |
| Playwright e2e, local production build against the local database and live edge, run twice | 10/10 both runs |
| API check | All passed |
| Chart query, 24 h of 1-minute data (131 kB) | median 28 ms, worst 66 ms (target < 1.5 s) |
| Chart query, 31 days of 1-minute data (4 MB) | median 507 ms, worst 807 ms (target < 1.5 s) |
| Today's day chart and forecast | 15 ms and 24 ms median |
| 20 concurrent viewers polling the live endpoints every 5 s for 30 s (360 requests) | p50 87 ms, p95 263 ms, 0 errors |
| Street View canvas visible after navigation (local, no throttling) | 1.4 s; the 4G profile is not measured |

## Done-when items not met in this session
These need the user's infrastructure:
- **e2e on production:** the GitHub app is not connected to Vercel and the VM is not set up, so there is no production deployment yet. Run `E2E_BASE=https://globe.joulewise.tech E2E_PASSWORD=… pnpm --filter @drm/web e2e` once it is up.
- **VM reboot test** (edge back in under 2 minutes) and the backup and restore test: steps are in SETUP.md and RUNBOOK.md.
- **Street View frame rate** on a GPU and **load time on a 4G profile.**
- **Ask ergOS 10-question check:** needs ASSISTANT_API_KEY.
- **Independent review:** no codex in this session.
- **Cost per stage:** this build ran on a subscription session; per-stage model cost is not available to the builder.

The release is therefore tagged `v1.0.0-rc1`. Tag `v1.0.0` after the production items above pass.
