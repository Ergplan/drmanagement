/**
 * Read-only tools for Ask ergOS (invariant 8). Each returns data plus the dashboard screen that shows it.
 * There is deliberately no tool that writes anything.
 */
import { flexAssets, getDb, latestReadings, listEvents, schema } from '@drm/db';
import { desc, eq } from 'drizzle-orm';
import { SITE_ID } from '../api';
import { loadBills } from '../bills';
import { loadForecast } from '../forecast-data';
import { siteFacts } from '../report-data';
import { siteControl, tariffSpec } from '../site';

export interface ToolDef {
  name: string;
  description: string;
  input_schema: { type: 'object'; properties: Record<string, unknown>; required?: string[] };
  run: (input: Record<string, unknown>) => Promise<unknown>;
}

const r1 = (v: unknown) => (typeof v === 'number' ? Math.round(v * 10) / 10 : v);

async function deviceLive() {
  const { db } = getDb();
  const [d] = await db.select().from(schema.device).where(eq(schema.device.siteId, SITE_ID)).limit(1);
  const h = (d?.health ?? {}) as { live?: Record<string, unknown> & { control?: unknown } };
  return { live: h.live ?? null, lastSeen: d?.lastSeen ?? null };
}

export const TOOLS: ToolDef[] = [
  {
    name: 'live_now',
    description:
      'Live site demand now: kVA, kW, power factor, solar kW, projected 15-minute block kVA, month peak (MD) so far, today kWh/kVAh/cost, hot-water store charge, data source, and the ceiling ladder.',
    input_schema: { type: 'object', properties: {} },
    run: async () => {
      const { live, lastSeen } = await deviceLive();
      const ctl = await siteControl(SITE_ID);
      const l = (live ?? {}) as Record<string, unknown>;
      return {
        screen: 'Overview / Live energy',
        lastSeen,
        ladder: ctl.ladder,
        ...Object.fromEntries(
          Object.entries(l)
            .filter(([k]) => k !== 'control')
            .map(([k, v]) => [k, r1(v)]),
        ),
      };
    },
  },
  {
    name: 'demand_forecast',
    description:
      'Grid-demand forecast for today and the next two days: peak P50/P90 per day with time, and the chance of passing the 570 kVA ceiling and the Stage 1 trigger.',
    input_schema: { type: 'object', properties: {} },
    run: async () => {
      const { dates, ctl, f } = await loadForecast(SITE_ID, 3);
      const peaks = dates.map((d) => {
        const bs = f.blocks.filter((b) => b.date === d);
        const p = bs.reduce((m, b) => (b.p50 > m.p50 ? b : m), bs[0]!);
        return { date: d, blockNo: p.blockNo, p50: r1(p.p50), p90: r1(p.p90) };
      });
      return {
        screen: 'Demand forecast',
        peaks,
        chancePassCeilingPct: r1(f.exceedProbability(ctl.ladder.ceiling) * 100),
        chancePassStage1Pct: r1(f.exceedProbability(ctl.ladder.stage1) * 100),
        ladder: ctl.ladder,
        method: 'like days, same-day adjustment',
      };
    },
  },
  {
    name: 'summer_risk',
    description:
      'Summer peak risk against the 600 kVA sanction: billed demand by month from the bills (June to September billed values), the ceiling ladder and what the demand ceiling does.',
    input_schema: { type: 'object', properties: {} },
    run: async () => {
      const b = await loadBills();
      const ctl = await siteControl(SITE_ID);
      return {
        screen: 'Demand ceiling / Tariffs & cost',
        billedDemandByMonth: b.billedDemand,
        ladder: ctl.ladder,
        note: 'The edge ceiling sheds non-clinical load in stages so no 15-minute block passes the ceiling; in the simulated hot June evening the uncontrolled peak was 635 kVA and 561 kVA with the ceiling (Stage 4 report).',
      };
    },
  },
  {
    name: 'bills_and_audit',
    description:
      'Electricity bills on file with kVAh, billed kVA, totals, the engine recomputation, and the audit of each bill against normal daily use (e.g. the October 2026 dispute).',
    input_schema: { type: 'object', properties: {} },
    run: async () => {
      const b = await loadBills();
      return {
        screen: 'Tariffs & cost',
        normalKvahPerDay: r1(b.normalKvahPerDay),
        normalFrom: b.normalFrom,
        bills: b.bills.map((x) => ({
          label: x.label,
          from: x.periodFrom,
          to: x.periodTo,
          days: x.days,
          kvah: x.kvah,
          kvahPerDay: r1(x.kvah / x.days),
          billedKva: x.billedKva,
          total: x.total,
          engineTotal: r1(x.recomputed?.total ?? null),
          note: x.note,
          audit: x.audit
            ? { excessKvah: r1(x.audit.excessKvah), excessInr: r1(x.audit.excessInr), ratio: r1(x.audit.ratio) }
            : null,
        })),
      };
    },
  },
  {
    name: 'tariff',
    description:
      'Tariff in force: energy rate per kVAh, demand charge per kVA-month, duty, sanctioned load and billing floor.',
    input_schema: { type: 'object', properties: {} },
    run: async () => {
      const t = await tariffSpec(SITE_ID);
      return { screen: 'Tariffs & cost', ...t.spec, sanctionKva: t.sanctionKva, floorKva: t.floorKva };
    },
  },
  {
    name: 'hot_water',
    description:
      'Hot-water store and heat pumps now: store charge %, top/bottom/outlet temperatures, heat-pump kW, state and COP, and the heat-pump schedule mode at the edge.',
    input_schema: { type: 'object', properties: {} },
    run: async () => {
      const ids = [
        'hw-tanks.soc_pct',
        'hw-tanks.top_c',
        'hw-tanks.bottom_c',
        'hw-tanks.outlet_c',
        'heatpumps.kw',
        'heatpumps.state',
        'heatpumps.cop',
      ];
      const rows = (await latestReadings(getDb().db)).map((x) => ({
        pointId: x.pointId,
        value: x.value,
        ts: x.ts,
        source: x.source,
      }));
      const latest: Record<string, unknown> = {};
      for (const id of ids) {
        const r = rows.find((x) => x.pointId === id);
        latest[id] = r ? { value: r1(r.value), at: r.ts, source: r.source } : null;
      }
      const { live } = await deviceLive();
      return {
        screen: 'HVAC & heat pumps',
        points: latest,
        heatPumpMode: (live?.control as { heatPump?: unknown } | undefined)?.heatPump ?? null,
      };
    },
  },
  {
    name: 'safety_and_control',
    description:
      'Edge control state: the nine clinical interlocks with values, whether commands are allowed, loads currently held (curtailed) and by whom, the ceiling stage, and running DR intents.',
    input_schema: { type: 'object', properties: {} },
    run: async () => {
      const { live, lastSeen } = await deviceLive();
      const { db } = getDb();
      const [c] = await db.select().from(schema.ceilingState).where(eq(schema.ceilingState.siteId, SITE_ID));
      return {
        screen: 'Clinical safety / Demand ceiling',
        lastSeen,
        control: live?.control ?? null,
        ceiling: c ?? null,
      };
    },
  },
  {
    name: 'flexibility',
    description:
      'Every load with its DR class (flexible, conditional, protected, critical), the kW it can give at the evening peak this season, longest hold and rebound.',
    input_schema: { type: 'object', properties: {} },
    run: async () => {
      const month = Number(new Date(Date.now() + 330 * 60000).toISOString().slice(5, 7));
      const a = await flexAssets(getDb().db, SITE_ID, month);
      return {
        screen: 'Load flexibility',
        month,
        assets: a,
        totalFlexKw: a
          .filter((x) => x.drClass === 'flexible' || x.drClass === 'conditional')
          .reduce((s, x) => s + x.flexKw, 0),
      };
    },
  },
  {
    name: 'dr_events',
    description:
      'DR events (latest first): window, target, status, approvals and, when settled, delivered kW, performance and value.',
    input_schema: {
      type: 'object',
      properties: { limit: { type: 'number', description: 'how many events, default 10' } },
    },
    run: async (i) => {
      const { db } = getDb();
      const ev = await listEvents(db, SITE_ID, Math.min(30, Number(i.limit ?? 10)));
      const st = await db.select().from(schema.settlement);
      return {
        screen: 'Dispatch plan / Reports & M&V',
        events: ev.map((e) => ({
          id: e.id,
          start: e.start,
          end: e.end,
          status: e.status,
          targetKw: e.targetKw,
          plannedKw: e.plan.expectedKw,
          loads: e.plan.actions.map((a) => a.assetId),
          approvals: e.approvals.map((a) => `${a.decision} by ${a.role}`),
          settlement: st.find((s) => s.eventId === e.id) ?? null,
        })),
      };
    },
  },
  {
    name: 'site_facts',
    description:
      'Site facts: name, beds, solar kWp, grid emission factor, energy benchmarks per bed, and the last 30 days of daily energy totals.',
    input_schema: { type: 'object', properties: {} },
    run: async () => {
      const f = await siteFacts(SITE_ID);
      const { db } = getDb();
      const days = await db
        .select()
        .from(schema.day1d)
        .where(eq(schema.day1d.siteId, SITE_ID))
        .orderBy(desc(schema.day1d.day))
        .limit(30);
      const grid = days.reduce((s, d) => s + d.kwh, 0);
      const solar = days.reduce((s, d) => s + d.solarKwh, 0);
      return {
        screen: 'Reports & M&V',
        ...f,
        last30: {
          days: days.length,
          gridKwh: Math.round(grid),
          solarKwh: Math.round(solar),
          maxDailyMdKva: Math.max(0, ...days.map((d) => d.mdKva)),
          source: days[0]?.source ?? null,
        },
      };
    },
  },
];
