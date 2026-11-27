/**
 * The simulator must reproduce the bills (reference/calibration-targets.yaml) and the design's reference day.
 * Energy is checked only where a bill exists; MD is checked for every month.
 */
import { describe, expect, it } from 'vitest';
import { loadReference, makeModel, monthStartUTC, simulate } from '../src/sim';

const ref = loadReference();
const model = makeModel(ref);
const targets = ref.targets.months as Record<
  string,
  { kvah_per_day: number; md_kva: number; source: { kvah: string } }
>;

function month(key: string) {
  const [y, m] = key.split('-').map(Number) as [number, number];
  const from = monthStartUTC(y, m);
  const to = monthStartUTC(m === 12 ? y + 1 : y, m === 12 ? 1 : m + 1);
  const blocks = simulate(model, from, to, 300, 42);
  const days = (to.getTime() - from.getTime()) / 86400000;
  return {
    blocks,
    kvahDay: blocks.reduce((a, b) => a + b.kvah, 0) / days,
    md: Math.max(...blocks.map((b) => b.avgKva)),
  };
}

const results = Object.fromEntries(Object.keys(targets).map((k) => [k, month(k)]));

describe('simulator calibration against the MVVNL bills', () => {
  it.each(Object.keys(targets))('%s maximum demand within ±3%', (k) => {
    expect(Math.abs(results[k]!.md / targets[k]!.md_kva - 1)).toBeLessThanOrEqual(0.03);
  });
  it('May–Sep average energy within ±3% of the bill (6,207 kVAh/day)', () => {
    const avg =
      ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09']
        .map((k) => results[k]!.kvahDay)
        .reduce((a, b) => a + b, 0) / 5;
    expect(Math.abs(avg / 6207 - 1)).toBeLessThanOrEqual(0.03);
  });
  it('November energy within ±3% of the bill (6,617 kVAh/day)', () => {
    expect(Math.abs(results['2026-11']!.kvahDay / 6617 - 1)).toBeLessThanOrEqual(0.03);
  });
  it('November mean day matches the design reference shape (r ≥ 0.95) and solar within ±5%', () => {
    const b = results['2026-11']!.blocks;
    const days = b.length / 96;
    const prof = new Array<number>(96).fill(0);
    let solar = 0;
    b.forEach((x, i) => {
      prof[i % 96] = (prof[i % 96] ?? 0) + (x.kwh * 4) / days;
      solar += x.solarKwh / days;
    });
    const g: number[] = ref.profiles.nov.y.g.map((x: number) => x * 4);
    const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
    const ma = mean(prof);
    const mb = mean(g);
    let num = 0;
    let da = 0;
    let db = 0;
    prof.forEach((v, i) => {
      num += (v - ma) * ((g[i] ?? 0) - mb);
      da += (v - ma) ** 2;
      db += ((g[i] ?? 0) - mb) ** 2;
    });
    expect(num / Math.sqrt(da * db)).toBeGreaterThanOrEqual(0.95);
    const refSolar = ref.profiles.solar.reduce((a: number, x: number) => a + x, 0) / ref.profiles.solar.length;
    expect(Math.abs(solar / refSolar - 1)).toBeLessThanOrEqual(0.05);
  });
});

describe('hot June evening (Demand ceiling design case)', () => {
  it('uncontrolled peak lands at about 642 kVA (630–655)', () => {
    const from = new Date('2026-06-17T00:00:00+05:30');
    const to = new Date('2026-06-18T00:00:00+05:30');
    const blocks = simulate(model, from, to, 60, 42, { hotDelta: () => Number(process.env.HOT_DELTA ?? 4) });
    const peak = Math.max(...blocks.map((b) => b.avgKva));
    expect(peak).toBeGreaterThanOrEqual(630);
    expect(peak).toBeLessThanOrEqual(655);
  });
});
