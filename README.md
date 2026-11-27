# DR Management · Energy Orchestration Centre · Globe Medicare

jouleWise ergOS demand response and demand-ceiling platform for Globe Medicare, Lucknow. Web app on Vercel at **https://globe.joulewise.tech**; edge runtime (simulator now, real meter gateway later) on GCP VM `drmanagement`. Built with Claude Code from `docs/MASTER-PROMPT.md` in nine stages over three days.

© 2026 jouleWise Advisory Services Pvt. Ltd. All rights reserved. Confidential.

| Start here | |
|---|---|
| `docs/vm/SETUP.md` | Four paste blocks: fix up the VM, connect, bootstrap, start Claude Code |
| `docs/MASTER-PROMPT.md` | The build: rules, invariants, stack, stages 0–8, definition of done, DR industry practices |
| `CLAUDE.md` | Always-on part of the prompt |
| `reference/` | Site, tariff, bills, assets, control rules, building, 26 metering/DR points, hospital operations, profiles |
| `design/` | Approved canvas (12 screens) and renders |

Then, on the VM in tmux: `cd /work/drmanagement && claude`, `/login`, and `Run Stage 0 of docs/MASTER-PROMPT.md`.
