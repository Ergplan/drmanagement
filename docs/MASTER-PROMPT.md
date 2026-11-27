# DR Management · Energy Orchestration Centre · Master build prompt

jouleWise ergOS demand response and demand-ceiling platform for Globe Medicare, Lucknow (200 beds, MVVNL HV-1, 11 kV, 600 kVA sanction, 285 kWp rooftop solar).
Repo `Ergplan/drmanagement` · Live at `https://globe.joulewise.tech` (Vercel) · Edge runtime on GCP VM `drmanagement` (asia-south2-b, project replanner-513407).
Version 1.0 · 27 Nov 2026 · Build window: 3 days · © 2026 jouleWise Advisory Services Pvt. Ltd. All rights reserved.

---

## 1. How to use this prompt

- This file is `docs/MASTER-PROMPT.md`. Sections 2 to 5 are copied verbatim into `CLAUDE.md` and stay in context every session.
- **Builder:** Claude Code on the GCP VM `drmanagement`, inside tmux. **Reviewer:** an OpenAI model via the `codex` CLI on the same VM. **Host:** the web app and API on Vercel; the edge runtime (simulator now, real meter gateway later, plus the local control loop) in Docker on the VM.
- Each stage is one session. The user types one line: `Run Stage N of docs/MASTER-PROMPT.md`. You build, check, review, write `docs/stage-reports/stage-N.md`, deploy, commit, and **STOP**.
- **Parallel track:** Stage 6 (Street View) depends only on Stage 2's data API. From the end of Stage 2 it may run in a second tmux window on its own git worktree (`git worktree add ../drm-street street`), merged after Stage 5. The user decides; the stage prompts say what each track may touch.
- Ask everything you need **once**, at the start of a stage, as a numbered list. Secrets are never pasted into chat: create the slot in `.env` (gitignored) or in Vercel and ask the user to fill it on the VM (`nano .env` in a second tmux window) or in the Vercel dashboard.
- **Design source of truth:** `design/canvas/*.dc.html` (approved Claude Design canvas: markup, copy, numbers, layout for all 12 screens) and `design/screens/*.jpg` (1440 px renders). Match them; reuse their copy word for word. Street View is new and has no canvas; it follows the same tokens and glass style.

### Scope: everything, in three days

1. All 12 dashboard screens live: Overview, Live energy, Demand ceiling, Demand forecast, Load flexibility, DR optimizer, Dispatch plan, HVAC & heat pumps, Solar & backup, Tariffs & cost, Clinical safety, Reports & M&V.
2. **Street View**: a new menu tab. A 3D walk-through of the hospital from inside, stopping at every metering and DR point, with floating live charts and key energy figures on the right.
3. A simulator that behaves like a real 200-bed hospital, calibrated to the MVVNL bills, with 13 months of history backfilled.
4. An edge runtime with a driver interface, so real meters (DLMS/IS 15959 main meter, Modbus TCP panel meters, BACnet BMS, SunSpec inverters, OCPP chargers) replace the simulator by configuration, not code.
5. The capabilities that leading DR platforms offer, adapted to an Indian hospital (section 8.4).

---

## 2. Operating rules

1. Work stage by stage. Never start the next stage's work early. Every stage ends with: the app deployed to Vercel and working at its preview URL (production from Stage 0 onward), the edge stack healthy on the VM, the section 9 checks passing, the review done, a stage report, a commit tagged `stage-N-done`, and a stop.
2. Tag `stage-N-start` before writing code in a stage so the review diff is defined.
3. **Speed is the constraint (three days).** Full product testing happens in Stage 8. Two exceptions, because this software sends commands in a hospital: `packages/control` and `packages/domain` get unit tests with the code, in the stage that writes them, and those tests must pass before every commit.
4. The watcher (`scripts/watch.sh`, using `chokidar-cli`) reruns on save: `biome check`, `tsc -b`, `vitest run packages/control packages/domain`, `drizzle-kit check`. It writes `.watch/status.json`. Read it before every commit; never commit over red; never skip a test to get green.
5. Small commits after each working increment. Push to `main` deploys production; feature work goes on short branches that get Vercel preview URLs.
6. Follow the folder layout in section 5 exactly. New folders go into `docs/ARCHITECTURE.md` first. No `utils/`, `misc/`, `helpers/`, `temp/`, `old/`.
7. TypeScript everywhere (web, API, edge, simulator, control). One shared domain package, so the tariff and block maths run identically in the cloud and at the edge.
8. Rules and site facts live in `reference/*.yaml` and the database. A number on screen comes from the API, never from a literal in a component (design tokens excepted).
9. Secrets by environment variable; `.env.example` committed, `.env` not. Vercel env vars set with `vercel env add`, never committed.
10. **Deferred on purpose:** SSO, multi-tenant onboarding UI, mobile-native apps, OpenADR certification, real meter commissioning (drivers are built and tested against simulators, not wired to site hardware). Listed in `docs/KNOWN-GAPS.md`.
11. **Tie-breakers:** clinical safety beats savings; a clear "no data" beats a guessed number; the edge keeps the hospital safe even when the cloud or the internet is down.
12. Living documents (`docs/ARCHITECTURE.md`, `DECISIONS.md`, `KNOWN-GAPS.md`) change in the same commit as the code.
13. Rebuild edge images whenever dependencies change; check container health and the Vercel deployment status at the start of every session.
14. Token limits: work sequentially with narrow reads (file trees, greps) rather than large parallel fan-outs; on a 429 wait 60 s and resume.
15. 3D assets: procedural geometry built in code, plus CC0 models and textures only (for example Kenney, Quaternius, Poly Haven), each listed with source and licence in `apps/web/public/street/LICENSES.md`. No assets, names or styles copied from commercial games.

