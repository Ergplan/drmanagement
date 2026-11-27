# Reference data

Seed data and rules for the Energy Orchestration Centre. Stage 1 loads these into the database; nothing else reads them at runtime except `control.yaml` (via the control module).

| File | What it holds | Source |
|---|---|---|
| site.yaml | Site, connection, solar, thermal plant, programme terms | Bills, agreement, website, user |
| tariff.yaml | HV-1 rates and billing rules | MVVNL bills, UPERC order |
| bills.yaml | Bills on file and 12 months of billed demand | MVVNL bills |
| assets.yaml | Flexibility Registry: 10 assets with class, limits, interlocks, hourly profile | Modelled, confirm on survey |
| control.yaml | Ceiling ladder, interlocks, DR event rules, heat pump schedule | Design + agreement |
| modelled-profiles.json | Calibrated 15-min profiles the simulator reproduces | Built from bills + benchmarks |

## modelled-profiles.json keys
- `nov.y.s`, `nov.y.g`: yesterday (26 Nov) solar and grid, **kWh per 15-min block**, 96 values (multiply by 4 for kW).
- `nov.t.s`, `nov.t.g`: today so far (58 blocks). `nov.f`: today's grid forecast. `nov.p`: today's plan with the DR event.
- `hp.soc`: hot-water store state of charge %, 192 blocks (2 days). `hp.bau`: heat pump kWh/block without solar soak.
- `guard.g`: hot June design day grid kVA without control (96). `guard.h`: kVA held back by the ceiling.
- `fc.a`: actual kVA so far today (58 blocks); `fc.p10/p50/p90`: forecast in kVA, 288 blocks of 15 min = 27, 28 and 29 Nov.
- `solar`: daily solar kWh for the last 31 days. `md.m`: billed demand kVA, last 12 bills.
