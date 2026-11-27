# Stage 3 report · monitoring screens

Date: 27 Nov 2026 · Builder: Claude (cloud session)

## Built
- **Shared UI**: StrataChart wrapper (vendored Strata v1.1.1, `eoc` day theme from design/canvas/lib/eoc.js); chart builders (day supply, 48 h forecast, solar daily, billed MD, point series); glass KPI tiles, cards, DR-class tags, meters; 5-second polling hook; en-IN formatters (₹ lakh/crore, kVA, IST).
- **Top bar**: live ceiling pill (under ceiling / Stage n / edge offline) and the **Simulated data** badge (invariant 6), polled from `/api/live/main`.
- **Overview**:
  - Live demand, grid vs sanction, month peak and billing demand, hot-water store, cost today and solar tiles.
  - Demand ceiling card (projected block kVA on the floor / Stage 1 / ceiling / sanction scale).
  - Solar soak card, today's DR card with the forecast peak and chance of passing 570 kVA.
  - 24-hour supply chart (yesterday and today) with today's forecast; daily totals; data-source line.
- **Live energy**: meter strip (kVA, kW, PF with APFC steps, kvar, kV and Hz with THD, solar), today's supply chart, where the energy goes (today's kWh by end use with DR class), feeders now (1-minute kW, excluded loads marked).
- **Demand forecast**: `packages/control/forecast` (like-day average, ±10% same-day adjustment, P10/P90 from like-day spread, exceedance probability) with 6 unit tests. Shows peak tiles for three days, chance of passing 570 and 520 kVA, a 48-hour band chart and a "what drives the forecast" table.
- **Solar & backup**: solar now, 30-day energy and kWh/kWp, 100% used on site, CO₂ avoided (CEA factor from site facts), daily yield chart, UPS/DG/grid readiness.
- **Tariffs & cost**:
  - Rate tiles and the bills-on-file table with the engine's recomputation of each bill.
  - October dispute card, computed with the new domain function `billAuditExcess` (tested: ₹13.12 L, 2.8× normal).
  - Billed demand chart.
- **HVAC & heat pumps**: store, heat pumps, chiller plant and chilled-water tiles; 24-hour heat pump and store-charge charts; non-clinical air handling; clinical air (read-only).
- **New APIs**: `/api/overview`, `/api/live/points` (latest value of every point), `/api/forecast`, `/api/solar`; `/api/bills` gains days and audit.

## Checks
| Check | Result |
|---|---|
| Domain 23/23, control 6/6, drivers 20+ tests, DB rules 13/13 | Pass |
| Typecheck, Biome, `next build` | Pass |
| Six screens render on live local data (screenshots reviewed at 1440 px) | Pass |
| Numbers on screen come from the API (rates, sanction, floor, ladder, bills); no data literals in components | Pass, apart from the 570 kVA ceiling label in the top bar pill and the ladder constant in `lib/site.ts` (moves to the database with Stage 4) |

## Deviations
- **Layout:** the screens follow the approved design's layout, glass styles and copy, but are rebuilt as React components rather than generated from the canvas files. Side-by-side pixel comparison is left for the Stage 8 review.
- **Forecast inputs:** the forecast does not yet use weather or HIS inputs; the screen says so.
- **HotWaterIso:** the isometric solar-soak drawing is not ported yet (Overview uses a store-charge bar); it moves with Street View in Stage 6.
- **Not run:** the independent review (no codex in this session).
