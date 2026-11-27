import { describe, expect, it } from 'vitest';
import { type DaySeries, dayMatching, preEvent, xOfY } from '../src/baselines';

const flat = (v: number, n = 8) => new Array<number>(n).fill(v);
const day = (date: string, v: number, eligible = true): DaySeries => ({ date, values: flat(v), eligible });

describe('baselines', () => {
  it('X-of-Y picks the X highest of the last Y eligible days in the window', () => {
    const days = [day('d1', 100), day('d2', 300), day('d3', 200), day('d4', 999, false), day('d5', 250)];
    // last 4 eligible: d1,d2,d3,d5 → highest 2: d2 (300), d5 (250) → 275
    expect(xOfY(days, 2, 4, { from: 2, to: 6 })).toEqual(flat(275));
  });
  it('X-of-Y throws without enough eligible days', () => {
    expect(() => xOfY([day('d1', 1)], 2, 3, { from: 0, to: 8 })).toThrow();
  });
  it('day-matching applies the same-day adjustment', () => {
    const r = dayMatching([day('a', 100), day('b', 100)], 2, flat(110), { from: 0, to: 2 });
    expect(r.factor).toBeCloseTo(1.1);
    expect(r.baseline[5]).toBeCloseTo(110);
  });
  it('day-matching caps the adjustment at ±20%', () => {
    const r = dayMatching([day('a', 100)], 1, flat(200), { from: 0, to: 2 });
    expect(r.factor).toBeCloseTo(1.2);
  });
  it('pre-event baseline holds the average of the last intervals', () => {
    expect(preEvent([1, 2, 3, 10, 20, 0, 0], 5, 2, 3)).toEqual([15, 15, 15]);
  });
});
