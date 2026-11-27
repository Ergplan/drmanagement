import { getDb, schema } from '@drm/db';
import { billingDemandKva, istDate, istMidnightUTC, marginalRatePerKvah } from '@drm/domain';
import { and, asc, eq, gte } from 'drizzle-orm';
import { getHandler, SITE_ID } from '@/lib/api';
import { LADDER, tariffSpec } from '@/lib/site';

export const dynamic = 'force-dynamic';

/** Everything the Overview tiles need, computed from stored blocks with packages/domain (invariant 5). */
export const GET = getHandler(async () => {
  const { db } = getDb();
  const now = new Date();
  const today = istDate(now);
  const monthStart = istMidnightUTC(`${today.slice(0, 7)}-01`);
  const dayStart = istMidnightUTC(today);
  const yStart = new Date(dayStart.getTime() - 86400000);
  const t = await tariffSpec(SITE_ID);
  const blocks = await db
    .select()
    .from(schema.block15m)
    .where(and(eq(schema.block15m.siteId, SITE_ID), gte(schema.block15m.blockStart, monthStart)))
    .orderBy(asc(schema.block15m.blockStart));
  const yBlocks = await db
    .select()
    .from(schema.block15m)
    .where(and(eq(schema.block15m.siteId, SITE_ID), gte(schema.block15m.blockStart, yStart)))
    .orderBy(asc(schema.block15m.blockStart));
  const todayBlocks = blocks.filter((b) => b.blockStart >= dayStart);
  const ydayBlocks = yBlocks.filter((b) => b.blockStart < dayStart);
  const sum = (xs: typeof blocks, k: 'kwh' | 'kvah' | 'solarKwh') => xs.reduce((a, b) => a + b[k], 0);
  const monthMd = blocks.reduce((m, b) => Math.max(m, b.avgKva), 0);
  const monthMdBlock = blocks.find((b) => b.avgKva === monthMd) ?? null;
  const rate = marginalRatePerKvah(t.spec);
  const [ceiling] = await db.select().from(schema.ceilingState).where(eq(schema.ceilingState.siteId, SITE_ID));
  const [device] = await db.select().from(schema.device).where(eq(schema.device.siteId, SITE_ID)).limit(1);
  const live = ((device?.health ?? null) as { live?: Record<string, number | string> } | null)?.live ?? null;
  return {
    now: now.toISOString(),
    live,
    sanctionKva: t.sanctionKva,
    floorKva: t.floorKva,
    ladder: LADDER,
    ceiling: ceiling ?? null,
    today: {
      kwh: sum(todayBlocks, 'kwh'),
      kvah: sum(todayBlocks, 'kvah'),
      solarKwh: sum(todayBlocks, 'solarKwh'),
      costInr: sum(todayBlocks, 'kvah') * rate,
      peakKva: todayBlocks.reduce((m, b) => Math.max(m, b.avgKva), 0),
      blocks: todayBlocks.length,
    },
    yesterday: {
      kwh: sum(ydayBlocks, 'kwh'),
      solarKwh: sum(ydayBlocks, 'solarKwh'),
      costInr: sum(ydayBlocks, 'kvah') * rate,
      peakKva: ydayBlocks.reduce((m, b) => Math.max(m, b.avgKva), 0),
    },
    month: {
      mdKva: monthMd,
      mdAt: monthMdBlock?.blockStart ?? null,
      billingDemandKva: billingDemandKva(monthMd, t.spec),
    },
    ratePerKvah: rate,
    simulated: blocks.some((b) => b.source === 'sim'),
  };
});
