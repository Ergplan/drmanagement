# Stage 0 report · VM, repo, Vercel, domain, shell

Date: 27 Nov 2026 · Builder: Claude (cloud session) · Commit: see `git log`

## Built
- pnpm + Turborepo monorepo per section 5: `apps/web`, `apps/edge`, `packages/contracts`, `packages/domain`; Biome; strict TypeScript 5.9.
- `apps/web` (Next.js 16.4.6, React 19.3):
  - Sidebar and Topbar ported from `design/canvas/Sidebar.dc.html` and `Topbar.dc.html`; styles from `design/canvas/lib/eoc.css`; Manrope via `next/font`.
  - Menu: the 12 screens plus **Street view** (marked New) after Overview; all 13 routes live with a glass placeholder naming the stage that brings each screen to life.
  - Top bar: live IST date, time and block (1–96, from `@drm/domain`), site pill, ceiling pill ("waiting for edge data" until Stage 2), Simulated data badge slot, Simulate event button.
  - Login (Auth.js v5 credentials). Stage 0 demo accounts, all using `DEMO_PASSWORD`: fm@globe.demo, ms@globe.demo, de@globe.demo, accounts@globe.demo, ops@joulewise.demo, viewer@globe.demo. Stage 1 moves users to the database with argon2.
  - `GET /api/health`; `POST /api/edge/ingest` with HMAC-SHA256 signature, device id and ±300 s timestamp check (401 on any mismatch).
- `packages/domain`: IST block index and block start, with 5 unit tests (all pass).
- `packages/contracts`: zod schemas for the signed edge uplink (`IngestBatch`, `EdgeHealth`, `IngestAck`).
- `apps/edge`: Node service that signs and sends a heartbeat every 30 s; Dockerfile and `docker-compose.edge.yml` for the VM.
- `scripts/watch.sh` (status file), `scripts/review.sh` (codex reviewer).

## Checks
| Check | Result |
|---|---|
| `pnpm install`, `biome check`, `tsc` all packages | Pass |
| Domain unit tests | 5/5 pass |
| `next build` | Pass, 18 routes |
| Local run: login → shell renders like design/screens/Main.jpg chrome | Pass (screenshot reviewed) |
| Edge heartbeat signed → 200 and logged; bad signature → 401 | Pass |

## Vercel
- Team Aayuda Energy; project `drmanagement` (prj_ytAwf0pepdkLViO31eCOKd3x79F7), root `apps/web`, functions in bom1 (Mumbai).
- Domain `globe.joulewise.tech` added and verified; joulewise.tech is on Vercel DNS, so no DNS record is needed.
- Env set: `EDGE_DEVICE_ID`, `ENABLE_EXPERIMENTAL_COREPACK`.

## Open items for the user (Stage 0 is not tagged done until these are in)
1. **Connect GitHub:** the Vercel GitHub app is not installed on the Ergplan organisation, so the project could not be linked to the repo. Vercel → project drmanagement → Settings → Git → Connect `Ergplan/drmanagement` (install the app for Ergplan when asked). Every push to main then deploys.
2. **Secrets in Vercel** (Settings → Environment Variables, all environments): `AUTH_SECRET` (any long random string), `DEMO_PASSWORD` (the shared demo login password), `EDGE_DEVICE_SECRET` (long random hex; the same value goes into `.env` on the VM).
3. **Neon:** the Neon integration is installed on the team (free plan). Vercel → project → Storage → Connect Database → Neon → create `drmanagement` in the closest region (Singapore if Mumbai is not offered). Needed for Stage 1. The free plan's 1 GB will not hold a year of 1-minute data; plan to move to Launch before Stage 2's backfill, or keep raw data shorter.
4. **Edge on the VM:** after VM setup (docs/vm/SETUP.md), in `/work/drmanagement`: `cp .env.example .env`, fill `CLOUD_URL=https://globe.joulewise.tech`, `DEVICE_ID=edge-globe-lko-01`, `DEVICE_SECRET=` (same as Vercel), then `docker compose -f docker-compose.edge.yml up -d --build`.

## Deviations
- Independent review not run: this session has no OpenAI/codex access. To be run on the VM with `scripts/review.sh 0` once `REVIEW_MODEL` is set.
- Users are in code (demo accounts) rather than the database until Stage 1, because the database does not exist yet.
- Street View lives at `app/street` (outside the dashboard group) as the layout says, with its own auth guard.
