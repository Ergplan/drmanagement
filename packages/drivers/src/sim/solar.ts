import { u01 } from './rng';

const LAT = (26.85 * Math.PI) / 180;
const LON = 80.95;

/** Sun elevation (radians) for a UTC instant at Lucknow. NOAA-style approximation, good to ~0.5°. */
export function sunElevation(at: Date): number {
  const d = (at.getTime() - Date.UTC(at.getUTCFullYear(), 0, 1)) / 86400000;
  const g = ((2 * Math.PI) / 365) * (d - 1 + (at.getUTCHours() - 12) / 24);
  const decl =
    0.006918 -
    0.399912 * Math.cos(g) +
    0.070257 * Math.sin(g) -
    0.006758 * Math.cos(2 * g) +
    0.000907 * Math.sin(2 * g);
  const eqt =
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(g) -
      0.032077 * Math.sin(g) -
      0.014615 * Math.cos(2 * g) -
      0.040849 * Math.sin(2 * g));
  const minutes = at.getUTCHours() * 60 + at.getUTCMinutes() + at.getUTCSeconds() / 60;
  const tst = minutes + eqt + 4 * LON;
  const ha = ((tst / 4 - 180) * Math.PI) / 180;
  const cosZ = Math.sin(LAT) * Math.sin(decl) + Math.cos(LAT) * Math.cos(decl) * Math.cos(ha);
  return Math.asin(Math.max(-1, Math.min(1, cosZ)));
}

/** Clear-sky transmission by month: winter smog and haze, monsoon cloud. Tuned so Nov ≈ 1,000–1,090 kWh/day. */
const CLARITY = [0.86, 0.95, 0.98, 0.98, 0.96, 0.84, 0.7, 0.72, 0.82, 0.96, 0.95, 0.86];

/** Day cloudiness factor 0.35..1, seeded; monsoon months vary most. */
export function dayClearness(month: number, dayNo: number, seed: number): number {
  const spread = month >= 6 && month <= 9 ? 0.45 : month === 11 || month === 12 || month === 1 ? 0.3 : 0.15;
  return Math.max(0.35, 1 - spread * u01(seed, 31, dayNo) ** 1.6);
}

export interface SolarOut {
  ghiWm2: number;
  kw: number;
}

/** PV output for the 285 kWp roof (performance ratio 0.78 before temperature derate). */
export function solarAt(at: Date, month: number, dayNo: number, seed: number, tempC: number, kwp = 285): SolarOut {
  const el = sunElevation(at);
  if (el <= 0) return { ghiWm2: 0, kw: 0 };
  const clear = 1080 * Math.sin(el) ** 1.1;
  const ghi = clear * CLARITY[month - 1]! * dayClearness(month, dayNo, seed);
  const cellT = tempC + ghi * 0.03;
  const derate = 1 - Math.max(0, cellT - 25) * 0.0038;
  return { ghiWm2: ghi, kw: Math.max(0, (kwp * 0.86 * ghi * derate) / 1000) };
}
