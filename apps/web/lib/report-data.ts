import { type EventView, getDb, listEvents, NotReady, schema, settleEvent } from '@drm/db';
import { istMidnightUTC } from '@drm/domain';
import { and, asc, desc, eq, gte, lt } from 'drizzle-orm';
import { loadBills } from './bills';
import { siteControl, tariffSpec } from './site';

export interface SiteFacts {
  name: string;
  beds: number | null;
  gridFactor: number | null;
  benchmarks: {
    kwh_per_bed_year: { low: number; high: number };
    kwh_per_m2_year: { low: number; high: number };
    source: string;
  } | null;
  occupancyPct: number | null;
}

export async function siteFacts(siteId: string): Promise<SiteFacts> {
  const { db } = getDb();
  const [s] = await db.select().from(schema.site).where(eq(schema.site.id, siteId));
  const f = (s?.facts ?? {}) as {
    emissions?: { grid_factor_tco2_per_mwh: number };
    benchmarks?: SiteFacts['benchmarks'];
  };
  return {
    name: s?.name ?? siteId,
    beds: s?.beds ?? null,
    gridFactor: f.emissions?.grid_factor_tco2_per_mwh ?? null,
    benchmarks: f.benchmarks ?? null,
    occupancyPct: null,
  };
}

/** Settlement for an ended event: stored row if present, else computed now. Null with a reason if not ready. */
export async function eventSettlement(siteId: string, eventId: string, recompute = false) {
  const { db } = getDb();
  if (!recompute) {
    const [row] = await db.select().from(schema.settlement).where(eq(schema.settlement.eventId, eventId));
    if (row) return { ready: true as const, stored: row, why: null };
  }
  try {
    const t = await tariffSpec(siteId);
    const facts = await siteFacts(siteId);
    const ctl = await siteControl(siteId);
    await settleEvent(db, eventId, { spec: t.spec, gridFactor: facts.gridFactor ?? 0, holidays: ctl.holidays });
    const [row] = await db.select().from(schema.settlement).where(eq(schema.settlement.eventId, eventId));
    return { ready: true as const, stored: row!, why: null };
  } catch (e) {
    if (e instanceof NotReady) return { ready: false as const, stored: null, why: e.message };
    throw e;
  }
}

/** True when the latest metered day came from the simulator (invariant 6: reports carry the badge too). */
export async function isSimulated(siteId: string): Promise<boolean> {
  const [d] = await getDb()
    .db.select({ s: schema.day1d.source })
    .from(schema.day1d)
    .where(eq(schema.day1d.siteId, siteId))
    .orderBy(desc(schema.day1d.day))
    .limit(1);
  return d?.s === 'sim';
}

const monthRange = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  const next = `${m === 12 ? (y ?? 0) + 1 : y}-${String(m === 12 ? 1 : (m ?? 0) + 1).padStart(2, '0')}`;
  return {
    from: istMidnightUTC(`${month}-01`),
    to: istMidnightUTC(`${next}-01`),
    firstDay: `${month}-01`,
    nextFirstDay: `${next}-01`,
  };
};

