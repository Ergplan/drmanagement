# Stage 4 report · edge control, DR workflow, control screens

Date: 27 Nov 2026 · Builder: Claude (cloud session)

## Built
- **packages/control** (pure, no I/O, no model calls):
  - `interlocks` (limits from control.yaml; missing or old readings count as stale, never as healthy)
  - `dispatcher` (the only actuator path):
    - clinical exclusion and the interlock gate
    - ceiling priority, and no load added back while projected demand is at or above Stage 1
    - forced restore on abort
  - `ceiling` (stages from control.yaml, LIFO restore 10 min apart below Stage 1)
  - `heatpump` (solar soak, evening lock-out, thermostat otherwise)
  - `dr-executor`:
    - re-validates approvals, the 17:00 arming deadline and exclusion
    - runs precondition → event → staggered restore → recovery
    - aborts on a trip
  - `planner`: flexible before conditional; skips loads that cannot hold for the whole window; lists what it excluded
  - `workflow`: who may approve, sign, arm, reject or abort, and when an event lapses
- **Edge** (`apps/edge/src/control.ts`): the control loop runs in the same tick as the collector and needs no cloud.
  - Pulls intents every 5 s and acks them; publishes its control state in the live snapshot.
  - A control fault restores every load.
- **Cloud**:
  - `packages/db/src/dr.ts`: propose (refuses excluded assets), decide (row-locked), intents and acks.
  - Ingest moves events to running / completed / aborted; edge refusals aimed at clinical assets go to the audit log.
  - Notifications: in-app rows plus Resend email or a console fallback.
  - Routes: `/api/edge/intents`, `/api/edge/intents/ack`, `/api/optimizer`, `/api/events`, `/api/events/:id`, `/api/control`, `/api/flexibility`, `/api/me`.
- **Screens**:
  - Demand ceiling: projection against the ladder, shed ladder, today chart, 7-day actions.
  - Clinical safety: 9 live interlocks, gate, blockers, restore order, audit and trip history.
  - Load flexibility: registry with drill-down.
  - DR optimizer: window and target, plan, P50/P90 peak, demand charge avoided from the domain engine, "Send for approval".
  - Dispatch plan: one-line summary, approval chain with buttons by role, command sequence, edge phase, event log.
- **Rule 8 clean-up**:
  - The ladder, holidays and DR defaults now come from the database (site.facts, seeded from YAML).
  - The top bar and forecast no longer hard-code 570 or 520.

## Checks
| Check | Result |
|---|---|
| control 40 tests: exclusion of every protected/critical/meter asset for every action, gate, ceiling priority, headroom, failed driver, ladder from YAML, staggered restore, toy hot evening, heat pumps, DR executor phases, trip abort, edge rejection, planner exclusion, approval chain | Pass |
| Edge simulation (real simulator, collector and control at 10 s steps, hot June evening) | Peak 635 kVA uncontrolled → **561 kVA** with the ceiling; OT pressure trip restores everything in one tick |
| DB 16 tests (trigger exclusion, append-only, DR chain, intents and acks, audit of refused clinical commands) | Pass |
| domain 23, drivers 23 | Pass |
| Biome, typecheck (all packages), `next build` | Pass |
| Browser end to end (local Postgres, live edge) | Pass. Facility manager proposes from the optimizer; duty engineer's early arm refused; viewer's approve refused (403); facility manager approves; duty engineer arms; the edge pulls the intent within 5 s and acks it as accepted |

Invariants 1 to 4 are each proven in three places: dispatcher tests, the DB trigger test and the planner test (1); dispatcher-only actuation (2); gate and trip tests (3); ceiling and simulation tests (4).

## Deviations and notes
- November plans reach 48 kW of the 60 kW default target. The chiller and AHU can hold for 2 h and the default window is 2.5 h, so the planner leaves them out and says so (DECISIONS).
- The duty-engineer-armed interlock is an edge setting until paging exists (KNOWN-GAPS).
- Event blockers such as a mass-casualty alert or an OT overrun are shown, not yet wired as inputs (KNOWN-GAPS).
- The independent review was not run: there is no codex in this session.
