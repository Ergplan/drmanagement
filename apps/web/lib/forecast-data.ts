import { type DayBlocks, forecast } from '@drm/control';
import { blockHistory, getDb } from '@drm/db';
import { blockIndexIST, istDate, istMidnightUTC } from '@drm/domain';
import { siteControl } from './site';

/** Like-day forecast for `days` IST dates starting today, from the last 28 days of metered blocks. */
export async function loadForecast(siteId: string, days: string[] | number = 3) {
  const now = new Date();
  const today = istDate(now);
  const from = new Date(istMidnightUTC(today).getTime() - 28 * 86400000);
  const rows = await blockHistory(getDb().db, siteId, from);
  const byDay = new Map<string, Array<number | null>>();
  for (const r of rows) {
    const d = istDate(r.blockStart);
    const arr = byDay.get(d) ?? Array<number | null>(96).fill(null);
    arr[blockIndexIST(r.blockStart) - 1] = r.avgKva;
    byDay.set(d, arr);
  }
  const history: DayBlocks[] = [...byDay].filter(([d]) => d < today).map(([date, kva]) => ({ date, kva }));
  const todayBlocks: DayBlocks = { date: today, kva: byDay.get(today) ?? Array(96).fill(null) };
  const dates = Array.isArray(days)
    ? days
    : Array.from({ length: days }, (_, k) =>
        istDate(new Date(istMidnightUTC(today).getTime() + k * 86400000 + 3600000)),
      );
  const ctl = await siteControl(siteId);
  return { today, dates, todayBlocks, ctl, f: forecast(history, todayBlocks, dates, ctl.holidays) };
}
