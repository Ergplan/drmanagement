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

export interface SiteControl {
  ladder: { stage1: number; stage2: number; stage3: number; ceiling: number; sanction: number };
  drWindow: { start: string; end: string; targetKw: number };
  armBy: string;
  holidays: Set<string>;
}

/** Ceiling ladder, DR defaults and holidays from reference/control.yaml and operations.yaml, as seeded. */
export async function siteControl(siteId: string): Promise<SiteControl> {
  const { db } = getDb();
  const [row] = await db
    .select({ facts: schema.site.facts })
    .from(schema.site)
    .where(eq(schema.site.id, siteId))
    .limit(1);
  const f = (row?.facts ?? {}) as {
    control?: {
      ceiling: {
        ceiling_kva: number;
        sanction_kva: number;
        stages: Array<{ stage: number; trigger_projected_kva: number }>;
      };
      dr_event: { lapse_if_not_armed_by: string; default_window: { start: string; end: string; target_kw: number } };
    };
    holidays?: string[];
  };
  if (!f.control) throw new Error('site control rules not seeded; run the seed');
  const st = (n: number) => f.control?.ceiling.stages.find((x) => x.stage === n)?.trigger_projected_kva ?? Number.NaN;
  const w = f.control.dr_event.default_window;
  return {
    ladder: {
      stage1: st(1),
      stage2: st(2),
      stage3: st(3),
      ceiling: f.control.ceiling.ceiling_kva,
      sanction: f.control.ceiling.sanction_kva,
    },
    drWindow: { start: w.start, end: w.end, targetKw: w.target_kw },
    armBy: f.control.dr_event.lapse_if_not_armed_by,
    holidays: new Set(f.holidays ?? []),
  };
}
