import { getHandler, SITE_ID } from '@/lib/api';
import { loadForecast } from '@/lib/forecast-data';
import { tariffSpec } from '@/lib/site';

export const dynamic = 'force-dynamic';

/** 48-hour grid-demand forecast (today + 2 days) from like days, with today's metered blocks. */
export const GET = getHandler(async () => {
  const { today, dates, todayBlocks, ctl, f } = await loadForecast(SITE_ID, 3);
  const t = await tariffSpec(SITE_ID);
  return {
    today,
    dates,
    actual: todayBlocks.kva,
    blocks: f.blocks,
    likeDays: f.likeDays,
    adjustment: f.adjustment,
    peak: f.peak,
    exceedCeilingPct: f.exceedProbability(ctl.ladder.ceiling) * 100,
    exceedStage1Pct: f.exceedProbability(ctl.ladder.stage1) * 100,
    ladder: ctl.ladder,
    floorKva: t.floorKva,
    sanctionKva: t.sanctionKva,
    method:
      'Like-day average (working day vs Sunday/holiday, last 8 like days), same-day level adjustment ±10%, P10/P90 from like-day spread',
  };
});
