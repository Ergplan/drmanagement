import { getDb, schema } from '@drm/db';
import { computeBill, type TariffSpec } from '@drm/domain';
import { asc, desc } from 'drizzle-orm';
import { getHandler } from '@/lib/api';

export const dynamic = 'force-dynamic';

/** Bills on file, each with the engine's recomputation beside it (invariant 5: maths only in packages/domain). */
export const GET = getHandler(async () => {
  const { db } = getDb();
  const [t] = await db.select().from(schema.tariff).orderBy(desc(schema.tariff.validFrom)).limit(1);
  const [c] = await db.select().from(schema.connection).limit(1);
  const bills = await db.select().from(schema.bill).orderBy(asc(schema.bill.periodTo));
  const lines = await db.select().from(schema.billLine);
  const demand = await db.select().from(schema.billedDemandMonth).orderBy(asc(schema.billedDemandMonth.month));
  const spec: TariffSpec | null =
    t && c
      ? {
          energyRatePerKvah: t.energyRatePerKvah,
          demandRatePerKvaMonth: t.demandRatePerKvaMonth,
          dutyPct: t.dutyPct,
          contractedKva: c.sanctionedKva,
          floorPct: t.floorPct,
          excessSurcharge: t.excessSurcharge,
        }
      : null;
  return {
    bills: bills.map((b) => {
      const ls = lines.filter((l) => l.billId === b.id);
      const fuel = ls.find((l) => l.kind === 'fuel_adj')?.amount ?? 0;
      return {
        ...b,
        lines: ls,
        recomputed: spec
          ? computeBill({ kvah: b.kvah, mdKva: b.billedKva, months: b.months, fuelAdj: fuel }, spec)
          : null,
      };
    }),
    billedDemand: demand,
  };
});
