import { getDb, schema } from '@drm/db';
import { billAuditExcess, computeBill, type TariffSpec } from '@drm/domain';
import { asc, desc } from 'drizzle-orm';

/** Bills on file, each with the engine's recomputation beside it (invariant 5: maths only in packages/domain). */
export async function loadBills() {
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
  // Audit: compare each bill's kVAh per day with the latest bill that is not flagged as suspect.
  const days = (b: (typeof bills)[number]) =>
    Math.max(1, Math.round((new Date(b.periodTo).getTime() - new Date(b.periodFrom).getTime()) / 86400000));
  const normal = [...bills].reverse().find((b) => !b.note?.toLowerCase().includes('suspect'));
  const normalPerDay = normal ? normal.kvah / days(normal) : null;
  return {
    normalKvahPerDay: normalPerDay,
    normalFrom: normal?.label ?? null,
    bills: bills.map((b) => {
      const ls = lines.filter((l) => l.billId === b.id);
      const fuel = ls.find((l) => l.kind === 'fuel_adj')?.amount ?? 0;
      return {
        ...b,
        days: days(b),
        lines: ls,
        recomputed: spec
          ? computeBill({ kvah: b.kvah, mdKva: b.billedKva, months: b.months, fuelAdj: fuel }, spec)
          : null,
        audit:
          spec && normalPerDay && b.id !== normal?.id ? billAuditExcess(b.kvah, days(b), normalPerDay, spec) : null,
      };
    }),
    billedDemand: demand,
  };
}

export type BillsData = Awaited<ReturnType<typeof loadBills>>;