### Independent review (every stage)

Before the stage report, run a reviewer from a different model family in a fresh context:

```
git diff stage-N-start..HEAD > /tmp/stage.diff
codex exec -m "$REVIEW_MODEL" "$(cat docs/review/REVIEW-PROMPT.md)" < /tmp/stage.diff
```

It sees only the diff, `CLAUDE.md` and this stage's prompt, and answers the fixed checklist in `docs/review/REVIEW-PROMPT.md` citing file:line. Fix every finding and rerun until it reports no new code defect. Findings a diff cannot settle (by-design behaviour, pending user decisions) go in the report with a one-line rationale and do not block. Record reviewer model and cost in the report.

---

## 3. Invariants

These hold in every stage and override anything else here. If a stage prompt conflicts, the invariant wins and you flag it.

1. **Clinical exclusion.** No command may target an asset whose `dr_class` is `protected` or `critical`, or a `meter`-only node. Enforced at the edge dispatcher, by a Postgres trigger on `command`, and in the DR planner; unit tests prove all three.
2. **One actuator path, at the edge.** Only `packages/control/src/dispatcher.ts` `Dispatcher.send()` (running in `apps/edge`) calls `Driver.actuate()` and writes command results. The cloud never actuates: it writes approved `dr_intent` rows that the edge pulls, re-validates and executes.
3. **Interlocks gate everything.** The dispatcher refuses any command while any interlock is tripped or required telemetry is stale (`reference/control.yaml`). A trip aborts active curtailment and restores every load within 60 seconds, at the edge, without the cloud.
4. **The ceiling holds, locally.** The ceiling loop runs at the edge every 10 s. No planned or automatic action may raise projected 15-minute demand above 570 kVA. Restores are staggered and skipped while projected demand is above the Stage 1 trigger. If the edge loses the cloud, the ceiling and interlocks keep running.
5. **One engine for money and demand.** Billing demand, the IST-aligned 15-minute block, billing floor, excess surcharge, cost, baselines and avoided charges are computed only in `packages/domain`. Web, API and edge import it; nobody re-implements it.
6. **Provenance.** Every reading carries `source` (`sim`, a device id, `manual`, `import`) and `quality` (`good`, `estimated`, `stale`, `bad`). Any view showing `sim` data shows the "Simulated data" badge in the top bar and in Street View.
7. **Append-only record.** `audit_log`, `approval`, `command`, `dr_event_log`, `interlock_event`, `notification` reject UPDATE and DELETE by trigger. Corrections are new rows linked to the old.
8. **Deterministic control.** No language-model call and no cloud dependency inside `packages/control` or `packages/domain`. The Ask ergOS assistant (Stage 7) may read data and explain; it can never create intents, approvals or commands.
9. **Time.** Stored UTC (`timestamptz`), displayed IST. Blocks align to IST midnight, numbered 1 to 96, as MVVNL bills.
10. **Real-meter readiness.** The simulator is just another driver. Nothing outside `packages/drivers/sim` may know it is simulated, except the provenance badge. Switching a point to a real driver is a change in `edge.config.yaml`.

---

## 4. Locked decisions

Not reopened unless the user agrees and `docs/DECISIONS.md` records why.

