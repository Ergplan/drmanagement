/**
 * Customer baseline load (CBL) methods used by DR programmes. Inputs are interval series
 * (one value per interval, e.g. 96 × 15-min kW for a day). Pure functions.
 */
export interface DaySeries {
  date: string; // IST YYYY-MM-DD
  values: readonly number[];
  eligible: boolean; // false for event days, holidays, outages
}

function mean(xs: readonly number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

function windowMean(values: readonly number[], from: number, to: number): number {
  return mean(values.slice(from, to));
}

function averageDays(days: readonly DaySeries[]): number[] {
  const n = days[0]?.values.length ?? 0;
  const out = new Array<number>(n).fill(0);
  for (const d of days) for (let i = 0; i < n; i++) out[i] = (out[i] ?? 0) + (d.values[i] ?? 0) / days.length;
  return out;
}

/**
 * X-of-Y: from the last Y eligible days before the event, take the X with the highest average load in the
 * event window, and average them interval by interval. `days` must be ordered oldest → newest.
 */
export function xOfY(days: readonly DaySeries[], x: number, y: number, window: { from: number; to: number }): number[] {
  const pool = days.filter((d) => d.eligible).slice(-y);
  if (pool.length < x) throw new Error(`xOfY needs ${x} eligible days, has ${pool.length}`);
  const chosen = [...pool]
    .sort((a, b) => windowMean(b.values, window.from, window.to) - windowMean(a.values, window.from, window.to))
    .slice(0, x);
  return averageDays(chosen);
}

/**
 * Day-matching average of the last N eligible like days, scaled by a same-day adjustment:
 * actual / baseline over an adjustment window before the event, capped at ±cap (default 20%).
 */
export function dayMatching(
  days: readonly DaySeries[],
  n: number,
  eventDay: readonly number[],
  adjust: { from: number; to: number },
  cap = 0.2,
): { baseline: number[]; factor: number } {
  const pool = days.filter((d) => d.eligible).slice(-n);
  if (pool.length === 0) throw new Error('dayMatching needs at least one eligible day');
  const raw = averageDays(pool);
  const base = windowMean(raw, adjust.from, adjust.to);
  const actual = windowMean(eventDay, adjust.from, adjust.to);
  const unclamped = base > 0 ? actual / base : 1;
  const factor = Math.min(1 + cap, Math.max(1 - cap, unclamped));
  return { baseline: raw.map((v) => v * factor), factor };
}

/** Pre-event baseline: the average of the last `count` intervals before the event starts, held flat. */
export function preEvent(series: readonly number[], eventStart: number, count: number, length: number): number[] {
  const level = windowMean(series, Math.max(0, eventStart - count), eventStart);
  return new Array<number>(length).fill(level);
}
