/**
 * Loads reference/*.yaml into the database. Idempotent: running it twice leaves the same rows.
 * Demo users get DEMO_PASSWORD (argon2-hashed). Run: pnpm --filter @drm/db seed
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hash } from '@node-rs/argon2';
import { sql as dsql, eq } from 'drizzle-orm';
import { parse } from 'yaml';
import { getDb } from './client';
import * as s from './schema';

const here = dirname(fileURLToPath(import.meta.url));
const REF = process.env.REFERENCE_DIR ?? join(here, '..', '..', '..', 'reference');
// biome-ignore lint/suspicious/noExplicitAny: YAML is validated by shape below
const y = (f: string): any => parse(readFileSync(join(REF, f), 'utf8'));

export const SITE_ID = 'globe-lko';
const CONN_ID = 'globe-lko-mvvnl';

const UNITS: Array<[RegExp, string]> = [
  [/kvah/, 'kVAh'],
  [/kvarh/, 'kvarh'],
  [/kwh/, 'kWh'],
  [/kvar/, 'kvar'],
  [/kva/, 'kVA'],
  [/kw_per_tr/, 'kW/TR'],
  [/kw/, 'kW'],
  [/^pf$/, 'pf'],
  [/^v_ll$/, 'V'],
  [/^hz$/, 'Hz'],
  [/thd/, '%'],
  [/_c$/, '°C'],
  [/pct/, '%'],
  [/pressure_pa|_pa_/, 'Pa'],
  [/co2_ppm/, 'ppm'],
  [/irradiance/, 'W/m²'],
  [/^tr$/, 'TR'],
  [/autonomy_min/, 'min'],
  [/fuel_l/, 'L'],
  [/cop/, 'COP'],
];
const unitFor = (k: string) => UNITS.find(([r]) => r.test(k))?.[1] ?? 'state';

export async function seed() {
  const { db, sql } = getDb();
  const site = y('site.yaml');
  const tariff = y('tariff.yaml');
  const bills = y('bills.yaml');
  const assets = y('assets.yaml');
  const control = y('control.yaml');
  const building = y('building.yaml');
  const points = y('points.yaml');

  await db.transaction(async (tx) => {
    await tx.insert(s.org).values({ id: 'globe-medicare', name: 'Globe Medicare' }).onConflictDoNothing();
    const siteRow = {
      id: SITE_ID,
      orgId: 'globe-medicare',
      name: site.site.name,
      publicBrand: site.site.public_brand,
      address: site.site.address,
      beds: site.site.beds,
      facts: {
        solar: site.solar,
        thermal: site.thermal,
        backup: site.backup,
        programme: site.programme,
        emissions: site.emissions,
      },
    };
    await tx.insert(s.site).values(siteRow).onConflictDoUpdate({ target: s.site.id, set: siteRow });
    const c = site.connection;
    const connRow = {
      id: CONN_ID,
      siteId: SITE_ID,
      utility: c.utility,
      account: c.account,
      tariffCategory: c.tariff_category,
      voltageKv: c.voltage_kv,
      sanctionedKva: c.sanctioned_load_kva,
      billingFloorKva: c.billing_floor_kva,
      mainMeter: c.main_meter,
    };
    await tx.insert(s.connection).values(connRow).onConflictDoUpdate({ target: s.connection.id, set: connRow });
    const tRow = {
      id: 'hv1-2026',
      connectionId: CONN_ID,
      category: tariff.category,
      energyRatePerKvah: tariff.energy_rate_inr_per_kvah,
      demandRatePerKvaMonth: tariff.demand_rate_inr_per_kva_month,
      dutyPct: tariff.electricity_duty_pct,
      floorPct: 0.75,
      excessSurcharge: tariff.excess_demand.surcharge,
      validFrom: '2026-04-01',
      source: tariff.source,
    };
    await tx.insert(s.tariff).values(tRow).onConflictDoUpdate({ target: s.tariff.id, set: tRow });

    for (const b of bills.bills) {
      const id = `bill-${String(b.label).toLowerCase().replace(/\s+/g, '-')}`;
      const billed = String(b.billed_kva);
      const months = billed.includes('x') ? Number(billed.split('x')[1]) : 1;
      const row = {
        id,
        connectionId: CONN_ID,
        label: b.label,
        periodFrom: String(b.period[0]),
        periodTo: String(b.period[1]),
        kvah: b.kvah,
        kwh: b.kwh ?? null,
        billedKva: Number.parseFloat(billed),
        months,
        pf: b.pf,
        total: b.total,
        note: b.note ?? null,
      };
      await tx.insert(s.bill).values(row).onConflictDoUpdate({ target: s.bill.id, set: row });
      await tx.delete(s.billLine).where(eq(s.billLine.billId, id));
      await tx.insert(s.billLine).values([
        { billId: id, kind: 'energy', amount: b.energy },
        { billId: id, kind: 'demand', amount: b.demand },
        { billId: id, kind: 'fuel_adj', amount: b.fuel_adj },
        { billId: id, kind: 'duty', amount: b.duty },
      ]);
    }
    const months = [
      '2025-12',
      '2026-01',
      '2026-02',
      '2026-03',
      '2026-04',
      '2026-05',
      '2026-06',
      '2026-07',
      '2026-08',
      '2026-09',
      '2026-10',
      '2026-11',
    ];
    for (const [i, m] of months.entries()) {
      const kva = bills.billed_demand_kva_last_12.kva[i];
      await tx
        .insert(s.billedDemandMonth)
        .values({ connectionId: CONN_ID, month: `${m}-01`, kva })
        .onConflictDoUpdate({ target: [s.billedDemandMonth.connectionId, s.billedDemandMonth.month], set: { kva } });
    }

    for (const f of building.floors) {
      const row = { id: `${SITE_ID}:${f.id}`, siteId: SITE_ID, level: f.level, name: f.name, uses: f.uses };
      await tx.insert(s.floor).values(row).onConflictDoUpdate({ target: s.floor.id, set: row });
    }

    for (const a of assets.assets) {
      const row = {
        id: a.id,
        siteId: SITE_ID,
        name: a.name,
        drClass: a.dr_class,
        ratedFlexKw: a.rated_flex_kw,
        limits: {
          action: a.action,
          never: a.never,
          minimum_service: a.minimum_service,
          rebound: a.rebound,
          max_duration: a.max_duration,
          response_time: a.response_time,
          flex_kw: a.flex_kw,
          flex_window_hours: a.flex_window_hours,
        },
        authority: a.authority,
        interlock: a.interlock,
        profile: a.hourly_profile_kw_nov,
      };
      await tx.insert(s.asset).values(row).onConflictDoUpdate({ target: s.asset.id, set: row });
      await tx.delete(s.equipment).where(eq(s.equipment.assetId, a.id));
      if (a.equipment?.length)
        await tx.insert(s.equipment).values(
          a.equipment.map((e: { name: string; rating: string }) => ({
            assetId: a.id,
            name: e.name,
            rating: e.rating,
          })),
        );
    }

    for (const n of points.nodes) {
      const row = {
        id: n.id,
        siteId: SITE_ID,
        floorId: `${SITE_ID}:${n.floor}`,
        assetId: n.asset ?? null,
        title: n.title,
        drClass: n.dr_class,
        pos: n.pos,
        look: n.look,
        driverLater: n.driver_later,
        note: n.note ?? null,
      };
      await tx.insert(s.node).values(row).onConflictDoUpdate({ target: s.node.id, set: row });
      for (const k of n.points as string[]) {
        const fresh = n.id === 'ht-meter' ? 15 : 120;
        const prow = {
          id: `${n.id}.${k}`,
          nodeId: n.id,
          assetId: n.asset ?? null,
          kind: k,
          unit: unitFor(k),
          sourceDriver: 'sim',
          requiredFreshnessS: fresh,
        };
        await tx.insert(s.point).values(prow).onConflictDoUpdate({ target: s.point.id, set: prow });
      }
    }

    for (const i of control.interlocks) {
      const row = { id: i.id, siteId: SITE_ID, name: i.name, limitText: String(i.limit), rule: { sample: i.sample } };
      await tx.insert(s.interlock).values(row).onConflictDoUpdate({ target: s.interlock.id, set: row });
    }
    await tx.insert(s.ceilingState).values({ siteId: SITE_ID }).onConflictDoNothing();

    const prog = {
      id: 'internal-peak',
      siteId: SITE_ID,
      name: 'Internal peak management (demand charge)',
      kind: 'internal_peak',
      noticeMin: 120,
      baselineMethod: 'day_matching',
      baselineParams: { days: 10, adjust_hours_before: 2, cap: 0.2 },
    };
    await tx.insert(s.drProgram).values(prog).onConflictDoUpdate({ target: s.drProgram.id, set: prog });

    const opp = [
      {
        id: 'oct-dispute',
        title: 'October 2026 bill dispute',
        kind: 'bill_audit',
        valueInr: 1310000,
        status: 'found',
        evidence: { kvah_per_day: 18750, normal: '6,200–6,600' },
      },
      {
        id: 'pf-retune',
        title: 'Retune APFC to 0.99 power factor',
        kind: 'power_factor',
        valueInrPerMonth: 92000,
        status: 'found',
        evidence: { pf_billed: 0.94 },
      },
      {
        id: 'solar-soak',
        title: 'Heat pumps on solar (10:00–15:00)',
        kind: 'load_shift',
        valueInrPerMonth: 9890,
        status: 'running',
        evidence: {},
      },
      {
        id: 'ceiling',
        title: 'Demand ceiling at 570 kVA',
        kind: 'demand',
        status: 'running',
        evidence: { summer_uncontrolled_kva: 642, controlled_kva: 555 },
      },
    ];
    for (const o of opp)
      await tx
        .insert(s.opportunity)
        .values({ siteId: SITE_ID, ...o })
        .onConflictDoUpdate({ target: s.opportunity.id, set: o });

    await tx
      .insert(s.device)
      .values({ id: process.env.EDGE_DEVICE_ID ?? 'edge-globe-lko-01', siteId: SITE_ID })
      .onConflictDoNothing();

    const pw = process.env.DEMO_PASSWORD;
    if (pw) {
      const h = await hash(pw);
      const users: Array<[string, string, s.Role]> = [
        ['fm@globe.demo', 'Facility manager', 'facility_manager'],
        ['ms@globe.demo', 'Medical superintendent', 'medical_superintendent'],
        ['de@globe.demo', 'Duty engineer', 'duty_engineer'],
        ['accounts@globe.demo', 'Accounts', 'accounts'],
        ['ops@joulewise.demo', 'jouleWise operations', 'joulewise_ops'],
        ['viewer@globe.demo', 'Viewer', 'viewer'],
      ];
      for (const [email, name, role] of users) {
        await tx
          .insert(s.appUser)
          .values({ id: email, email, name, role, siteId: SITE_ID, passwordHash: h })
          .onConflictDoUpdate({ target: s.appUser.id, set: { name, role, passwordHash: h } });
      }
    } else {
      console.warn('DEMO_PASSWORD not set: demo users not created/updated');
    }
    await tx.execute(
      dsql`select ensure_reading_partitions(date_trunc('month', now() - interval '13 months')::date, (now() + interval '2 months')::date)`,
    );
  });
  return sql;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const sql = await seed();
  console.log('seed done');
  await sql.end();
}