| Area | Decision | Why |
|---|---|---|
| Repo | `Ergplan/drmanagement`, pnpm workspaces + Turborepo | One repo, shared types between cloud and edge |
| Language | TypeScript (strict), Node 24 LTS | One language for web, API, edge, control; fastest to build in three days |
| Web + API | Next.js (latest stable, App Router) on Vercel, project `drmanagement`, domain `globe.joulewise.tech` | The user's chosen host and URL |
| Database | Neon Postgres via the Vercel Marketplace (region closest to India available), Drizzle ORM + drizzle-kit migrations | Serverless Postgres that Vercel wires up; plain SQL, easy to read |
| Time series | `reading_1m` partitioned by month (90-day raw retention), `block_15m` and `day_1d` rollups written by the edge, kept forever | 1-minute data for ~400 points without a time-series extension |
| Edge runtime | `apps/edge`: Node service in Docker Compose on the VM; contains drivers, simulator, ceiling loop, interlocks, dispatcher, DR executor, local SQLite buffer for offline | Mirrors a real on-site gateway; outbound-only connections |
| Edge ↔ cloud | Edge pushes batches to `POST /api/edge/ingest` every 10 s and pulls `GET /api/edge/intents` every 5 s, HTTPS with a per-device token (HMAC-signed bodies); buffers locally when offline and replays | Works through a hospital firewall: no inbound ports |
| Live UI | Client polling every 5 s (SWR) on `/api/live/*`; Street View polls per visible node | Reliable on Vercel functions; no socket server to run |
| Charts | Strata charts v1.1.1 vendored from `design/canvas/lib/strata-charts.min.js`, one React wrapper, theme `eoc` ported from `design/canvas/lib/eoc.js` | The user's chart library, already themed for this design |
| 3D | React Three Fiber + drei + @react-three/rapier (collisions), postprocessing; lazy-loaded route; KTX2/Draco-compressed glTF; procedural geometry first | Proven web 3D stack; runs in the browser on Vercel |
| Styling | CSS modules ported from `design/canvas/lib/eoc.css`; Manrope via `next/font` | Pixel match to the approved design |
| Auth | Auth.js credentials provider, argon2 hashes, roles: `facility_manager`, `medical_superintendent`, `duty_engineer`, `accounts`, `joulewise_ops`, `viewer` | Approvals need named people; SSO deferred |
| Notifications | Adapter interface: email (Resend), WhatsApp and SMS (provider chosen in Stage 4; console adapter until keys exist), in-app | Multi-channel dispatch notices, as leading DR platforms use |
| Scheduled jobs | Vercel Cron for daily M&V, reports, bill checks; the edge owns anything sub-minute | Cron is too coarse for control |
| Reports | Server-rendered HTML → PDF with Playwright in the edge container, stored in Vercel Blob | Same glass style as the manual |
| Weather | Open-Meteo for live Lucknow weather (edge fetches every 15 min); monthly normals as fallback | Real weather drives a realistic cooling load |
| Reviewer | OpenAI model via `codex exec` | Different model family from the builder |
| Tests | Vitest (unit), Playwright (e2e in Stage 8) | One runner per kind |

---

## 5. Folder layout, watcher, living documents

```
drmanagement/
  CLAUDE.md                       # sections 2–5 of this file, verbatim
  package.json  pnpm-workspace.yaml  turbo.json  biome.json  .env.example
  apps/
    web/                          # Next.js on Vercel: screens, Street View, API routes (/api/*), cron routes
      app/(dashboard)/            # one route per screen
      app/street/                 # Street View (lazy-loaded 3D)
      app/api/                    # live, history, assets, events, approvals, reports, edge/ingest, edge/intents, cron/*
      components/                 # Sidebar, Topbar, GlassTile, KpiTile, Pill, Tag, StrataChart, HotWaterIso, CampusIso, ...
      street/                     # scene, building, nodes, controls, panels (R3F components)
      lib/                        # api client, SWR hooks, formatters (en-IN, ₹, kVA), auth
      styles/                     # tokens.css, glass.css (from design/canvas/lib/eoc.css)
      public/                     # logos, icons, strata-charts.min.js, street/ (models, textures, LICENSES.md)
    edge/                         # Node service run on the VM in Docker: runner, uplink, buffer, edge.config.yaml
  packages/
    domain/                       # pure: tariff, blocks, baselines (X-of-Y, day-matching, pre-event), M&V, CO2, units
    control/                      # pure-ish: ceiling, interlocks, dispatcher, dr-executor, heat-pump scheduler, forecast
    drivers/                      # Driver interface + sim/, modbus-tcp/, dlms/, bacnet/, sunspec/, ocpp/, mqtt/, csv/
    db/                           # drizzle schema, migrations, seed (loads reference/*.yaml), queries
    contracts/                    # zod schemas for edge<->cloud and API payloads
  reference/                      # site, tariff, bills, assets, control, building, points, operations, profiles
  design/                         # approved canvas + screenshots (read-only)
  docs/
    MASTER-PROMPT.md  ARCHITECTURE.md  DECISIONS.md  KNOWN-GAPS.md  RUNBOOK.md (Stage 8)
    review/REVIEW-PROMPT.md
    stage-reports/
  scripts/                        # watch.sh, review.sh, backfill.ts, deploy-edge.sh, vm/ (setup notes)
  docker-compose.edge.yml         # edge + playwright-pdf on the VM
```

**Watcher.** `scripts/watch.sh` writes `.watch/status.json` (`{"ok": bool, "failed": [...], "at": iso}`) and `.watch/log.txt`. Run it in a tmux pane.

**Living documents.** `ARCHITECTURE.md`: component diagram (text), data model table, the control critical path with real function names, the edge↔cloud contract, API surface, deployment; a "what changed" list per stage. `DECISIONS.md`: dated. `KNOWN-GAPS.md`: what is deferred and until when.

---

## 6. Plan (three days)

