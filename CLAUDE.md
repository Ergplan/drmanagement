# CLAUDE.md · DR Management / Energy Orchestration Centre (Globe Medicare)

Always-on rules, copied verbatim from sections 2–5 of docs/MASTER-PROMPT.md; if they differ, MASTER-PROMPT.md wins and this file is updated.

Stages: `Run Stage N of docs/MASTER-PROMPT.md`. Reference data in `reference/`, approved design in `design/`, VM notes in `docs/vm/SETUP.md`.

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
| Database | PostgreSQL 17 in Docker on the GCP VM (`docker-compose.db.yml`), TLS-only with a verified certificate, non-superuser app role; Vercel connects with `DATABASE_URL` + `PG_CA_CERT`; Drizzle ORM + drizzle-kit migrations | User's choice (27 Nov): no storage cap, data stays in the jouleWise GCP project |
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
