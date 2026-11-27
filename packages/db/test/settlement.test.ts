/** Settlement over synthetic metered blocks (Dec 2024 / 1 Jan 2025, far from live data). */
import { HV1_GLOBE } from '@drm/domain';
import { afterAll, describe, expect, it } from 'vitest';
import { getDb } from '../src/client';
import { settleEvent } from '../src/settlement';

const run = process.env.DATABASE_URL ? describe : describe.skip;

run('event settlement', () => {
  const { db, sql } = process.env.DATABASE_URL ? getDb() : ({ db: null, sql: null } as never);
  const id = `ev-test-settle-${Date.now()}`;
  const IST = 330 * 60000;
  const blockStart = (d: string, k: number) => new Date(Date.parse(`${d}T00:00:00Z`) - IST + k * 900000);
  afterAll(async () => {
    await sql`delete from settlement where event_id = ${id}`;
    await sql`delete from dr_event where id = ${id}`;
    await sql`delete from block_15m where site_id = 'globe-lko' and block_start >= '2024-12-10' and block_start < '2025-01-03'`;
    await sql.end();
  });

  it('day-matching baseline, delivered kW, avoided demand charge', async () => {
    const days = Array.from({ length: 22 }, (_, i) => new Date(Date.UTC(2024, 11, 11 + i)).toISOString().slice(0, 10));
    const rows: Array<Record<string, unknown>> = [];
    for (const d of days)
      for (let k = 0; k < 96; k++) {
        const inWin = k >= 70 && k < 80;
        const kw = d === '2025-01-01' ? (inWin ? 420 : 300) : inWin ? 480 : 300;
        rows.push({
          site_id: 'globe-lko',
          block_start: blockStart(d, k).toISOString(),
          block_no: k + 1,
          kwh: kw / 4,
          kvah: kw / 4,
          avg_kva: kw,
          max_kva: kw,
          source: 'test',
        });
      }
    for (let i = 0; i < rows.length; i += 500)
      await sql`insert into block_15m ${sql(rows.slice(i, i + 500))} on conflict do nothing`;
    await sql`insert into dr_event (id, site_id, program_id, start, "end", target_kw, nomination_kw, status, plan, created_by)
      values (${id}, 'globe-lko', 'internal-peak', ${blockStart('2025-01-01', 70).toISOString()}, ${blockStart('2025-01-01', 80).toISOString()}, 60, 60, 'completed', '{}'::jsonb, 'test')`;
    const r = await settleEvent(db, id, { spec: HV1_GLOBE, gridFactor: 0.727, holidays: new Set() });
    expect(r.method).toBe('day_matching');
    expect(r.eligibleDays.length).toBeGreaterThanOrEqual(10);
    expect(r.factor).toBeCloseTo(1);
    expect(r.deliveredKw).toBeCloseTo(60);
    expect(r.deliveredKwh).toBeCloseTo(150);
    expect(r.peakWithoutKva).toBeCloseTo(480);
    expect(r.peakWithKva).toBeCloseTo(420);
    expect(r.avoidedDemandInr).toBeCloseTo((480 - 450) * 430); // floor is 450 kVA
    const [row] = await sql`select delivered_kw from settlement where event_id = ${id}`;
    expect(Number(row!.delivered_kw)).toBeCloseTo(60);
  });

  it('refuses to settle an event that has not ended', async () => {
    await sql`update dr_event set status = 'armed' where id = ${id}`;
    await expect(settleEvent(db, id, { spec: HV1_GLOBE, gridFactor: 0.727, holidays: new Set() })).rejects.toThrow(
      /settle after it ends/,
    );
    await sql`update dr_event set status = 'completed' where id = ${id}`;
  });
});
