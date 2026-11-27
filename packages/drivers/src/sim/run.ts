import { blockStartIST, IST_OFFSET_MIN } from '@drm/domain';
import { type Calib, HospitalModel, type Snapshot } from './model';
import { loadReference, type Reference } from './reference';

export interface BlockAgg {
  blockStart: Date;
  kwh: number;
  kvah: number;
  kvarh: number;
  avgKva: number;
  maxKva: number;
  solarKwh: number;
  assetKwh: Record<string, number>;
}

/** Calibration lookup with a neutral default for months not calibrated yet. */
export function calibFrom(ref: Reference): (month: number, year: number) => Calib {
  return (month, year) =>
    ref.calibration[`${year}-${String(month).padStart(2, '0')}`] ??
    ref.calibration[`*-${String(month).padStart(2, '0')}`] ?? { base: 1, cool: 0.04 };
}

export function makeModel(ref = loadReference(), calib?: (m: number, y: number) => Calib) {
  return new HospitalModel(ref, calib ?? calibFrom(ref));
}

/**
 * Run the model from `from` to `to` (UTC) with a step in seconds, calling `onStep` for every snapshot and
 * returning IST 15-minute block aggregates (energy integrated over steps).
 */
export function simulate(
  model: HospitalModel,
  from: Date,
  to: Date,
  stepS: number,
  seed: number,
  opts: { hotDelta?: (s: Snapshot | null, at: Date) => number; onStep?: (s: Snapshot) => void } = {},
): BlockAgg[] {
  const state = HospitalModel.initialState(from.getTime() - stepS * 1000);
  const blocks: BlockAgg[] = [];
  let cur: BlockAgg | null = null;
  const dtH = stepS / 3600;
  for (let t = from.getTime(); t < to.getTime(); t += stepS * 1000) {
    const at = new Date(t);
    const s = model.step(state, at, { seed, hotDelta: opts.hotDelta?.(null, at) ?? 0 });
    opts.onStep?.(s);
    const bs = blockStartIST(at).getTime();
    if (!cur || cur.blockStart.getTime() !== bs) {
      if (cur) blocks.push(cur);
      cur = { blockStart: new Date(bs), kwh: 0, kvah: 0, kvarh: 0, avgKva: 0, maxKva: 0, solarKwh: 0, assetKwh: {} };
    }
    cur.kwh += s.gridKw * dtH;
    cur.kvah += s.gridKva * dtH;
    cur.kvarh += s.gridKvar * dtH;
    cur.solarKwh += s.solarKw * dtH;
    cur.maxKva = Math.max(cur.maxKva, s.gridKva);
    for (const [k, v] of Object.entries(s.loads)) cur.assetKwh[k] = (cur.assetKwh[k] ?? 0) + v * dtH;
  }
  if (cur) blocks.push(cur);
  for (const b of blocks) b.avgKva = b.kvah * 4;
  return blocks;
}

/** UTC instant of 00:00 IST on the first of a month. */
export function monthStartUTC(year: number, month: number): Date {
  return new Date(Date.UTC(year, month - 1, 1) - IST_OFFSET_MIN * 60000);
}
