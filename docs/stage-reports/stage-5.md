# Stage 5 report · reports, M&V, settlement, bill audit

Date: 27 Nov 2026 · Builder: Claude (cloud session)

## Built
- **Settlement**:
  - `@drm/domain settle()`: delivered kW and kWh, performance, avoided demand charge on the month's peak, programme payment and penalty, tCO2. Shifted energy is worth zero on the flat kVAh tariff.
  - `settleEvent()` builds the programme baseline from the edge's 15-minute blocks:
    - methods: day matching, X of Y or pre-event
    - excludes other event days, non-like days and incomplete days
    - the adjustment window ends before pre-conditioning starts
  - Stored in `settlement`; `/api/events/:id/settlement`.
- **Reports**:
  - Four A4 reports in the glass style: monthly performance, weekly duty, event performance, and the bill audit note for MVVNL (flags the Oct 2026 bill: ₹13.12 L).
  - Printed by the edge with Playwright and its own `pdf` container (docker-compose.edge.yml) from `/print/:id`, opened with a 15-minute token.
  - PDFs are kept in the VM database by default; Vercel Blob is used when REPORTS_IN_BLOB=1.
- **Scheduling**: Vercel Cron at 01:00 IST settles ended events, queues the monthly report on the 1st and the weekly duty report on Mondays.
- **Reports & M&V screen** (the 12th screen):
  - Energy against the CAHO per-bed benchmark (source in site.yaml), emissions at the CEA factor, and the M&V method from the programme row.
  - Events with settlement and a per-event report button; the report list with PDF download.
  - Opportunity tracker with a status workflow (found → to approve → approved → live → verified, or dropped), audited.
- **CSV export**: Reports, Tariff bills, Ceiling actions, Clinical safety history and Dispatch events (Strata charts already export).
- **VM**: `scripts/vm/init-data.sh` runs migrate, seed and a 35-day backfill against the TLS database; SETUP.md is updated.
- **Edge**: restores every commandable load on start (it cannot know what an earlier run left curtailed).

## Checks
| Check | Result |
|---|---|
| domain 27 tests (4 new settlement cases: floor, month already higher, payment and penalty) | Pass |
| DB 18 tests: settlement over synthetic blocks gives a 60.0 kW delivery; the demand-charge saving is (480 − 450 floor) × ₹430; settling before the event ends is refused | Pass |
| control 40, drivers 23, edge 2 | Pass |
| Biome, typecheck, `next build` | Pass |
| Local end to end: facility manager queues monthly, bill audit and weekly reports; the edge renders them in under 10 s (280, 190 and 242 kB); download returns `application/pdf` starting `%PDF-`; pages reviewed as images | Pass |
| Cron route: rejects calls without the secret; with it, settles ended events | Pass |

## Not yet done
- **Production proof:** "Settlement and monthly report from production" needs the VM database, edge and `CRON_SECRET`. These are the user's steps in SETUP.md Step 5. Locally, tonight's 17:30–20:00 test event is running on the live edge and will be settled from its metered blocks.
- **Not run:** the independent review (no codex in this session).
