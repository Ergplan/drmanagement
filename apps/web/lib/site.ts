import { getDb, schema } from '@drm/db';
import type { TariffSpec } from '@drm/domain';
import { desc, eq } from 'drizzle-orm';

/** Tariff spec for the domain engine from the database (single source: tariff + connection rows). */
export async function tariffSpec(siteId: string): Promise<{ spec: TariffSpec; sanctionKva: number; floorKva: number }> {
  const { db } = getDb();
  const [c] = await db.select().from(schema.connection).where(eq(schema.connection.siteId, siteId)).limit(1);
  const [t] = await db.select().from(schema.tariff).orderBy(desc(schema.tariff.validFrom)).limit(1);
  if (!c || !t) throw new Error('tariff or connection missing');
  return {
    spec: {
      energyRatePerKvah: t.energyRatePerKvah,
      demandRatePerKvaMonth: t.demandRatePerKvaMonth,
      dutyPct: t.dutyPct,
      contractedKva: c.sanctionedKva,
      floorPct: t.floorPct,
      excessSurcharge: t.excessSurcharge,
    },
    sanctionKva: c.sanctionedKva,
    floorKva: c.billingFloorKva,
  };
}

/** Ceiling ladder from reference/control.yaml as seeded (kept here until Stage 4 stores it). */
export const LADDER = { stage1: 520, stage2: 545, stage3: 565, ceiling: 570 } as const;
