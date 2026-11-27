# Architecture

Updated every stage; Stage 0 writes the first full version.

## Components
- apps/web (Vercel): Next.js screens, Street View, API routes, cron routes
- PostgreSQL 17 on the GCP VM (docker-compose.db.yml, TLS, app role drm_app)
- apps/edge (GCP VM drmanagement, Docker): drivers (sim now), ceiling loop, interlocks, dispatcher, DR executor, heat pump scheduler, forecast, uplink + offline buffer, Playwright PDF renderer
- packages: domain (maths), control (safety logic), drivers, db, contracts

## Control critical path (runs at the edge, every tick, no cloud needed)
`apps/edge/src/index.ts tick()`:
1. `DriverSet.read(now)` → `Collector.tick()` (1-minute rows, IST block, `live().projectedKva` via `@drm/domain projectedBlockKva`)
2. `EdgeControl.step(now, readings, projectedKva)` (`apps/edge/src/control.ts`):
   - `evaluateInterlocks(specs from control.yaml, latest, now, engineerArmed)`; state changes emit `interlock` events
   - gate unhealthy → `DrExecutor.step(…, false)` aborts each event, `Dispatcher.abortAndRestoreAll()` (force restore), `Ceiling.reset()`
   - `Ceiling.step(now, projectedKva, healthy)`: stage up on triggers, LIFO restore one load per `restore_step_minutes`, only below Stage 1
   - `heatPumpMode(policy, istMinute, soc)` → `Dispatcher.send(reason 'schedule')` on a mode change
   - `DrExecutor.step()` for each pulled intent: `validateIntent` (approvals, arm-by, clinical exclusion) → precondition → event → staggered restore → recovery
3. `Dispatcher.send()` is the only caller of `Driver.actuate()`: clinical exclusion (`Dispatcher.allowed`), interlock gate, ceiling priority (nothing else changes an asset the ceiling holds), headroom (no restore/run while projected ≥ Stage 1, except a forced abort), then records a `command` event.
4. Events and the snapshot (`live.control`) go to the outbox and up with the next batch.

A control-step exception restores every load and keeps the loop running.

## DR workflow (cloud plans and records; edge executes)
`/api/optimizer` → `planFor()` (apps/web/lib/planning.ts) → `@drm/control plan()` (excludes protected/critical/meter, flexible before conditional, skips loads whose longest hold is shorter than the window) → `POST /api/events` → `proposeEvent()` (refuses excluded assets again) → `POST /api/events/:id` → `decideEvent()` using `@drm/control decide()` (facility manager approves → medical superintendent signs if HVAC → duty engineer arms by 17:00 IST, else lapsed) → on arm a `dr_intent` row (EdgeIntent JSON) → edge `GET /api/edge/intents` → `EdgeControl.accept()` → acks via `POST /api/edge/intents/ack` → `recordAcks()`; `dr_log` events from the edge move the event to running / completed / aborted. Notifications: `notifyRoles()` writes in-app rows and sends email (Resend) or console.

## Edge <-> cloud
Outbound only from the edge: POST /api/edge/ingest every 10 s, GET /api/edge/intents every 5 s (signature over `${ts}.` with an empty body), POST /api/edge/intents/ack when there are acks. HMAC per device. When the cloud is unreachable the edge keeps its pulled intents, the ceiling, interlocks and heat-pump schedule running and buffers events.

## Deployment
- Vercel team Aayuda Energy, project drmanagement, root apps/web, functions bom1, domain globe.joulewise.tech (Vercel DNS).
- Edge: docker-compose.edge.yml on GCP VM drmanagement.

## API surface
- GET /api/health
- GET /api/site, /api/assets, /api/nodes, /api/bills, /api/tariff (signed-in users)
- GET /api/live/main (edge snapshot, ceiling state, today's blocks), /api/day?date=, /api/points/:id/series?from&to
- GET /api/overview, /api/live/points, /api/forecast, /api/solar
- GET /api/control (edge control state + 7-day commands, ceiling actions, interlock events, audit), /api/flexibility, /api/optimizer?date&start&end&target, /api/events, /api/me
- POST /api/events (facility manager, jouleWise ops), POST /api/events/:id {decision: approve|sign|arm|reject|abort}
- GET /api/edge/intents, POST /api/edge/intents/ack (HMAC)
- POST /api/edge/ingest (HMAC: x-drm-device, x-drm-timestamp, x-drm-signature over `${ts}.${body}`)

## Data model (Stage 1)
| Group | Tables |
|---|---|
| Site | org, site, connection, tariff (versioned), bill, bill_line, billed_demand_month |
| Building | floor, node (street-view stop), asset (dr_class), equipment, point, device |
| Time series | reading_1m (monthly partitions), block_15m, day_1d, weather, forecast |
| Control | interlock, interlock_event*, ceiling_state, ceiling_action, command* |
| DR | dr_program, dr_event, dr_intent, dr_event_log*, approval*, nomination, settlement |
| People and output | app_user, contact, notification*, report, opportunity, audit_log* |
(* append-only by trigger; command also has the clinical-exclusion trigger.)

## What changed
- Stage 0: monorepo scaffold; web shell (Sidebar, Topbar, 13 routes, login); domain blocks; contracts; edge heartbeat.
- Stage 1: schema + rules migration, seed, domain engine (tariff, blocks, baselines, M&V), DB login, read APIs, CI.
- Stage 2: drivers package (sim calibrated to bills, Modbus TCP, CSV), edge runtime (registry, collector, SQLite outbox, signed uplink, backfill), batch persistence, live/day/series APIs.
- Stage 3: monitoring screens (Overview, Live energy, Demand forecast, Solar & backup, Tariffs & cost, HVAC & heat pumps), StrataChart wrapper, live top-bar status, packages/control forecast, bill audit; new folder apps/web/components/screens (one component per screen).
- Stage 4: edge control in packages/control (interlocks, dispatcher, ceiling, heat-pump scheduler, DR executor, planner, approval workflow) wired into apps/edge/src/control.ts; intents and acks routes; DR events data layer (packages/db/src/dr.ts); notifications adapter; Demand ceiling, Load flexibility, DR optimizer, Dispatch plan and Clinical safety screens. Interlock limits, the ladder's commands, heat-pump windows and holidays now come from reference YAML via site.facts.
