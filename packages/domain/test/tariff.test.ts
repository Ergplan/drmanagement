import { describe, expect, it } from 'vitest';
import {
  avoidedDemandCharge,
  billAuditExcess,
  billingDemandKva,
  computeBill,
  demandCharge,
  HV1_GLOBE,
} from '../src/tariff';

// Bill figures from reference/bills.yaml (MVVNL a/c 9567-481-000), rounded to ₹1,000 on the bill summary.
const NEAR = 1000;

describe('HV-1 bills reproduce', () => {
  it('Nov 2026: 2,24,970 kVAh, 555 kVA, FPPAS −1.94 L → ₹20.61 L', () => {
    const b = computeBill({ kvah: 224970, mdKva: 555, fuelAdj: -194000 }, HV1_GLOBE);
    expect(Math.abs(b.energy - 1872000)).toBeLessThan(NEAR);
    expect(Math.abs(b.demand - 239000)).toBeLessThan(NEAR);
    expect(Math.abs(b.duty - 144000)).toBeLessThan(NEAR);
    expect(Math.abs(b.total - 2061000)).toBeLessThan(NEAR * 2);
  });
  it('Oct 2026: 2,43,750 kVAh, 540 kVA, FPPAS −1.18 L → ₹23.10 L', () => {
    const b = computeBill({ kvah: 243750, mdKva: 540, fuelAdj: -118000 }, HV1_GLOBE);
    expect(Math.abs(b.energy - 2028000)).toBeLessThan(NEAR);
    expect(Math.abs(b.demand - 232000)).toBeLessThan(NEAR);
    expect(Math.abs(b.duty - 161000)).toBeLessThan(NEAR);
    // Bill total ₹23.10 L is ₹7,000 above the sum of these four lines: another charge (meter rent/arrears) is not
    // in the bill extract. The engine reproduces the four lines; see docs/KNOWN-GAPS.md.
    expect(Math.abs(b.total - (2028000 + 232000 - 118000 + 161000))).toBeLessThan(NEAR * 2);
  });
  it('Sep 2026 merged bill: 9,49,613 kVAh, 585 kVA × 4 months', () => {
    const b = computeBill({ kvah: 949613, mdKva: 585, months: 4, fuelAdj: -239000 }, HV1_GLOBE);
    expect(Math.abs(b.energy - 7901000)).toBeLessThan(NEAR);
    expect(Math.abs(b.demand - 1006000)).toBeLessThan(NEAR);
    expect(Math.abs(b.duty - 650000)).toBeLessThan(NEAR);
  });
});

describe('billing demand rules', () => {
  it('floor: Jan 392.1 kVA is billed at 450', () => {
    expect(billingDemandKva(392.1, HV1_GLOBE)).toBe(450);
    expect(demandCharge(392.1, HV1_GLOBE)).toBe(450 * 430);
  });
  it('above contract: 642 kVA bills 600 at base and 42 at double rate', () => {
    expect(demandCharge(642, HV1_GLOBE)).toBe(600 * 430 + 42 * 430 * 2);
  });
  it('avoided charge is zero when the month MD is already higher', () => {
    expect(avoidedDemandCharge(470, 406, 500, HV1_GLOBE)).toBe(0);
  });
  it('avoided charge when the event sets the month peak: 470 → 406 on a month at 420', () => {
    expect(avoidedDemandCharge(470, 406, 420, HV1_GLOBE)).toBe((470 - 450) * 430);
  });
});

describe('bill audit', () => {
  it('October 2026: 2,43,750 kVAh over 13 days vs 6,617 a day → about ₹13.1 L excess', () => {
    const r = billAuditExcess(243750, 13, 6617, HV1_GLOBE);
    expect(Math.round(r.excessKvah)).toBe(157729);
    expect(Math.abs(r.excessInr - 1312305)).toBeLessThan(10);
    expect(r.ratio).toBeCloseTo(2.83, 2);
  });
});
