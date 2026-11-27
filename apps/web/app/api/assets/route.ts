import { getDb, schema } from '@drm/db';
import { eq } from 'drizzle-orm';
import { getHandler, SITE_ID } from '@/lib/api';

export const dynamic = 'force-dynamic';

export const GET = getHandler(async () => {
  const { db } = getDb();
  const assets = await db.select().from(schema.asset).where(eq(schema.asset.siteId, SITE_ID));
  const equipment = await db.select().from(schema.equipment);
  return assets.map((a) => ({ ...a, equipment: equipment.filter((e) => e.assetId === a.id) }));
});
