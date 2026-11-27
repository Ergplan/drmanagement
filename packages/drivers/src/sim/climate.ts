import { gauss } from './rng';

/** Lucknow monthly climate normals (°C): mean daily min and max. Source: IMD normals, rounded. */
const NORMALS: Array<[number, number]> = [
  [8, 23],
  [11, 26],
  [16, 33],
  [21, 38],
  [26, 41],
  [28, 39],
  [26, 34],
  [26, 33],
  [25, 33],
  [19, 32],
  [13, 28],
  [9, 24],
];
/** Mean relative humidity % by month. */
const RH = [70, 60, 45, 35, 40, 60, 82, 85, 80, 70, 65, 70];

/** Day-to-day anomaly (°C), smooth across days: AR(1)-like by blending neighbouring days' noise. */
function dayAnomaly(dayNo: number, seed: number): number {
  return 0.6 * gauss(seed, 7, dayNo) + 0.3 * gauss(seed, 7, dayNo - 1) + 0.1 * gauss(seed, 7, dayNo - 2);
}

export interface Weather {
  tempC: number;
  rhPct: number;
}

/**
 * Air temperature at an IST hour-of-day for a calendar month (1..12), with the daily cycle (min ~06:00, max ~15:00)
 * and a seeded day anomaly of about ±2.5 °C. `hotDelta` lets scenarios push a heat wave.
 */
export function weatherAt(month: number, istHour: number, dayNo: number, seed: number, hotDelta = 0): Weather {
  const [lo, hi] = NORMALS[month - 1]!;
  const anomaly = 2.5 * dayAnomaly(dayNo, seed) + hotDelta;
  // piecewise cosine: rise 06→15, fall 15→06
  let phase: number;
  if (istHour >= 6 && istHour < 15) phase = (istHour - 6) / 9;
  else phase = istHour >= 15 ? 1 - (istHour - 15) / 15 : 1 - (istHour + 9) / 15;
  const shape = 0.5 - 0.5 * Math.cos(Math.PI * phase);
  const tempC = lo + (hi - lo) * shape + anomaly;
  const rhPct = Math.max(15, Math.min(98, RH[month - 1]! + (1 - shape) * 15 - shape * 10));
  return { tempC, rhPct };
}

export const NOV_NORMAL: [number, number] = NORMALS[10]!;
export { NORMALS };

/** Climate-normal temperature (no anomaly) at an IST hour for a month. */
export function normalTempAt(month: number, istHour: number): number {
  const [lo, hi] = NORMALS[month - 1]!;
  let phase: number;
  if (istHour >= 6 && istHour < 15) phase = (istHour - 6) / 9;
  else phase = istHour >= 15 ? 1 - (istHour - 15) / 15 : 1 - (istHour + 9) / 15;
  return lo + (hi - lo) * (0.5 - 0.5 * Math.cos(Math.PI * phase));
}
