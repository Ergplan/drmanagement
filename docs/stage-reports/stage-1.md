# Stage 1 report · data model, seed, domain engine

Date: 27 Nov 2026 · Builder: Claude (cloud session)

## Built
- `packages/db`: Drizzle schema (33 tables), migrations `0000_init` (generated) and `0001_rules` (hand-written):
  - `reading_1m` partitioned by month (`ensure_reading_partitions()`, partitions Nov 2025 to Dec 2027 plus default), PK (point_id, ts), ts index.
  - Invariant 7: `refuse_mutation()` triggers block UPDATE, DELETE and TRUNCATE on audit_log, approval, command, dr_event_log, interlock_event, notification.
  - Invariant 1: `refuse_excluded_command()` rejects any command whose asset is protected, critical, meter or unknown.
- Seed (`pnpm --filter @drm/db seed`), idempotent: org, site, MVVNL connection, HV-1 tariff, 3 bills with 12 lines, 12 months billed demand, 10 floors, 10 assets + equipment, 26 street-view nodes, 90 points, 9 interlocks, ceiling state, internal peak-management programme, 4 opportunities, device row, 6 demo users (argon2 of DEMO_PASSWORD).
- `packages/domain`: tariff (billing demand with 75% floor, excess surcharge, bill lines, avoided demand charge, marginal rate), blocks (IST index, start, date, projection, MD), baselines (X-of-Y, day-matching with ±20% same-day adjustment, pre-event), M&V (delivered kW/kWh, performance %, tCO2, nomination right-sizing).
- `apps/web`: login now checks `app_user` (argon2) when DATABASE_URL is set; falls back to demo accounts otherwise. Read APIs: `/api/site`, `/api/assets`, `/api/nodes`, `/api/bills` (with the engine's recomputation beside each bill), `/api/tariff`.
- `reference/site.yaml`: grid emission factor 0.727 tCO2/MWh (CEA v20.0, FY 2023-24); update to v22.0 when confirmed.
- GitHub Actions CI: lint, typecheck, migrate + seed twice, domain and DB tests on Postgres 17, web build.

## Checks
| Check | Result |
|---|---|
| Migrations from empty (local Postgres 17.12) | Pass |
| Seed twice → same counts (10 assets, 26 nodes, 90 points, 12 bill lines, 6 users, 9 interlocks) | Pass |
| Domain tests | 22/22 pass |
| Nov 2026 bill lines within ₹1,000 (energy 18.72 L, demand 2.39 L, duty 1.44 L); Oct and Sep lines | Pass |
| Floor 392.1 → 450 kVA; 642 kVA on 600 contract; avoided charge cases | Pass |
| DB rule tests: exclusion for icu, imaging, medgas, clinicalhvac; append-only triggers on all six tables; TRUNCATE refused; partition routing | 13/13 pass |
| Login against app_user, then /api/site, /api/assets, /api/nodes, /api/bills | 200, data correct |

## Findings
- Oct 2026 bill total (₹23.10 L) is ₹7,000 above energy + demand + FPPAS + duty; another charge is not in the extract (KNOWN-GAPS).
- Sep 2026 recomputes to ₹93.18 L before the ₹59.37 L credit, matching the ₹33.81 L printed.

## Deviations
- Independent review not run (no codex in this session); run `scripts/review.sh 1` on the VM.
- Previews will share the production database until a `drm_preview` database is created on the VM (Stage 8).
