# Stage 6 report · Street View

Date: 27 Nov 2026 · Builder: Claude (cloud session)

## Built
- **Route:** the `/street` route sits inside the normal dashboard frame with the left menu. The 3D scene is lazy-loaded (`next/dynamic`, client only); scene data comes from `/api/street`.
- **Scene** (procedural; rule 15, see `public/street/LICENSES.md`):
  - Building from building.yaml: slabs for B1 to the roof, translucent walls, and a blue glass curtain wall with instanced mullions.
  - Grey louvred canopy with "Globe Healthcare" and the pink flower mark, the grey corner tower, forecourt, boundary wall and HT yard.
  - Room zones from each floor's uses, labelled on the current floor.
  - Equipment models for all 26 nodes; solar panels are instanced; heat-pump and cooling-tower fans turn.
- **Energy flows:** animated lines meter → LT panel → loads (grid blue), solar → LT (amber), heat pumps (green). Width and speed follow live kW; curtailed loads turn amber and their ring pulses.
- **Stop pins:** coloured by DR class; protected and critical stops carry a marker shape.
- **Modes**:
  - Tour: glide between stops, drag to look around, floor chevrons to the next stop, Previous/Next, "Follow the power" through all 26 nodes.
  - Walk: Rapier capsule with WASD/arrows, Q/E to turn and an on-screen pad; pick a floor to take the lift; the nearest stop opens automatically.
  - Dollhouse: orbit with a floor slicer; click any pin.
- **Panel and strip:**
  - Live values for each node's points (the same `/api/live/points` the dashboard uses), flexible kW now, state (held by ergOS or normal), related interlocks, DR target during an armed or running event, and the 24-hour Strata chart of the node's main point.
  - Meter stop: month's peak against the ceiling and sanction.
  - Bottom strip: site kVA and projection against the ceiling, solar, hot-water store, cost today, and the **Simulated data** badge.
- **Access and performance:**
  - Mini-map with floors and stops, search (Enter jumps to the first match), and deep links `?node=&mode=`.
  - Arrow keys move between stops in Tour.
  - Reduced motion cuts instead of gliding and stops the animations.
  - 2D list fallback without WebGL2.
  - Lite and Night toggles; adaptive DPR, and PerformanceMonitor drops to Lite when frames are slow.
- **Phones:** the dashboard menu becomes a horizontal strip, so every screen is usable on a phone.

## Checks
| Check | Result |
|---|---|
| Every node in points.yaml reachable | Tour: all 26 are on the route and in the list; Dollhouse: pins on every floor; Walk: stops open within 6 m on the same level, and floors are reached via the floor list |
| Panel figures match the dashboard | Same API and point ids. The meter's month peak uses the collector's value, as the dashboard does (the duplicate simulator point is hidden) |
| Typecheck, Biome, `next build` | Pass |
| Screens reviewed at 1440×900 and on a Pixel 7 profile (tour, walk, dollhouse) | Pass |
| Frame time | **Not met here.** This box has no GPU, so headless Chrome renders with SwiftShader (software): 110–210 ms a frame at 1440×900. The 60 fps (laptop) and 30 fps (phone) targets have to be measured on real hardware: open `/street?bench=1` and the strip shows average and worst frame times |

## Not yet done
- No screen recording: there is no GPU browser in this session.
- One console warning from drei `Html` labels on unmount (`removeChild`); it does not affect the view.
- The independent review was not run: there is no codex in this session.
