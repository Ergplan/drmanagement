/** HV-1 tariff maths as MVVNL bills it (reference/tariff.yaml). Pure functions; amounts in ₹. */
export interface TariffSpec {
  energyRatePerKvah: number;
  demandRatePerKvaMonth: number;
  dutyPct: number;
  contractedKva: number;
  floorPct: number; // billing demand floor as a share of contracted load
  excessSurcharge: number; // 1.0 = excess demand billed at 100% extra
}

export const HV1_GLOBE: TariffSpec = {
  energyRatePerKvah: 8.32,
  demandRatePerKvaMonth: 430,
  dutyPct: 7.5,
  contractedKva: 600,
  floorPct: 0.75,
  excessSurcharge: 1.0,
};

/** Billing demand: the higher of actual maximum demand and the floor (75% of contracted load). */
export function billingDemandKva(mdKva: number, spec: TariffSpec): number {
  return Math.max(mdKva, spec.floorPct * spec.contractedKva);
}

/** Demand charge for `months` billing months: base on billing demand up to contract, plus excess at the surcharge. */
export function demandCharge(mdKva: number, spec: TariffSpec, months = 1): number {
  const billed = billingDemandKva(mdKva, spec);
  const base = Math.min(billed, spec.contractedKva) * spec.demandRatePerKvaMonth;
  const excess = Math.max(0, mdKva - spec.contractedKva) * spec.demandRatePerKvaMonth * (1 + spec.excessSurcharge);
  return (base + excess) * months;
}

export function energyCharge(kvah: number, spec: TariffSpec): number {
  return kvah * spec.energyRatePerKvah;
}

export interface BillInput {
  kvah: number;
  mdKva: number;
  months?: number;
  fuelAdj?: number; // FPPAS line (negative = rebate)
}

export interface BillLines {
  energy: number;
  demand: number;
  fuelAdj: number;
  duty: number;
  total: number;
  billingDemandKva: number;
}

/** Reproduces an MVVNL HV-1 bill: duty applies to energy + demand + fuel adjustment. */
export function computeBill(input: BillInput, spec: TariffSpec): BillLines {
  const energy = energyCharge(input.kvah, spec);
  const demand = demandCharge(input.mdKva, spec, input.months ?? 1);
  const fuelAdj = input.fuelAdj ?? 0;
  const duty = ((energy + demand + fuelAdj) * spec.dutyPct) / 100;
  return {
    energy,
    demand,
    fuelAdj,
    duty,
    total: energy + demand + fuelAdj + duty,
    billingDemandKva: billingDemandKva(input.mdKva, spec),
  };
}

/**
 * Demand charge avoided this month by holding an event peak at `peakAfterKva` instead of `peakBeforeKva`,
 * given the month's maximum demand so far. Zero when the month's MD is already higher than both.
 */
export function avoidedDemandCharge(
  peakBeforeKva: number,
  peakAfterKva: number,
  monthMdSoFarKva: number,
  spec: TariffSpec,
): number {
  const before = demandCharge(Math.max(monthMdSoFarKva, peakBeforeKva), spec);
  const after = demandCharge(Math.max(monthMdSoFarKva, peakAfterKva), spec);
  return Math.max(0, before - after);
}

/** All-in cost of energy at the margin, ₹ per kVAh, including duty. */
export function marginalRatePerKvah(spec: TariffSpec): number {
  return spec.energyRatePerKvah * (1 + spec.dutyPct / 100);
}

/**
 * Bill audit: energy billed above what the site normally uses over the same days. Returns the excess kVAh and its
 * energy-charge value (duty excluded, as disputes are raised on the energy line).
 */
export function billAuditExcess(
  billedKvah: number,
  days: number,
  normalKvahPerDay: number,
  spec: TariffSpec,
): { excessKvah: number; excessInr: number; ratio: number } {
  const expected = normalKvahPerDay * days;
  const excessKvah = Math.max(0, billedKvah - expected);
  return {
    excessKvah,
    excessInr: excessKvah * spec.energyRatePerKvah,
    ratio: expected > 0 ? billedKvah / expected : 0,
  };
}