| When | Stage | What becomes real | Stop point |
|---|---|---|---|
| Day 1 AM | 0 | VM, repo, Vercel project + Neon + domain, app shell | Shell live at globe.joulewise.tech |
| Day 1 PM | 1 | Data model, seed, domain engine (tariff, blocks, baselines) | Nov 2026 bill reproduced |
| Day 1 PM–night | 2 | Edge runtime, drivers, hospital simulator, uplink, 13-month backfill | Bills reproduced from simulated history |
| Day 2 AM | 3 | Monitoring screens: Overview, Live, Forecast, Solar, Tariffs, HVAC | Six screens live on data |
| Day 2 PM | 4 | Control: ceiling, interlocks, dispatcher, DR optimizer, approvals, Dispatch, Load flexibility, Clinical safety, notifications | Full DR event end to end |
| Day 2 night | 5 | Reports & M&V, settlement, PDFs, Demand ceiling screen polish, bill audit | All 12 screens live |
| Day 2–3 (parallel from end of Stage 2) | 6 | Street View | Walk the hospital, every point live |
| Day 3 AM | 7 | Ask ergOS, notifications polish, grid-signal (OpenADR 3 VEN) stub, real-driver test harness | Assistant answers from data; drivers pass simulator tests |
| Day 3 PM | 8 | Product testing, performance, runbook, handover | Scenario suite green; production signed off |

---

## 7. Stage prompts

### Stage 0 · VM, repo, Vercel, domain, shell

```
Goal: everything wired end to end with an empty app: VM ready, repo scaffolded, Vercel project with Neon, globe.joulewise.tech serving the app shell.

Ask the user once (numbered):
1. Who manages DNS for joulewise.tech (registrar/provider)? You will give them the exact record to add.
2. Vercel team to use (vercel whoami / teams list after `vercel login`).
3. OPENAI_API_KEY and REVIEW_MODEL for the reviewer: fill in .env on the VM.
4. Email provider key (Resend) now or later; WhatsApp/SMS provider preference (later is fine).
Read project, zone and instance from the metadata server; do not ask.

Build:
1. Confirm the VM fix-ups from docs/vm/SETUP.md were done (disk 50 GB, static IP, IAP SSH rules); report anything missing; never change firewall rules you did not create (prefix drm-).
2. Scaffold per section 5: pnpm + turbo + biome + tsconfig refs; CLAUDE.md = sections 2–5 verbatim; living docs; docs/review/REVIEW-PROMPT.md.
3. apps/web: Next.js App Router. Port design/canvas/lib/eoc.css into styles/tokens.css + glass.css; Manrope via next/font; logos and icons into public/.
4. Sidebar and Topbar ported from design/canvas/Sidebar.dc.html and Topbar.dc.html. Menu: the 12 screens + a new "Street view" item (cube/walk icon, placed after Overview), all routes stubbed with an empty-state glass card. Copyright line "© 2026 jouleWise Advisory Services Pvt. Ltd. All rights reserved." Top bar: date, IST time, block 1–96, site pill (200 beds · A-4-5 Nirala Nagar, Lucknow · MVVNL a/c 9567-481-000 · HV-1 · 11 kV · 600 kVA), ceiling pill, "Simulated data" badge slot, Simulate event button.
5. Vercel: `vercel link` to project drmanagement; connect GitHub Ergplan/drmanagement so main deploys production; add Neon from the Marketplace (env vars appear in the project); `vercel env pull` to .env for local dev; add domain globe.joulewise.tech and print the exact DNS record for the user.
6. Login page (Auth.js) with seeded demo users per role (passwords from env).
7. apps/edge skeleton + docker-compose.edge.yml; edge heartbeats to /api/edge/ingest with a device token (create it in the DB in Stage 1; stub accepts a token from env now).
8. scripts/watch.sh; git identity set repo-local.

Done when: https://globe.joulewise.tech (or the Vercel URL while DNS propagates) shows login and the shell matching design/screens/Main.jpg chrome; edge container healthy and its heartbeat visible in Vercel logs; watcher green; review; report; tag. STOP.
```

### Stage 1 · Data model, seed, domain engine

```
Goal: the permanent schema and the money/demand maths. Hardest to change later; take care.

Schema (drizzle; every table has id, site_id where relevant, created_at):
- org, site, connection, tariff (versioned), bill, bill_line, billed_demand_month
- floor, node (street-view stop, from reference/points.yaml), asset (from assets.yaml; dr_class enum flexible|conditional|protected|critical), equipment
- point (id, node_id, asset_id, kind, unit, source_driver, device_ref, required_freshness_s, min, max)
- device (edge gateway: id, token_hash, last_seen, version)
- reading_1m (point_id, ts, value, source, quality) monthly partitions; block_15m (site main meter: kwh, kvah, kvarh, avg_kva, max_kva, solar_kwh; plus per-asset kwh); day_1d
- interlock, interlock_event*, ceiling_state, ceiling_action
- dr_program (utility/DISCOM program or internal peak-management; notice, window, baseline method, payment terms), dr_event, dr_intent (approved plan steps for the edge), dr_event_log*, approval*, command*, nomination (kW committed per event), settlement (baseline, actual, delivered kW/kWh, value ₹, CO2)
- forecast (run, horizon, p10/p50/p90 per block), weather
- notification* (channel, to, template, status), contact (role, name, phone, email, channels)
- report (kind, period, blob_url), opportunity (bill audit, PF, solar soak ...), mv_baseline
- user, role, session, audit_log*
(* append-only: triggers reject UPDATE/DELETE.) Trigger on command rejecting protected/critical/meter targets.

Seed: packages/db/seed.ts loads reference/*.yaml idempotently; demo users; one device token for the VM edge (printed once).

packages/domain (pure, unit-tested now):
- blocks: IST block index 1..96, block kVA from kVAh, MD over period, projected block from elapsed kVAh + current kVA
- tariff: billing demand with 75% floor, demand charge with 100% excess surcharge, kVAh energy, duty, FPPAS line, bill total, avoided demand charge
- baselines: X-of-Y (e.g. 10-of-10 weekday, CAISO-style), day-matching with same-day adjustment (capped ±20%), 5-minute pre-event average; choose per dr_program
- mv: delivered kW per interval = baseline − actual; event performance % vs nomination; avoided kWh, ₹ and tCO2 (CEA grid factor in reference)
Tests: Nov 2026 bill lines within ₹1,000; floor at 392.1 kVA → 450; 642 kVA on 600 contract; IST block edges; each baseline against a hand-worked fixture.

API: GET /api/site, /api/assets, /api/nodes, /api/bills, /api/tariff (typed by packages/contracts).

Done when: migrations from empty work on Neon (and a Neon branch for previews); seed idempotent; domain tests green; append-only and exclusion triggers proven by tests; review; report; tag. STOP.
```

