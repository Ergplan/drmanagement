/** Measurement and verification of a DR event. Pure functions. */
export interface EventPerformance {
  deliveredKw: number; // average reduction over the event
  deliveredKwh: number;
  performancePct: number; // delivered vs nomination
  avoidedTco2: number;
  perInterval: number[];
}

/**
 * @param baselineKw baseline per interval over the event
 * @param actualKw metered per interval over the event
 * @param intervalH interval length in hours (0.25 for 15 min)
 * @param nominationKw committed reduction
 * @param gridFactor tCO2 per MWh (CEA)
 */
export function eventPerformance(
  baselineKw: readonly number[],
  actualKw: readonly number[],
  intervalH: number,
  nominationKw: number,
  gridFactor: number,
): EventPerformance {
  if (baselineKw.length !== actualKw.length) throw new Error('baseline and actual must align');
  const perInterval = baselineKw.map((b, i) => b - (actualKw[i] ?? 0));
  const deliveredKw = perInterval.length ? perInterval.reduce((a, b) => a + b, 0) / perInterval.length : 0;
  const deliveredKwh = perInterval.reduce((a, b) => a + b * intervalH, 0);
  return {
    deliveredKw,
    deliveredKwh,
    performancePct: nominationKw > 0 ? (deliveredKw / nominationKw) * 100 : 0,
    avoidedTco2: Math.max(0, deliveredKwh) * (gridFactor / 1000),
    perInterval,
  };
}

/** Recommended nomination: a conservative share of the median delivered kW of past events (right-sizing). */
export function recommendNomination(pastDeliveredKw: readonly number[], share = 0.9): number {
  if (pastDeliveredKw.length === 0) return 0;
  const s = [...pastDeliveredKw].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  const median = s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
  return Math.floor(median * share);
}
