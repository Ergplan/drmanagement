import { describe, expect, it } from 'vitest';
import { eventPerformance, recommendNomination, settle } from '../src/mv';
import { HV1_GLOBE } from '../src/tariff';

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

describe('settle', () => {
  const day = (peak: number) => Array.from({ length: 96 }, (_, k) => (k >= 70 && k < 80 ? peak : 400));
  const base = {
    baselineKw: Array(10).fill(500),
    actualKw: Array(10).fill(440),
    nominationKw: 60,
    gridFactor: 0.727,
    spec: HV1_GLOBE,
    paymentInrPerKw: null,
    penaltyInrPerKw: null,
  };
  it('values a lowered monthly peak at the demand charge (₹430/kVA)', () => {
    const s = settle({ ...base, dayBaselineKva: day(530), dayActualKva: day(470), monthMdBeforeKva: 460 });
    expect(s.deliveredKw).toBeCloseTo(60);
    expect(s.deliveredKwh).toBeCloseTo(150);
    expect(s.performancePct).toBeCloseTo(100);
    expect(s.avoidedDemandInr).toBeCloseTo(60 * 430);
    expect(s.energyValueInr).toBe(0);
    expect(s.valueInr).toBeCloseTo(25800);
  });
  it('is worth nothing in demand charge when the month already peaked higher', () => {
    const s = settle({ ...base, dayBaselineKva: day(530), dayActualKva: day(470), monthMdBeforeKva: 560 });
    expect(s.avoidedDemandInr).toBe(0);
  });
  it('below the 450 kVA floor nothing is avoided', () => {
    const s = settle({ ...base, dayBaselineKva: day(440), dayActualKva: day(400), monthMdBeforeKva: 300 });
    expect(s.avoidedDemandInr).toBe(0);
  });
  it('programme payment and shortfall penalty', () => {
    const s = settle({
      ...base,
      actualKw: Array(10).fill(470),
      dayBaselineKva: day(400),
      dayActualKva: day(400),
      monthMdBeforeKva: 500,
      paymentInrPerKw: 100,
      penaltyInrPerKw: 50,
    });
    expect(s.programmePaymentInr).toBeCloseTo(3000);
    expect(s.penaltyInr).toBeCloseTo(1500);
    expect(s.valueInr).toBeCloseTo(1500);
  });
});
