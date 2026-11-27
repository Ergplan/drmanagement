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

## What changed
- (per stage)
