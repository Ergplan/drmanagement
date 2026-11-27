import { describe, expect, it } from 'vitest';
import { eventPerformance, recommendNomination } from '../src/mv';

describe('M&V', () => {
  it('60 kW delivered for 2.5 h against a 60 kW nomination', () => {
    const base = new Array<number>(10).fill(470);
    const act = new Array<number>(10).fill(410);
    const p = eventPerformance(base, act, 0.25, 60, 0.727);
    expect(p.deliveredKw).toBe(60);
    expect(p.deliveredKwh).toBe(150);
    expect(p.performancePct).toBe(100);
    expect(p.avoidedTco2).toBeCloseTo(0.10905, 5);
  });
  it('nomination is 90% of the median past delivery, rounded down', () => {
    expect(recommendNomination([50, 70, 60])).toBe(54);
    expect(recommendNomination([])).toBe(0);
  });
});
