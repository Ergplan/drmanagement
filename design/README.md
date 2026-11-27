# Approved design (read-only)

`canvas/` is the Claude Design canvas for the Energy Orchestration Centre. Each `.dc.html` file is one artboard: markup, approved copy and numbers inside `<x-dc>`, view logic in the `Component` class at the bottom. Shared components: `Sidebar`, `Topbar`, `HotWaterIso`. Styles: `canvas/lib/eoc.css` (dashboard), `canvas/lib/manual.css` (manual). Charts: `canvas/lib/eoc.js` (Strata theme `eoc` and chart builders), `canvas/lib/strata-charts.min.js`.

| Screen | Canvas file | Render | Route |
|---|---|---|---|
| Overview | Main.dc.html | screens/Main.jpg | `/` |
| Live energy | Live.dc.html | screens/Live.jpg | `/live` |
| Demand ceiling | Guard.dc.html | screens/Guard.jpg | `/ceiling` |
| DR optimizer | Optimizer.dc.html | screens/Optimizer.jpg | `/optimizer` |
| Dispatch plan | Dispatch.dc.html | screens/Dispatch.jpg | `/dispatch` |
| Demand forecast | Forecast.dc.html | screens/Forecast.jpg | `/forecast` |
| Load flexibility | Flexibility.dc.html | screens/Flexibility.jpg | `/flexibility` |
| HVAC & heat pumps | Thermal.dc.html | screens/Thermal.jpg | `/thermal` |
| Solar & backup | Solar.dc.html | screens/Solar.jpg | `/solar` |
| Tariffs & cost | Tariff.dc.html | screens/Tariff.jpg | `/tariff` |
| Clinical safety | Safety.dc.html | screens/Safety.jpg | `/safety` |
| Reports & M&V | Reports.dc.html | screens/Reports.jpg | `/reports` |
| Street view (new) | none: built from reference/building.yaml and points.yaml in the same glass style | none | `/street` |

Images in the canvas files are referenced as `/_blob/<id>`; the local copies are in `canvas/assets/`:
1a38319755293cfa8eaf5dc1d205e1c2 = joulewise-logo.svg, 51c7f07bc570f970457a1875b68eacd3 = globe-healthcare-logo.png, and icon-<asset>.svg for the Flexibility Registry icons (chiller 98e8ce93…, ahu 1fcc2362…, heatpump 01454f1c…, laundry 81f03651…, pump 4fdf5bc8…, ev 8ee788ae…, clinicalhvac 41ad9df5…, icu 227b6efe…, imaging 3c22f0ae…, medgas 9f8aac67…, sun 4eb3e715…, meter 9801cea1…).

The implementation manual PDF (A4 and mobile) is kept outside the repo. Manual pages (Manual*.dc.html) are included for copy and style reference only.
