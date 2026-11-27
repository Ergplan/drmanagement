import { describe, expect, it } from 'vitest';
import { loadReference, SimDriver } from '../src/sim';

const ref = loadReference();

describe('SimDriver', () => {
  it('serves every point in points.yaml with source sim', () => {
    const d = new SimDriver({ ref });
    const r = d.read(new Date('2026-11-27T09:00:00Z'));
    const expected = ref.points.reduce((a, n) => a + n.points.length, 0);
    expect(r.length).toBe(expected);
    expect(r.every((x) => x.source === 'sim' && Number.isFinite(x.value))).toBe(true);
  });
  it('shedding laundry lowers its load within its response time and pays it back after restore', () => {
    const d = new SimDriver({ ref });
    const t0 = new Date('2026-11-27T05:30:00Z'); // 11:00 IST, laundry busy
    const kw = (t: Date) => d.read(t).find((x) => x.pointId === 'laundry.kw')!.value;
    const before = kw(t0);
    d.actuate({ assetId: 'laundry', action: 'shed' }, t0);
    let t = t0;
    for (let i = 1; i <= 20; i++) t = new Date(t0.getTime() + i * 60000);
    const during = kw(t);
    expect(during).toBeLessThan(before * 0.5);
    d.actuate({ assetId: 'laundry', action: 'restore' }, t);
    let after = 0;
    for (let i = 1; i <= 20; i++) after = kw(new Date(t.getTime() + i * 60000));
    expect(after).toBeGreaterThan(before * 0.9);
  });
  it('injected faults override a point for their duration', () => {
    const d = new SimDriver({ ref });
    const t0 = new Date('2026-11-27T09:00:00Z');
    d.injectFault('ot.pressure_pa_ot2', 9, 60, t0);
    expect(d.read(t0).find((x) => x.pointId === 'ot.pressure_pa_ot2')!.value).toBe(9);
    expect(
      d.read(new Date(t0.getTime() + 120000)).find((x) => x.pointId === 'ot.pressure_pa_ot2')!.value,
    ).toBeGreaterThan(14);
  });
  it('the same seed gives the same hospital', () => {
    const a = new SimDriver({ ref, seed: 7 }).read(new Date('2026-11-27T12:00:00Z'));
    const b = new SimDriver({ ref, seed: 7 }).read(new Date('2026-11-27T12:00:00Z'));
    expect(a).toEqual(b);
  });
});