### Stage 2 · Edge runtime, drivers, hospital simulator, backfill

```
Goal: data that looks and behaves like the real hospital, flowing through the path real meters will use.

Driver interface (packages/drivers): read(points, now) -> Reading[]; actuate(target, action, params) -> Result; health(). Implement now: sim (full), csv (import), and protocol drivers with real client libraries but tested only against local simulators: modbus-tcp (modbus-serial + a Modbus slave simulator container), dlms (IS 15959 / DLMS-COSEM read of instantaneous and billing profiles via a gurux-compatible library or a minimal client; test against a fixture), bacnet-ip, sunspec (Modbus), ocpp (1.6J central-system side for 2 chargers), mqtt. edge.config.yaml maps every point to a driver; default all = sim.

Simulator (packages/drivers/sim): event-driven physical model, not a replay.
- Hospital operations from reference/operations.yaml: occupancy, OPD hours, OT cases, imaging scans (MRI cold head always on; CT, cath lab, X-ray bursts), kitchen meals, laundry shifts, staff shifts, visiting hours, holidays.
- Loads per asset from assets.yaml hourly profiles shaped by operations; cooling from live Lucknow weather (Open-Meteo, fallback normals) with building thermal lag; base loads (lighting by daylight and occupancy, lifts, plugs, IT, med gas, blood bank).
- Solar: clear-sky for 26.85 N 80.95 E, 285 kWp, PR 0.78, monthly haze and smog; zero export.
- Hot-water store SOC (2 × 6,000 L, draw by meal and shift times), heat pumps COP by ambient.
- Power quality: PF ~0.94 with APFC steps, THD bursts with imaging, voltage dips, grid outages with DG start and UPS ride-through (outages per operations.yaml).
- Clinical sensors (OT/isolation pressure, ICU temp, RH, hot-water outlet, med gas) with realistic noise; fault injection API.
- Telemetry faults (meter dropouts, BMS lag) at the configured rates.
- Responds to actuation with response times and rebound from assets.yaml.
- Calibration: monthly kVAh within ±3% of bills.yaml for Dec 2025–Nov 2026, billed MD within ±3% of billed_demand_kva_last_12, Nov daily profile shape matching modelled-profiles nov.y (r ≥ 0.95), hot June evening uncontrolled ≈ 642 kVA.
- Clock: real time; SIM_SPEED and SIM_SCENARIO (normal, hot_june_evening, interlock_trip, stale_meter, outage) for tests; seeded RNG.

Edge runtime (apps/edge): poll drivers (main meter 5 s, others 60 s), validate, write to local SQLite buffer, uplink batches every 10 s, compute block_15m/day_1d locally (packages/domain) and send them; replay buffer after outages; heartbeat with version and health.
Backfill: scripts/backfill.ts runs the simulator fast from 2025-12-01 to now (1-min for the last 90 days, 15-min blocks before that) and loads Neon in bulk.
API: /api/edge/ingest (token + HMAC, idempotent by batch id), /api/live/main (latest snapshot), /api/day?date=, /api/points/:id/series?from&to&step.

Done when: calibration table in the report meets every tolerance; live data on Neon with < 20 s lag; killing the network for 5 min and restoring loses no data; protocol drivers pass against their simulators; review; report; tag. STOP.
```

### Stage 3 · Monitoring screens

```
Goal: six screens live on data, matching their canvas files and renders: Overview (Main), Live energy (Live), Demand forecast (Forecast), Solar & backup (Solar), Tariffs & cost (Tariff), HVAC & heat pumps (Thermal).

- StrataChart wrapper + TypeScript port of the builders in design/canvas/lib/eoc.js, fed by API data.
- Port HotWaterIso to a React SVG component with props (heat pump state, solar kW, store SOC).
- Forecast (packages/control/forecast): similar-day + temperature + occupancy model, P10/P50/P90 for 48 h, run every 15 min at the edge, stored in forecast; "what drives tomorrow" from the model's terms.
- Tariffs: bills table, billed-demand chart, October dispute card (evidence computed from data), PF retune opportunity.
- Every screen: loading, stale and "no data" states in the glass style; Simulated data badge when relevant.

Done when: side-by-side screenshots (1440 px) with design/screens in the report; grep shows no data literals in components; each number traced to an API field (table in report); review; report; tag. STOP.
```

