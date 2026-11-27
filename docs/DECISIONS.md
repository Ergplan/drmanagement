# Decisions log

- 2026-11-27: Host the web app and API on Vercel at globe.joulewise.tech; build with Claude Code on GCP VM drmanagement; repo Ergplan/drmanagement. (User.)
- 2026-11-27: Scope = all 12 screens + Street View 3D tour + simulator very close to real hospital operations, built to connect real meters later; three-day window. (User.)
- 2026-11-27: Control loop runs at the edge (VM now, on-site gateway later) so the ceiling and interlocks keep working without the cloud.
- 2026-11-27: TypeScript across cloud and edge so the tariff/block engine is one implementation.
- 2026-11-27: Full product testing in Stage 8; control and domain unit-tested as written.
- 2026-11-27: Stage 0 auth uses demo accounts (one per role) with a shared DEMO_PASSWORD until the database exists in Stage 1.
- 2026-11-27: TypeScript pinned to 5.9 (7.x is the native compiler; Next.js tooling compatibility not verified).
- 2026-11-27: Vercel functions region bom1 (Mumbai), nearest to Lucknow.
- 2026-11-27: Secrets are set by the user in Vercel and on the VM; they never pass through chat.
- 2026-11-27: Database moved from Neon to PostgreSQL 17 on the GCP VM (user). Port 5432 open to the internet for the VM's tag only, TLS required (self-signed certificate for the static IP, verified by the app via PG_CA_CERT), SCRAM passwords, app uses role drm_app. Narrow the firewall if Vercel Static IPs are bought.
