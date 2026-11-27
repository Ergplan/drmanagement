import { getDb, schema } from '@drm/db';
import { eq } from 'drizzle-orm';
import { getHandler, SITE_ID } from '@/lib/api';

export const dynamic = 'force-dynamic';

export const GET = getHandler(async () => {
  const { db } = getDb();
  const nodes = await db.select().from(schema.node).where(eq(schema.node.siteId, SITE_ID));
  const points = await db.select().from(schema.point);
  return nodes.map((n) => ({ ...n, points: points.filter((p) => p.nodeId === n.id) }));
});
