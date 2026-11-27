import { getDb, schema } from '@drm/db';
import { asc, eq } from 'drizzle-orm';
import { getHandler, SITE_ID } from '@/lib/api';

export const dynamic = 'force-dynamic';

/** Daily solar yield and energy, all stored days (Solar & backup, Reports). */
export const GET = getHandler(async () => {
  const { db } = getDb();
  const days = await db
    .select({
      day: schema.day1d.day,
      solarKwh: schema.day1d.solarKwh,
      kwh: schema.day1d.kwh,
      kvah: schema.day1d.kvah,
      mdKva: schema.day1d.mdKva,
      costInr: schema.day1d.costInr,
    })
    .from(schema.day1d)
    .where(eq(schema.day1d.siteId, SITE_ID))
    .orderBy(asc(schema.day1d.day));
  const [site] = await db.select().from(schema.site).where(eq(schema.site.id, SITE_ID));
  const facts = (site?.facts ?? {}) as {
    solar?: { capacity_kwp?: number };
    emissions?: { grid_factor_tco2_per_mwh?: number };
  };
  return {
    days,
    kwp: facts.solar?.capacity_kwp ?? null,
    gridFactor: facts.emissions?.grid_factor_tco2_per_mwh ?? null,
  };
});
