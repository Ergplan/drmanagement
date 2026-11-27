/**
 * Proves invariants 1 and 7 in the database. Needs a migrated, seeded database in DATABASE_URL
 * (CI and the VM have one; without it these tests are reported as skipped, never as passed).
 */
import { afterAll, describe, expect, it } from 'vitest';
import { getDb } from '../src/client';

const run = process.env.DATABASE_URL ? describe : describe.skip;

run('database rules', () => {
  const { sql } = process.env.DATABASE_URL ? getDb() : ({ sql: null } as never);
  afterAll(async () => sql?.end());

  const cmd = (asset: string, id: string) =>
    sql`insert into command (id, site_id, asset_id, action, reason, sent_at, result) values (${id}, 'globe-lko', ${asset}, 'shed', 'ceiling', now(), 'ok')`;

  it.each(['icu', 'imaging', 'medgas', 'clinicalhvac'])(
    'refuses a command to %s (protected or critical)',
    async (asset) => {
      await expect(cmd(asset, `t-${asset}-${Date.now()}`)).rejects.toThrow(/clinical exclusion/);
    },
  );

  it('accepts a command to a flexible asset, then refuses to change or delete it', async () => {
    const id = `t-hp-${Date.now()}`;
    await cmd('heatpump', id);
    await expect(sql`update command set result = 'failed' where id = ${id}`).rejects.toThrow(/append-only/);
    await expect(sql`delete from command where id = ${id}`).rejects.toThrow(/append-only/);
  });

  it('a real audit_log row cannot be changed or deleted', async () => {
    await sql`insert into audit_log (actor, action, entity) values ('test', 'probe', 'rules')`;
    await expect(sql`update audit_log set actor = 'x' where action = 'probe'`).rejects.toThrow(/append-only/);
    await expect(sql`delete from audit_log where action = 'probe'`).rejects.toThrow(/append-only/);
  });

  it.each(['audit_log', 'approval', 'command', 'dr_event_log', 'interlock_event', 'notification'])(
    '%s has the append-only trigger and refuses TRUNCATE',
    async (t) => {
      const rows =
        await sql`select tgname from pg_trigger where tgrelid = ${t}::regclass and tgenabled = 'O' and tgname = ${`${t}_append_only`}`;
      expect(rows.length).toBe(1);
      await expect(sql.unsafe(`truncate ${t} cascade`)).rejects.toThrow(/append-only/);
    },
  );

  it('readings land in the monthly partition', async () => {
    await sql`insert into reading_1m (point_id, ts, value, source) values ('ht-meter.kva', '2026-11-27T09:00:00Z', 265, 'test') on conflict do nothing`;
    const [r] =
      await sql`select tableoid::regclass::text as part from reading_1m where point_id = 'ht-meter.kva' and ts = '2026-11-27T09:00:00Z'`;
    expect(r?.part).toBe('reading_1m_2026_11');
  });
});
