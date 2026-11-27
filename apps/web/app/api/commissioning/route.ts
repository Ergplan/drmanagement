import { getDb, latestReadings, schema } from '@drm/db';
import { eq } from 'drizzle-orm';
import { getHandler, SITE_ID } from '@/lib/api';
import { edgeOverrides } from '@/lib/commissioning';

export const dynamic = 'force-dynamic';

/** Every point with its node, the driver it is mapped to, and what the edge last reported for it. */
export const GET = getHandler(async () => {
  const { db } = getDb();
  const nodes = await db.select().from(schema.node).where(eq(schema.node.siteId, SITE_ID));
  const points = await db.select().from(schema.point);
  const latest = new Map((await latestReadings(db, 60)).map((r) => [r.pointId, r]));
  const now = Date.now();
  const rows = points
    .filter((p) => nodes.some((n) => n.id === p.nodeId))
    .map((p) => {
      const n = nodes.find((x) => x.id === p.nodeId)!;
      const l = latest.get(p.id);
      return {
        id: p.id,
        node: n.title,
        nodeId: n.id,
        drClass: n.drClass,
        unit: p.unit,
        driverLater: n.driverLater,
        sourceDriver: p.sourceDriver,
        deviceRef: p.deviceRef,
        value: l?.value ?? null,
        source: l?.source ?? null,
        quality: l?.quality ?? null,
        ageS: l ? Math.round((now - l.ts.getTime()) / 1000) : null,
      };
    });
  return { points: rows, yaml: edgeOverrides(rows) };
});