### Stage 4 · Control, DR, approvals, dispatch

```
Goal: the safety-critical core plus the DR workflow, end to end. Unit tests with the code.

Edge (packages/control, run by apps/edge):
- interlocks.ts: evaluate every 10 s from readings and freshness; interlock_event on change.
- ceiling.ts: projected block kVA; stages 520/545/565 from control.yaml; shed/restore intents; staggered restore; Stage 3 pages the duty engineer.
- dispatcher.ts: the only actuator path (invariant 2); checks exclusion, interlocks, freshness, conflicts; logs command; abortAndRestoreAll().
- heatpump-scheduler.ts: solar soak 10:00–15:00 at 100% when needed, locked off 17:30–22:00, top-up below 60% SOC, weekly 70 °C cycle.
- dr-executor.ts: pulls dr_intent, re-validates, runs steps at their times, logs dr_event_log, aborts on trip or duty-engineer abort, restores one load per 10 min.
- watchdog: loop stall > 60 s → restore all + alert.

Cloud:
- DR programs: internal peak management (default) + DISCOM programs configurable (notice period, window, baseline method, payment, penalty). Manual event entry and the grid-signal inbox (Stage 7 adds OpenADR).
- Optimizer: target kW, start, duration → per-asset plan from live flexibility, energy shifted, peak after, avoided charge, nomination recommendation (right-sized from past performance), margin note.
- Approvals: ergOS proposes → facility_manager approves → medical_superintendent signs if any HVAC step → duty_engineer arms by 17:00 else lapse. Append-only.
- Event-day experience (from leading platforms): countdown, live performance vs baseline and target with a colour-coded shortfall indicator, per-asset contribution, "talks in ₹" (value so far), automatic restore, post-event performance summary within 15 minutes.
- Notifications: day-ahead notice, 1-hour reminder, start, shortfall alert, end, summary; to contacts by role over email/WhatsApp/SMS/in-app via adapters (console adapter until keys exist).
- Screens: DR optimizer (Optimizer), Dispatch plan (Dispatch, campus isometric with live asset states, timeline, command sequence with live status, abort), Load flexibility (Flexibility registry + drill-down, live kW available), Clinical safety (Safety: interlocks live, audit trail), Demand ceiling (Guard) with live engine.

Tests (unit now): stage boundaries 519.9/520/545/565; restore stagger; exclusion at dispatcher, planner and DB; trip → restore ≤ 60 s; stale meter blocks; lapse at 17:00; abort; watchdog; edge keeps ceiling while uplink is down.
Scenario: hot_june_evening → max block ≤ 570 kVA (≈ 555); normal day with a 60 kW event 17:30–20:00 → event peak ≈ 406 kVA vs ≈ 470 forecast; all approvals recorded; everything restored.

Done when: both scenarios pass through the UI on production; review; report; tag. STOP.
```

### Stage 5 · Reports, M&V, settlement, bill audit

```
Goal: prove the value, the way leading DR platforms do, and finish the 12 screens.

- Reports & M&V screen (Reports): site energy KPIs vs Indian benchmarks, value found so far, M&V method, report list.
- Settlement per event: baseline per program method, delivered kW and kWh, performance % vs nomination, ₹ value (avoided demand charge, energy, programme payment), avoided tCO2; event performance report PDF.
- Monthly report PDF (energy, demand vs ceiling, events, savings, interlock history), weekly duty report, bill audit report (compare MVVNL bill vs measured kVAh/MD; flags like the October 2026 bill).
- PDFs rendered by the edge's Playwright container from server HTML in the manual's glass style, stored in Vercel Blob; Vercel Cron triggers daily/monthly jobs.
- Opportunity tracker: October dispute, PF retune to 0.99, solar soak, evening DR, ceiling; status workflow.
- CSV/Excel export on every table and chart.

Done when: an event settlement and a monthly report generate and download from production; all 12 screens live; review; report; tag. STOP.
```

### Stage 6 · Street View (3D tour)

