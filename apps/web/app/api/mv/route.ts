import { getDb, listEvents, schema } from '@drm/db';
import { and, desc, eq } from 'drizzle-orm';
import { getHandler, SITE_ID } from '@/lib/api';
import { siteFacts } from '@/lib/report-data';

export const dynamic = 'force-dynamic';

/** Reports & M&V: last-30-day intensity against benchmarks, emissions, the M&V method and every settled event. */
export const GET = getHandler(async () => {
  const { db } = getDb();
  const days = await db
    .select()
    .from(schema.day1d)
    .where(eq(schema.day1d.siteId, SITE_ID))
    .orderBy(desc(schema.day1d.day))
    .limit(30);
  const facts = await siteFacts(SITE_ID);
  const [prog] = await db
    .select()
    .from(schema.drProgram)
    .where(and(eq(schema.drProgram.siteId, SITE_ID), eq(schema.drProgram.active, true)));
  const events = await listEvents(db, SITE_ID, 100);
  const settlements = await db.select().from(schema.settlement);
  const grid = days.reduce((a, d) => a + d.kwh, 0);
  const solar = days.reduce((a, d) => a + d.solarKwh, 0);
  const n = days.length;
  return {
    days: n,
    gridKwh: grid,
    solarKwh: solar,
    beds: facts.beds,
    perBedYearKwh: facts.beds && n ? ((grid + solar) / facts.beds / n) * 365 : null,
    benchmarks: facts.benchmarks,
    gridFactor: facts.gridFactor,
    gridTco2: facts.gridFactor !== null ? (grid / 1000) * facts.gridFactor : null,
    solarAvoidedTco2: facts.gridFactor !== null ? (solar / 1000) * facts.gridFactor : null,
    simulated: days.some((d) => d.source === 'sim'),
    programme: prog
      ? { name: prog.name, method: prog.baselineMethod, params: prog.baselineParams, noticeMin: prog.noticeMin }
      : null,
    events: events.map((e) => {
      const s = settlements.find((x) => x.eventId === e.id);
      return {
        id: e.id,
        start: e.start,
        end: e.end,
        status: e.status,
        targetKw: e.targetKw,
        settlement: s
          ? {
              deliveredKw: s.deliveredKw,
              deliveredKwh: s.deliveredKwh,
              performancePct: s.performancePct,
              valueInr: s.valueInr,
              avoidedTco2: s.avoidedTco2,
            }
          : null,
      };
    }),
  };
});
