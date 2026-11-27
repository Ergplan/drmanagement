import { getDb, schema } from '@drm/db';
import { eq } from 'drizzle-orm';
import { getHandler, SITE_ID } from '@/lib/api';

export const dynamic = 'force-dynamic';

export const GET = getHandler(async () => ({
  opportunities: await getDb().db.select().from(schema.opportunity).where(eq(schema.opportunity.siteId, SITE_ID)),
}));
