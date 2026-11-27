# Architecture

Updated every stage; Stage 0 writes the first full version.

## Components
- apps/web (Vercel): Next.js screens, Street View, API routes, cron routes
- Neon Postgres (Vercel Marketplace)
- apps/edge (GCP VM drmanagement, Docker): drivers (sim now), ceiling loop, interlocks, dispatcher, DR executor, heat pump scheduler, forecast, uplink + offline buffer, Playwright PDF renderer
- packages: domain (maths), control (safety logic), drivers, db, contracts

## Control critical path (runs at the edge)
driver.read -> interlocks.evaluate -> ceiling.step (intents) / dr-executor (approved dr_intent) -> Dispatcher.send() -> driver.actuate -> command log -> uplink

## Edge <-> cloud
Outbound only from the edge: POST /api/edge/ingest every 10 s, GET /api/edge/intents every 5 s. HMAC per device.

## Deployment
- Vercel team Aayuda Energy, project drmanagement, root apps/web, functions bom1, domain globe.joulewise.tech (Vercel DNS).
- Edge: docker-compose.edge.yml on GCP VM drmanagement.

## API surface
- GET /api/health
- GET /api/site, /api/assets, /api/nodes, /api/bills, /api/tariff (signed-in users)
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
