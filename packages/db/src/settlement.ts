/**
 * Event settlement (M&V): baseline by the programme's method, delivered kW and kWh, ₹ value and tCO2, all
 * computed by @drm/domain (invariant 5). Reads 15-minute blocks written by the edge.
 */
import {
  type DaySeries,
  dayMatching,
  istDate,
  istMidnightUTC,
  preEvent,
  type Settlement,
  settle,
  type TariffSpec,
  xOfY,
} from '@drm/domain';
import { and, eq, gte, inArray, lt, max } from 'drizzle-orm';
import type { Db } from './client';
import * as s from './schema';

const DAY = 86400000;

export interface SettlementResult extends Settlement {
  eventId: string;
  method: string;
  factor: number | null;
  eligibleDays: string[];
  windowBlocks: number[];
  baselineKw: number[];
  actualKw: number[];
}

export class NotReady extends Error {}

export async function settleEvent(
  db: Db,
  eventId: string,
  ctx: { spec: TariffSpec; gridFactor: number; holidays: ReadonlySet<string> },
): Promise<SettlementResult> {
  const [e] = await db.select().from(s.drEvent).where(eq(s.drEvent.id, eventId));
  if (!e) throw new NotReady('no such event');
  if (!['completed', 'aborted'].includes(e.status)) throw new NotReady(`event is ${e.status}; settle after it ends`);
  const [prog] = await db.select().from(s.drProgram).where(eq(s.drProgram.id, e.programId));
  if (!prog) throw new NotReady('programme missing');

  const date = istDate(e.start);
  const mid = istMidnightUTC(date).getTime();
  const from = new Date(mid - 21 * DAY);
  const rows = await db
    .select({ t: s.block15m.blockStart, kwh: s.block15m.kwh, kva: s.block15m.avgKva })
    .from(s.block15m)
    .where(
      and(
        eq(s.block15m.siteId, e.siteId),
        gte(s.block15m.blockStart, from),
        lt(s.block15m.blockStart, new Date(mid + DAY)),
      ),
    );
  const byDay = new Map<string, { kw: Array<number | null>; kva: Array<number | null> }>();
  for (const r of rows) {
    const d = istDate(r.t);
    const k = Math.round((r.t.getTime() - istMidnightUTC(d).getTime()) / 900000);
    const v = byDay.get(d) ?? { kw: Array(96).fill(null), kva: Array(96).fill(null) };
    v.kw[k] = r.kwh * 4;
    v.kva[k] = r.kva;
    byDay.set(d, v);
  }
  const today = byDay.get(date);
  const startIdx = Math.round((e.start.getTime() - mid) / 900000);
  const endIdx = Math.round((e.end.getTime() - mid) / 900000);
  const win = Array.from({ length: endIdx - startIdx }, (_, k) => startIdx + k);
  if (!today || win.some((k) => today.kw[k] === null)) throw new NotReady('event window not fully metered yet');

  // Other event days and non-working days are not eligible baseline days.
  const others = await db
    .select({ start: s.drEvent.start })
    .from(s.drEvent)
    .where(
      and(
        eq(s.drEvent.siteId, e.siteId),
        gte(s.drEvent.start, from),
        inArray(s.drEvent.status, ['running', 'completed', 'aborted']),
      ),
    );
  const eventDays = new Set(others.map((o) => istDate(o.start)));
  const nonWorking = (d: string) => new Date(`${d}T00:00:00Z`).getUTCDay() === 0 || ctx.holidays.has(d);
  const like = nonWorking(date);
  const history: DaySeries[] = [...byDay]
    .filter(([d]) => d < date)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([d, v]) => ({
      date: d,
      values: v.kw.map((x) => x ?? 0),
      eligible: !eventDays.has(d) && nonWorking(d) === like && v.kw.filter((x) => x !== null).length >= 92,
    }));
  const eligibleDays = history.filter((h) => h.eligible).map((h) => h.date);
  const p = prog.baselineParams as {
    days?: number;
    adjust_hours_before?: number;
    cap?: number;
    x?: number;
    y?: number;
    count?: number;
  };
  const actualDay = today.kw.map((x) => x ?? 0);
  let baselineDay: number[];
  let factor: number | null = null;
  if (prog.baselineMethod === 'x_of_y')
    baselineDay = xOfY(history, p.x ?? 5, p.y ?? 10, { from: startIdx, to: endIdx });
  else if (prog.baselineMethod === 'pre_event') baselineDay = preEvent(actualDay, startIdx, p.count ?? 4, 96);
  else {
    // Adjustment window: the hours before the event, ending before any pre-conditioning so it cannot inflate the baseline.
    const lead = ((e.plan as { precondition?: { leadMin: number } | null }).precondition?.leadMin ?? 0) / 15;
    const adjEnd = Math.max(0, startIdx - lead);
    const adjStart = Math.max(0, adjEnd - (p.adjust_hours_before ?? 2) * 4);
    const r = dayMatching(history, p.days ?? 10, actualDay, { from: adjStart, to: adjEnd }, p.cap ?? 0.2);
    baselineDay = r.baseline;
    factor = r.factor;
  }
  const baselineKw = win.map((k) => baselineDay[k] ?? 0);
  const actualKw = win.map((k) => actualDay[k] ?? 0);
  const dayActualKva = today.kva.map((x) => x ?? 0);
  const dayBaselineKva = dayActualKva.map((v, k) => {
    if (k < startIdx || k >= endIdx) return v;
    const kw = today.kw[k] ?? 0;
    const ratio = kw > 0 ? v / kw : 1; // keep the block's own kVA/kW ratio
    return (baselineDay[k] ?? 0) * ratio;
  });
  const [md] = await db
    .select({ v: max(s.block15m.avgKva) })
    .from(s.block15m)
    .where(
      and(
        eq(s.block15m.siteId, e.siteId),
        gte(s.block15m.blockStart, istMidnightUTC(`${date.slice(0, 7)}-01`)),
        lt(s.block15m.blockStart, new Date(mid)),
      ),
    );
  const monthMdBeforeKva = md?.v ?? 0;
  const st = settle({
    baselineKw,
    actualKw,
    nominationKw: e.nominationKw ?? e.targetKw,
    gridFactor: ctx.gridFactor,
    dayActualKva,
    dayBaselineKva,
    monthMdBeforeKva,
    spec: ctx.spec,
    paymentInrPerKw: prog.paymentInrPerKw,
    penaltyInrPerKw: prog.penaltyInrPerKw,
  });
  const result: SettlementResult = {
    ...st,
    eventId,
    method: prog.baselineMethod,
    factor,
    eligibleDays,
    windowBlocks: win.map((k) => k + 1),
    baselineKw,
    actualKw,
  };
  const row = {
    method: prog.baselineMethod,
    baseline: { kw: baselineKw, factor, eligibleDays, blocks: result.windowBlocks },
    actual: { kw: actualKw, peakWithKva: st.peakWithKva, peakWithoutKva: st.peakWithoutKva, monthMdBeforeKva },
    deliveredKw: st.deliveredKw,
    deliveredKwh: st.deliveredKwh,
    performancePct: st.performancePct,
    valueInr: st.valueInr,
    avoidedTco2: st.avoidedTco2,
    computedAt: new Date(),
  };
  await db
    .insert(s.settlement)
    .values({ eventId, ...row })
    .onConflictDoUpdate({ target: s.settlement.eventId, set: row });
  return result;
}
