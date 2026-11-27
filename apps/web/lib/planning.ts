import { plan } from '@drm/control';
import { flexAssets, getDb, schema } from '@drm/db';
import { avoidedDemandCharge, istMidnightUTC } from '@drm/domain';
import { and, eq, gte, max } from 'drizzle-orm';
import { HttpError } from './api';
import { loadForecast } from './forecast-data';
import { tariffSpec } from './site';

const hm = (s: string) => {
  const m = /^(\d{2}):(\d{2})$/.exec(s);
  if (!m) throw new HttpError(400, `bad time ${s}`);
  const v = Number(m[1]) * 60 + Number(m[2]);
  if (v % 15 || v >= 1440) throw new HttpError(400, 'times must be on a 15-minute block boundary');
  return v;
};

/** Forecast the IST date and plan an event window on it. Same planner whether previewed or proposed. */
export async function planFor(
  siteId: string,
  q: { date?: string | null; start?: string | null; end?: string | null; targetKw?: number | null },
) {
  const pre = await loadForecast(siteId, 3);
  const date = q.date ?? pre.dates[0]!;
  if (!pre.dates.includes(date)) throw new HttpError(400, `date must be one of ${pre.dates.join(', ')}`);
  const start = q.start ?? pre.ctl.drWindow.start;
  const end = q.end ?? pre.ctl.drWindow.end;
  const targetKw = q.targetKw ?? pre.ctl.drWindow.targetKw;
  const s = hm(start);
  const e = hm(end);
  if (e <= s) throw new HttpError(400, 'end must be after start');
  if (!(targetKw > 0 && targetKw <= 1000)) throw new HttpError(400, 'target must be 1 to 1000 kW');
  const blocks = pre.f.blocks.filter((b) => b.date === date);
  const p50 = Array<number | null>(96).fill(null);
  const p90 = Array<number | null>(96).fill(null);
  for (const b of blocks) {
    p50[b.blockNo - 1] = b.p50;
    p90[b.blockNo - 1] = b.p90;
  }
  // Use metered blocks where today's already happened.
  if (date === pre.today)
    for (const [k, v] of pre.todayBlocks.kva.entries())
      if (v !== null) {
        p50[k] = v;
        p90[k] = v;
      }
  const month = Number(date.slice(5, 7));
  const assets = await flexAssets(getDb().db, siteId, month);
  const startBlock = s / 15 + 1;
  const endBlock = e / 15;
  const p = plan({ forecastKva: p50, startBlock, endBlock, targetKw, assets, ceilingKva: pre.ctl.ladder.ceiling });
  const pHigh = plan({ forecastKva: p90, startBlock, endBlock, targetKw, assets, ceilingKva: pre.ctl.ladder.ceiling });
  const mid = istMidnightUTC(date).getTime();
  const monthStart = istMidnightUTC(`${date.slice(0, 7)}-01`);
  const [md] = await getDb()
    .db.select({ v: max(schema.block15m.avgKva) })
    .from(schema.block15m)
    .where(and(eq(schema.block15m.siteId, siteId), gte(schema.block15m.blockStart, monthStart)));
  const monthMdKva = md?.v ?? 0;
  const t = await tariffSpec(siteId);
  const avoidedInr =
    p.forecastPeakKva !== null && p.plannedPeakKva !== null
      ? avoidedDemandCharge(p.forecastPeakKva, p.plannedPeakKva, monthMdKva, t.spec)
      : null;
  return {
    date,
    dates: pre.dates,
    start,
    end,
    targetKw,
    startsAt: new Date(mid + s * 60000),
    endsAt: new Date(mid + e * 60000),
    startBlock,
    endBlock,
    p50,
    p90,
    plan: p,
    plannedPeakP90: pHigh.plannedPeakKva,
    assets,
    monthMdKva,
    avoidedInr,
    floorKva: t.floorKva,
    demandRate: t.spec.demandRatePerKvaMonth,
    ladder: pre.ctl.ladder,
    armBy: pre.ctl.armBy,
    likeDays: pre.f.likeDays[date] ?? [],
  };
}
