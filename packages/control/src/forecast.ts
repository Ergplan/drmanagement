/**
 * Grid-demand forecast, deterministic (invariant 8): for each target day, average the same IST block over recent
 * "like days" (working day vs Sunday/holiday), spread from their variation, and a same-day level adjustment from
 * the blocks already metered today (capped ±10%). P10/P90 assume a normal spread (±1.2816 σ).
 */
export interface DayBlocks {
  date: string; // IST YYYY-MM-DD
  kva: Array<number | null>; // 96 block averages; null where not metered
}

export interface ForecastBlock {
  date: string;
  blockNo: number;
  p10: number;
  p50: number;
  p90: number;
}

export interface ForecastResult {
  blocks: ForecastBlock[];
  likeDays: Record<string, string[]>;
  adjustment: number; // same-day level factor applied to today
  peak: { date: string; blockNo: number; p50: number; p90: number };
  exceedProbability: (kva: number) => number; // chance the target days' peak passes kva
}

const Z90 = 1.2816;

export function isNonWorking(date: string, holidays: ReadonlySet<string>): boolean {
  return new Date(`${date}T00:00:00Z`).getUTCDay() === 0 || holidays.has(date);
}

function normCdf(x: number): number {
  // Abramowitz–Stegun approximation
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp((-x * x) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
}

export function forecast(
  history: readonly DayBlocks[],
  today: DayBlocks,
  targetDates: readonly string[],
  holidays: ReadonlySet<string> = new Set(),
  maxLike = 8,
): ForecastResult {
  const complete = history.filter((d) => d.kva.filter((v) => v !== null).length >= 90);
  const likeDays: Record<string, string[]> = {};
  const out: ForecastBlock[] = [];
  // Same-day adjustment from today's metered blocks vs today's raw P50.
  let adjustment = 1;
  const peaks: Array<{ date: string; blockNo: number; p50: number; p90: number; sigma: number }> = [];
  for (const date of targetDates) {
    const nw = isNonWorking(date, holidays);
    let pool = complete.filter((d) => d.date < date && isNonWorking(d.date, holidays) === nw).slice(-maxLike);
    if (pool.length < 2) pool = complete.filter((d) => d.date < date).slice(-maxLike);
    likeDays[date] = pool.map((d) => d.date);
    const mean: number[] = [];
    const sd: number[] = [];
    for (let b = 0; b < 96; b++) {
      const xs = pool.map((d) => d.kva[b]).filter((v): v is number => v !== null && v !== undefined);
      const m = xs.length ? xs.reduce((a, x) => a + x, 0) / xs.length : 0;
      const v = xs.length > 1 ? xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1) : 0;
      mean.push(m);
      sd.push(Math.max(Math.sqrt(v), m * 0.03));
    }
    if (date === today.date) {
      let a = 0;
      let p = 0;
      today.kva.forEach((v, b) => {
        if (v !== null && v !== undefined) {
          a += v;
          p += mean[b] ?? 0;
        }
      });
      if (p > 0) adjustment = Math.min(1.1, Math.max(0.9, a / p));
    }
    const f = date === today.date ? adjustment : 1;
    let best = { blockNo: 1, p50: -1, p90: 0, sigma: 0 };
    for (let b = 0; b < 96; b++) {
      const p50 = (mean[b] ?? 0) * f;
      const s = (sd[b] ?? 0) * f;
      out.push({ date, blockNo: b + 1, p10: Math.max(0, p50 - Z90 * s), p50, p90: p50 + Z90 * s });
      if (p50 > best.p50) best = { blockNo: b + 1, p50, p90: p50 + Z90 * s, sigma: s };
    }
    peaks.push({ date, ...best });
  }
  const top = peaks.reduce(
    (a, b) => (b.p50 > a.p50 ? b : a),
    peaks[0] ?? { date: '', blockNo: 1, p50: 0, p90: 0, sigma: 1 },
  );
  return {
    blocks: out,
    likeDays,
    adjustment,
    peak: { date: top.date, blockNo: top.blockNo, p50: top.p50, p90: top.p90 },
    exceedProbability: (kva: number) =>
      1 - peaks.reduce((acc, p) => acc * normCdf((kva - p.p50) / Math.max(1, p.sigma)), 1),
  };
}