export async function monthlyData(siteId: string, month: string) {
  const { db } = getDb();
  const { from, to, firstDay, nextFirstDay } = monthRange(month);
  const days = await db
    .select()
    .from(schema.day1d)
    .where(and(eq(schema.day1d.siteId, siteId), gte(schema.day1d.day, firstDay), lt(schema.day1d.day, nextFirstDay)))
    .orderBy(asc(schema.day1d.day));
  const inMonth = days;
  const peaks = await db
    .select({ t: schema.block15m.blockStart, kva: schema.block15m.avgKva })
    .from(schema.block15m)
    .where(
      and(
        eq(schema.block15m.siteId, siteId),
        gte(schema.block15m.blockStart, from),
        lt(schema.block15m.blockStart, to),
      ),
    )
    .orderBy(desc(schema.block15m.avgKva))
    .limit(1);
  const events = (await listEvents(db, siteId, 200)).filter(
    (e) => e.start >= from.toISOString() && e.start < to.toISOString(),
  );
  const settlements = await Promise.all(events.map(async (e) => ({ e, s: await eventSettlement(siteId, e.id) })));
  const ceiling = await db
    .select()
    .from(schema.ceilingAction)
    .where(
      and(eq(schema.ceilingAction.siteId, siteId), gte(schema.ceilingAction.at, from), lt(schema.ceilingAction.at, to)),
    );
  const trips = await db
    .select()
    .from(schema.interlockEvent)
    .where(and(gte(schema.interlockEvent.at, from), lt(schema.interlockEvent.at, to)));
  const opps = await db.select().from(schema.opportunity).where(eq(schema.opportunity.siteId, siteId));
  const t = await tariffSpec(siteId);
  const ctl = await siteControl(siteId);
  const facts = await siteFacts(siteId);
  const sum = (k: 'kwh' | 'kvah' | 'solarKwh') => inMonth.reduce((a, d) => a + d[k], 0);
  return {
    month,
    simulated: inMonth.some((x) => x.source === 'sim'),
    site: facts,
    ladder: ctl.ladder,
    floorKva: t.floorKva,
    days: inMonth.map((d) => ({
      day: d.day,
      kwh: d.kwh,
      kvah: d.kvah,
      solarKwh: d.solarKwh,
      mdKva: d.mdKva,
      costInr: d.costInr,
    })),
    totals: {
      kwh: sum('kwh'),
      kvah: sum('kvah'),
      solarKwh: sum('solarKwh'),
      costInr: inMonth.reduce((a, d) => a + (d.costInr ?? 0), 0),
      daysMetered: inMonth.length,
    },
    peak: peaks[0] ? { at: peaks[0].t.toISOString(), kva: peaks[0].kva } : null,
    events: settlements.map(({ e, s }) => ({ event: e, settlement: s.stored, why: s.why })),
    ceiling: {
      stages: ceiling.filter((c) => c.kind === 'shed').length,
      pages: ceiling.filter((c) => c.kind === 'page').length,
      maxStage: Math.max(0, ...ceiling.map((c) => c.stage)),
    },
    interlocks: {
      trips: trips
        .filter((x) => x.state === 'tripped')
        .map((x) => ({ at: x.at.toISOString(), id: x.interlockId, value: x.value })),
      stale: trips.filter((x) => x.state === 'stale').length,
    },
    opportunities: opps,
  };
}

export async function weeklyData(siteId: string, toIso: string) {
  const { db } = getDb();
  const to = new Date(toIso);
  const from = new Date(to.getTime() - 7 * 86400000);
  const commands = await db
    .select()
    .from(schema.command)
    .where(and(eq(schema.command.siteId, siteId), gte(schema.command.sentAt, from), lt(schema.command.sentAt, to)))
    .orderBy(asc(schema.command.sentAt));
  const ceiling = await db
    .select()
    .from(schema.ceilingAction)
    .where(
      and(eq(schema.ceilingAction.siteId, siteId), gte(schema.ceilingAction.at, from), lt(schema.ceilingAction.at, to)),
    )
    .orderBy(asc(schema.ceilingAction.at));
  const trips = await db
    .select()
    .from(schema.interlockEvent)
    .where(and(gte(schema.interlockEvent.at, from), lt(schema.interlockEvent.at, to)))
    .orderBy(asc(schema.interlockEvent.at));
  const audit = await db
    .select()
    .from(schema.auditLog)
    .where(and(gte(schema.auditLog.at, from), lt(schema.auditLog.at, to)))
    .orderBy(asc(schema.auditLog.at));
  const events = (await listEvents(db, siteId, 100)).filter(
    (e) => e.start >= from.toISOString() && e.start < to.toISOString(),
  );
  return {
    simulated: await isSimulated(siteId),
    from: from.toISOString(),
    to: to.toISOString(),
    commands,
    ceiling,
    trips,
    audit,
    events,
    ladder: (await siteControl(siteId)).ladder,
    site: await siteFacts(siteId),
  };
}

export async function eventData(
  siteId: string,
  eventId: string,
): Promise<{
  event: EventView | null;
  settlement: Awaited<ReturnType<typeof eventSettlement>> | null;
  site: SiteFacts;
  simulated: boolean;
}> {
  const ev = (await listEvents(getDb().db, siteId, 500)).find((e) => e.id === eventId) ?? null;
  return {
    event: ev,
    settlement: ev ? await eventSettlement(siteId, eventId) : null,
    site: await siteFacts(siteId),
    simulated: await isSimulated(siteId),
  };
}

export async function billAuditData(siteId: string) {
  return { bills: await loadBills(), site: await siteFacts(siteId), t: await tariffSpec(siteId) };
}
