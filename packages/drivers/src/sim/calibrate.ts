/**
 * Fits the simulator to the bills (reference/calibration-targets.yaml):
 *  - base load stays at the November reference (which reproduces the Nov bill), except one shared
 *    May–Sep factor fitted to the May–Sep bill (6,207 kVAh/day average); lighting follows daylight;
 *  - cooling rises 1% per °C above the November reference (prior) and falls 7% per °C below it;
 *  - an evening-coincidence factor per month, fitted to that month's maximum demand;
 *  - months whose energy has no bill are not fitted on energy; their energy is a model output.
 * Writes reference/calibration.json. Run: pnpm --filter @drm/drivers calibrate
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Calib } from './model';
import { loadReference, REF_DIR } from './reference';
import { makeModel, monthStartUTC, simulate } from './run';

const SEED = 42;
const ref = loadReference();
const targets = ref.targets.months as Record<
  string,
  { kvah_per_day: number; md_kva: number; source: { kvah: string } }
>;

function evaluate(key: string, c: Calib) {
  const [y, m] = key.split('-').map(Number) as [number, number];
  const from = monthStartUTC(y, m);
  const to = monthStartUTC(m === 12 ? y + 1 : y, m === 12 ? 1 : m + 1);
  const blocks = simulate(
    makeModel(ref, () => c),
    from,
    to,
    300,
    SEED,
  );
  const days = (to.getTime() - from.getTime()) / 86400000;
  return { kvahDay: blocks.reduce((a, b) => a + b.kvah, 0) / days, md: Math.max(...blocks.map((b) => b.avgKva)) };
}

const SUMMER = ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09'];
const SUMMER_KVAH = 6207; // May–Sep bill: 9,49,613 kVAh over 153 days

/** Fit the evening factor to the month's MD at a given base-load scale. */
function fitMonth(key: string, cool: number, base = 1) {
  const t = targets[key]!;
  let eve = 1;
  let r = evaluate(key, { base, cool, eve });
  for (let i = 0; i < 12 && Math.abs(r.md / t.md_kva - 1) > 0.006; i++) {
    eve = Math.max(0.2, Math.min(2.5, eve * (t.md_kva / r.md) ** 1.7));
    r = evaluate(key, { base, cool, eve });
  }
  return { eve, base, ...r };
}

// Cooling rise is a physical prior (1% per °C above the November reference). One summer base factor
// (May–Sep, shared) is fitted by bisection to the summer bill.
const COOL = 0.01;
let lo = 0.3;
let hi = 1.2;
let SUMMER_BASE = 1;
for (let i = 0; i < 8; i++) {
  SUMMER_BASE = (lo + hi) / 2;
  const avg = SUMMER.map((k) => fitMonth(k, COOL, SUMMER_BASE).kvahDay).reduce((a, b) => a + b, 0) / SUMMER.length;
  console.log(`summer base ${SUMMER_BASE.toFixed(3)} → May–Sep ${avg.toFixed(0)} kVAh/day (bill ${SUMMER_KVAH})`);
  if (avg > SUMMER_KVAH) hi = SUMMER_BASE;
  else lo = SUMMER_BASE;
}

const out: Record<string, Calib> = {};
const report: string[] = [];
for (const key of Object.keys(targets)) {
  const f = fitMonth(key, COOL, SUMMER.includes(key) ? SUMMER_BASE : 1);
  out[key] = { base: Number(f.base.toFixed(4)), cool: COOL, eve: Number(f.eve.toFixed(4)) };
  const t = targets[key]!;
  report.push(
    `${key}  base ${f.base.toFixed(3)} eve ${f.eve.toFixed(3)}  kVAh/day ${f.kvahDay.toFixed(0)} (${t.source.kvah.startsWith('bill') ? 'bill' : 'assumed'} ${t.kvah_per_day})  MD ${f.md.toFixed(1)} (target ${t.md_kva})`,
  );
}
console.log(report.join('\n'));
for (const [key, c] of Object.entries({ ...out })) out[`*-${key.slice(5)}`] = c;
writeFileSync(
  join(REF_DIR, 'calibration.json'),
  `${JSON.stringify({ seed: SEED, fitted: new Date().toISOString(), cool: COOL, summerBase: SUMMER_BASE, months: out }, null, 2)}\n`,
);
console.log('wrote reference/calibration.json');
