import { getDb, schema } from '@drm/db';
import { eq } from 'drizzle-orm';
import { getHandler, SITE_ID } from '@/lib/api';

export const dynamic = 'force-dynamic';

export const GET = getHandler(async () => {
  const { db } = getDb();
  const [site] = await db.select().from(schema.site).where(eq(schema.site.id, SITE_ID));
  const [connection] = await db.select().from(schema.connection).where(eq(schema.connection.siteId, SITE_ID));
  const floors = await db
    .select()
    .from(schema.floor)
    .where(eq(schema.floor.siteId, SITE_ID))
    .orderBy(schema.floor.level);
  return { site, connection, floors };
});
