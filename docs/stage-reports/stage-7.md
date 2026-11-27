# Stage 7 report · Ask ergOS, grid signals, real-driver harness

Date: 27 Nov 2026 · Builder: Claude (cloud session)

## Built
- **Ask ergOS** (sidebar box):
  - A versioned prompt (`ask-ergos.v1`) and 10 read-only tools: live, forecast, summer risk, bills and audit, tariff, hot water, safety and control, flexibility, DR events, site facts. Each tool returns the screen that shows its figure, so answers cite it.
  - One model module with typed I/O, two retries on 429/5xx and one `assistant_call` row per call (question, answer, tools, tokens, ms, error); the key comes from env.
  - It has no write tool, so it cannot act (invariant 8). Limit: 30 questions an hour a user.
- **Grid signals:**
  - `packages/grid`: OpenADR 3.0 VEN (OAuth client credentials, programs, events, ISO durations, LOAD_DISPATCH and IMPORT_CAPACITY_LIMIT payloads), a local test VTN, and a DISCOM notice parser that returns nothing rather than guess a window.
  - Signals are stored in `grid_signal` (de-duplicated) and become **proposed** events under programme `discom`, which still need the approval chain.
  - DISCOM inbox on the Dispatch plan screen: paste a notice, enter one by hand, or poll the VTN.
- **Edge housekeeping:** every 5 minutes the edge calls the cloud to poll the VTN and escalate notices nobody has acknowledged within 10 minutes. Acknowledge with the button on Dispatch.
- **Notifications:** Hindi line under every English notice.
- **Real-driver harness:** `pnpm edge:probe --driver modbus-tcp --host … --map …` reads only, prints every mapped point and lists missing ones.
- **Commissioning page** (`/commissioning`, linked from Clinical safety): each point's driver, last source, quality and age, mapping edits (audited), the `edge.config.yaml` override lines to copy, and the 8-step commissioning checklist.

## Checks
| Check | Result |
|---|---|
| grid tests (6): durations; VEN authenticates, polls and maps a two-interval event to one 60 kW signal; bad credentials fail closed; ended events skipped; notice parsing; no window gives null | Pass |
| edge tests (4): probe reads float32 and scaled points from a Modbus simulator; unsupported driver refused; plus the Stage 4 simulation tests | Pass |
| VEN end to end: test VTN event → edge housekeeping → `grid_signal` proposed → `dr_event` (source openadr, 60 kW, status proposed), awaiting the facility manager | Pass |
| `pnpm edge:probe` CLI against a Modbus simulator with the example LT map | Pass (3 points read, 15 ms) |
| Ask ergOS plumbing with a stand-in model: login, tool loop, answer with the screen tag, 10 log rows with the prompt version | Pass |
| Ask ergOS 10 scripted questions graded against API figures (`scripts/ask-eval.mjs`) | **Not run with a real model:** there is no ASSISTANT_API_KEY here. With the stand-in model 4/10 pass, as expected; run the script once the key is set |
| Biome, typecheck, `next build`; earlier suites (domain 27, db 18, control 40, drivers 23) | Pass |

## Not run
The independent review, because there is no codex in this session.
