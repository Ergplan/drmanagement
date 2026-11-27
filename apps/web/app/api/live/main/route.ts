import { getDb, schema } from '@drm/db';
import { blockStartIST, istDate, istMidnightUTC } from '@drm/domain';
import { and, asc, eq, gte } from 'drizzle-orm';
import { getHandler, SITE_ID } from '@/lib/api';
import { siteControl } from '@/lib/site';

export const dynamic = 'force-dynamic';

/** Latest main-meter snapshot from the edge, ceiling state, and today's IST blocks. */
export const GET = getHandler(async () => {
  const { db } = getDb();
  const [device] = await db.select().from(schema.device).where(eq(schema.device.siteId, SITE_ID)).limit(1);
  const [ceiling] = await db.select().from(schema.ceilingState).where(eq(schema.ceilingState.siteId, SITE_ID));
  const now = new Date();
  const dayStart = istMidnightUTC(istDate(now));
  const blocks = await db
    .select({
      blockStart: schema.block15m.blockStart,
      blockNo: schema.block15m.blockNo,
      kwh: schema.block15m.kwh,
      kvah: schema.block15m.kvah,
      avgKva: schema.block15m.avgKva,
      solarKwh: schema.block15m.solarKwh,
      source: schema.block15m.source,
    })
    .from(schema.block15m)
    .where(and(eq(schema.block15m.siteId, SITE_ID), gte(schema.block15m.blockStart, dayStart)))
    .orderBy(asc(schema.block15m.blockStart));
  const health = (device?.health ?? null) as { live?: Record<string, unknown> | null } | null;
  const live = health?.live ?? null;
  const lastSeen = device?.lastSeen ?? null;
  const ageS = lastSeen ? (now.getTime() - new Date(lastSeen).getTime()) / 1000 : null;
  return {
    live,
    edge: {
      lastSeen,
      ageS,
      online: ageS !== null && ageS < 60,
      version: (health as { version?: string } | null)?.version ?? null,
    },
    ceiling: ceiling ?? null,
    ladder: (await siteControl(SITE_ID)).ladder,
    currentBlockStart: blockStartIST(now).toISOString(),
    blocks,
    simulated: (live as { source?: string } | null)?.source === 'sim' || blocks.some((b) => b.source === 'sim'),
  };
});
