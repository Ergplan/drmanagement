import { type DayBlocks, forecast } from '@drm/control';
import { blockHistory, getDb } from '@drm/db';
import { blockIndexIST, istDate, istMidnightUTC } from '@drm/domain';
import { getHandler, SITE_ID } from '@/lib/api';
import { LADDER, tariffSpec } from '@/lib/site';

export const dynamic = 'force-dynamic';

const HOLIDAYS = new Set([
  '2026-01-26',
  '2026-03-04',
  '2026-08-15',
  '2026-10-02',
  '2026-10-20',
  '2026-11-08',
  '2026-12-25',
]);

/** 48-hour grid-demand forecast (today + 2 days) from like days, with today's metered blocks. */
export const GET = getHandler(async () => {
  const now = new Date();
  const today = istDate(now);
  const from = new Date(istMidnightUTC(today).getTime() - 28 * 86400000);
  const rows = await blockHistory(getDb().db, SITE_ID, from);
  const byDay = new Map<string, Array<number | null>>();
  for (const r of rows) {
    const d = istDate(r.blockStart);
    const arr = byDay.get(d) ?? Array<number | null>(96).fill(null);
    arr[blockIndexIST(r.blockStart) - 1] = r.avgKva;
    byDay.set(d, arr);
  }
  const history: DayBlocks[] = [...byDay].filter(([d]) => d < today).map(([date, kva]) => ({ date, kva }));
  const todayBlocks: DayBlocks = { date: today, kva: byDay.get(today) ?? Array(96).fill(null) };
  const dates = [0, 1, 2].map((k) => istDate(new Date(istMidnightUTC(today).getTime() + k * 86400000 + 3600000)));
  const f = forecast(history, todayBlocks, dates, HOLIDAYS);
  const t = await tariffSpec(SITE_ID);
  return {
    today,
    dates,
    actual: todayBlocks.kva,
    blocks: f.blocks,
    likeDays: f.likeDays,
    adjustment: f.adjustment,
    peak: f.peak,
    exceedCeilingPct: f.exceedProbability(LADDER.ceiling) * 100,
    exceedStage1Pct: f.exceedProbability(LADDER.stage1) * 100,
    floorKva: t.floorKva,
    sanctionKva: t.sanctionKva,
    method:
      'Like-day average (working day vs Sunday/holiday, last 8 like days), same-day level adjustment ±10%, P10/P90 from like-day spread',
  };
});