```
Goal: a new menu tab "Street view": walk the hospital from inside and stop at every metering and DR point, with floating live charts and key figures. Works on a laptop browser at 60 fps and on a phone at 30 fps.
Track: may run in parallel from the end of Stage 2 on worktree branch `street`; touches only apps/web/app/street, apps/web/street, apps/web/public/street, and read-only API calls. Merge after Stage 5.

Scene (procedural first, from reference/building.yaml and points.yaml):
- The building: front facade from the website photos (blue glass curtain wall, grey louvred canopy "Globe Healthcare" with the pink flower mark, grey corner tower), floors B1, G, F1–F5, roof, HT yard, forecourt and parking. Interiors schematic but readable: corridors, rooms with labels, equipment as recognisable low-poly models (chillers, pumps, panels, AHUs, MRI/CT gantries, OT lights, ICU beds, laundry machines, kitchen ranges, solar arrays, heat pumps, tanks, cooling towers, EV chargers, transformers, meter cabinet).
- Lighting: bright day mode matching the dashboard (soft sky, light floors, glass); a night toggle.
- Energy made visible: animated flow lines along cable trays and pipes (thickness and speed by kW); colour by state: solar amber, grid blue, heat pump green, curtailed amber pulse, protected lilac shield, critical red lock.

Navigation (three modes, switchable):
1. Tour (Street-View style): stops at each node; arrows/chevrons on the floor to the next stops; click or swipe to glide; a guided route "Follow the power" from HT meter → LT panel → chillers → … → roof solar → heat pumps.
2. Walk (game style, third-person): WASD/arrow keys + mouse look, or a virtual joystick on touch; a simple capsule avatar; Rapier collisions; lifts and stairs as teleports between floors.
3. Dollhouse: isometric cutaway of the whole building, floor slicer, click a node to fly in.
Plus: mini-map with floor selector and node list; search ("chiller"); deep links /street?node=chillers.

Right-side floating panel (glass, follows the selected node):
- Title, floor, DR class tag, "what it does in DR" one line (from assets.yaml).
- Key figures live: kW now, kWh today, share of site, state, set point, flexible kW now, interlock state; for meters: kVA, PF, MD this month vs 570/600.
- Strata charts: last 24 h of the node's main point, today's plan overlay during events; a sparkline per extra point.
- During a DR event: countdown, this asset's target vs actual.
- Bottom strip always visible: site kVA vs ceiling, solar kW, hot-water SOC, cost today, Simulated data badge.

Performance and access: lazy route; instancing; baked AO; Draco/KTX2; LOD; adaptive DPR; a "Lite" toggle; keyboard reachable panel; reduced-motion respects prefers-reduced-motion; 2D fallback list if WebGL2 is missing.
Assets: procedural + CC0 only, LICENSES.md (rule 15).

Done when: every node in points.yaml is reachable in all three modes; panel figures match the dashboard APIs; 60 fps on the VM's headless benchmark scene at 1440×900 (record frame times) and a phone profile in Chrome devtools ≥ 30 fps; short screen recording in the report; review; report; tag. STOP.
```

### Stage 7 · Ask ergOS, grid signals, real-driver harness

```
Goal: the remaining platform features.
- Ask ergOS (sidebar box): answers questions about the site from data (read-only tools over the API), cites the screen/figure, never acts (invariant 8). Model via one module with typed I/O, versioned prompt file, retries, a log row per call; key from env.
- Grid signals: OpenADR 3.0 VEN client (REST, polls a VTN for events and prices) behind a feature flag, with a local test VTN; DISCOM event inbox (manual entry + email-to-event parser stub); events from either create a proposed dr_event that still needs the approval chain.
- Real-driver harness: `pnpm edge:probe --driver modbus-tcp --host ... --map ...` reads a device and prints mapped points; point-mapping UI (admin) to switch a point from sim to a device; commissioning checklist page.
- Notifications polish: templates in English and Hindi; escalation if no acknowledgement in 10 min.

Done when: assistant answers 10 scripted questions correctly from data; VEN receives an event from the test VTN and it appears for approval; probe works against the simulators; review; report; tag. STOP.
```

### Stage 8 · Product testing and handover

```
Goal: prove it and hand it over.
- Scenario suite (vitest + edge at high SIM_SPEED): normal day; hot June evening; interlock trip mid-event; stale meter 2 min; CT + cath lab burst during Stage 2; grid outage with DG; uplink down 30 min during an event; event lapse; duty-engineer abort; edge restart mid-event.
- Playwright e2e on production: login per role, approve flow, abort, report download, Street View smoke (load, move to 3 nodes, panel values present).
- API tests for every endpoint; contract tests edge↔cloud.
- Performance: day chart < 1.5 s with 90 days of 1-min data; 20 concurrent viewers; Street View load < 6 s on a 4G profile.
- Ops: edge as a systemd-managed compose stack that restarts on boot; Neon point-in-time restore documented; nightly logical backup to GCS; uptime check on /api/health; RUNBOOK.md (start/stop edge, rotate device token, switch a point to a real meter, put the site in manual mode, restore, read the audit log).

Done when: the suite is green twice; e2e green on production; VM reboot → edge back and uplinking < 2 min; review; final report with cost per stage; tag v1.0.0. STOP.
```

---

## 8. Reference

### 8.1 Data in `reference/`

| File | Holds |
|---|---|
| site.yaml | Site, connection, solar, thermal plant, programme terms |
| tariff.yaml | HV-1 rates and billing rules |
| bills.yaml | Bills on file and 12 months of billed demand |
| assets.yaml | Flexibility Registry: 10 assets, classes, limits, interlocks, hourly profiles |
| control.yaml | Ceiling ladder, interlocks, DR rules, heat pump schedule |
| building.yaml | Modelled floors and uses for Street View (to confirm on survey) |
| points.yaml | 26 metering and DR points: floor, position, class, data points, future driver |
| operations.yaml | Hospital operations calendar driving the simulator |
| modelled-profiles.json | Calibrated 15-minute profiles from the design (see reference/README.md) |

