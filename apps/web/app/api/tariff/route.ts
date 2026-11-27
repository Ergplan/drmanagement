import { getDb, schema } from '@drm/db';
import { desc } from 'drizzle-orm';
import { getHandler } from '@/lib/api';

export const dynamic = 'force-dynamic';

export const GET = getHandler(async () => {
  const { db } = getDb();
  return db.select().from(schema.tariff).orderBy(desc(schema.tariff.validFrom));
});