Facts to respect: billed PF 0.94; the 450 kVA floor binds in winter; the 600 kW flexibility target equals the whole connection (a programme target, not a single-event capability); the October 2026 bill is disputed; the public brand is "Globe Healthcare" at A-4-5 Nirala Nagar while the agreement and bills say Globe Medicare (A-3): show "Globe Medicare" as the contracting party.

### 8.2 Edge ↔ cloud contract (packages/contracts)

- `IngestBatch { batchId, deviceId, sentAt, readings[], blocks[], days[], events[] (interlock, command, ceiling, dr_log), health }`, HMAC-SHA256 over the body with the device secret; idempotent by batchId.
- `IntentPull { since } → DrIntent[] { intentId, eventId, steps[{at, assetId, action, params}], approvals[], validUntil }`; edge acks with `IntentAck { intentId, accepted | rejected(reason) }`.
- The cloud may also send `ManualCommandRequest` (duty engineer from the UI); the edge treats it exactly like any other intent: validated, gated, logged.

### 8.3 Real meters later (what Stage 2 prepares)

| Point group | Likely device | Driver |
|---|---|---|
| MVVNL main meter UPP72963 | HT tri-vector meter, optical/RS-485 | dlms (IS 15959 / DLMS-COSEM); or a check meter on Modbus |
| LT main + feeders | Panel energy meters | modbus-tcp via RS-485 gateway |
| Chillers, AHUs, clinical air, ICU temps | BMS | bacnet-ip |
| Solar inverters | String inverters | sunspec over Modbus TCP |
| Heat pumps, tanks, pumps, UPS, DG | Controllers | modbus-tcp |
| EV chargers | OCPP 1.6J | ocpp |
| Laundry, kitchen, lighting | Smart DB relays / DALI | mqtt or modbus |

### 8.4 What leading DR platforms do, and what we take

| Practice | Seen in | In this build |
|---|---|---|
| Real-time interval data during events, with curtailment target visible | Voltus (30-second data, live performance vs target), utility DR portals (baseline and target lines, colour-coded shortfall) | Event-day view (Stage 4) and Street View panel |
| Talk in money: earnings, savings, bill verification, avoided CO2 | Voltus | ₹ everywhere, settlement, bill audit, tCO2 (Stage 5) |
| Right-sized nominations from past performance | Voltus | Nomination recommendation in the optimizer |
| Automated dispatch to the BMS with automatic restore | Voltus–Nantum AI integration | Edge dispatcher + DR executor |
| Site gateway for metering and low-latency dispatch | Enel X Site Server | apps/edge |
| Pre-agreed energy reduction plan per site, multi-channel notifications, post-event performance report | Enel X, utility C&I programmes | Flexibility registry plans, notifications, event report |
| Program-defined baselines (X-of-Y, day-matching, pre-event) | PJM/Enel X, Taiwan Power | packages/domain baselines |
| Forecasting, flexibility at site level, post-dispatch analytics | AutoGrid Flex / Uplight | Forecast, Load flexibility, M&V |
| Continuous flexibility and open signals | OpenADR 3.0 (LBNL CalFlexHub) | VEN client (Stage 7) |
| 24/7 operations visibility | NOC model (Enel X, Voltus) | jouleWise ops role, alerts, audit |

---

## 9. Definition of done

| Stage | Checks before STOP |
|---|---|
| 0 | Login + shell live on Vercel (custom domain or vercel.app while DNS propagates); edge heartbeat visible; watcher green; review run |
| 1 | Migrations from empty on Neon; seed idempotent; Nov 2026 bill lines within ₹1,000; triggers proven; baselines match fixtures |
| 2 | Monthly kVAh and MD within ±3% of bills for 12 months; Nov profile r ≥ 0.95; hot June ≈ 642 kVA uncontrolled; uplink lag < 20 s; 5-min outage loses nothing; protocol drivers pass against simulators |
| 3 | Six screens match renders; no data literals; every figure traced to an API field |
| 4 | hot_june_evening max block ≤ 570 kVA; 60 kW event lands within ±5% of 406 kVA; zero commands to excluded assets; trip → restore ≤ 60 s; ceiling holds with uplink down |
| 5 | Settlement + monthly report PDF download from production; all 12 screens live |
| 6 | All 26 nodes reachable in Tour, Walk and Dollhouse; panel figures equal dashboard APIs; ≥ 60 fps desktop, ≥ 30 fps phone profile; LICENSES.md complete |
| 7 | 10 scripted assistant answers correct; VEN test event reaches approval; probe works on simulators |
| 8 | Scenario suite green twice; e2e green on production; reboot recovery < 2 min; RUNBOOK.md complete |

---

## Appendix A · VM setup (done by the user before Stage 0)

See `docs/vm/SETUP.md`: four paste blocks (Cloud Shell fix-up of the existing VM, connect, bootstrap, start Claude Code).

## Appendix B · DNS for globe.joulewise.tech

In Stage 0 the agent adds the domain to the Vercel project and prints the exact record Vercel asks for (normally a CNAME for `globe`). The user adds it at the joulewise.tech DNS provider. Until it propagates, use the `*.vercel.app` URL.
