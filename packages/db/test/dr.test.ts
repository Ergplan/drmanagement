/** DR workflow against a real database: cloud-side exclusion, approval chain, intent pull and acks. */
import type { Plan } from '@drm/control';
import { afterAll, describe, expect, it } from 'vitest';
import { getDb } from '../src/client';
import { decideEvent, listEvents, pendingIntents, proposeEvent, recordAcks } from '../src/dr';
import { persistBatch } from '../src/ingest';

const run = process.env.DATABASE_URL ? describe : describe.skip;

const plan = (actions: Plan['actions'], hvac = false): Plan => ({
  actions,
  precondition: null,
  expectedKw: actions.reduce((s, a) => s + a.expectKw, 0),
  reliefKva: 0,
  meetsTarget: true,
  needsMedicalSuperintendent: hvac,
  forecastPeakKva: 540,
  plannedPeakKva: 500,
  excluded: [],
  skipped: [],
});

run('DR workflow in the database', () => {
  const { db, sql } = process.env.DATABASE_URL ? getDb() : ({ db: null, sql: null } as never);
  afterAll(async () => sql?.end());
  // An evening two days ahead, so the 17:00 arming deadline has not passed.
  const day = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
  const start = new Date(`${day}T12:00:00Z`);
  const end = new Date(`${day}T14:30:00Z`);

  it('refuses to store a plan that names a critical asset', async () => {
    await expect(
      proposeEvent(db, {
        siteId: 'globe-lko',
        programId: 'internal-peak',
        start,
        end,
        targetKw: 60,
        plan: plan([{ assetId: 'icu', action: 'shed', expectKw: 50 }]),
        createdBy: 'test',
      }),
    ).rejects.toThrow(/clinical exclusion/);
  });

  it('runs propose → approve → sign → arm, then the edge pulls and completes it', async () => {
    const id = await proposeEvent(db, {
      siteId: 'globe-lko',
      programId: 'internal-peak',
      start,
      end,
      targetKw: 60,
      plan: plan(
        [
          { assetId: 'laundry', action: 'shed', expectKw: 22 },
          { assetId: 'chiller', action: 'setpoint', expectKw: 14 },
        ],
        true,
      ),
      createdBy: 'test',
    });
    expect((await decideEvent(db, id, { id: 'de', role: 'duty_engineer' }, 'arm', null)).ok).toBe(false);
    expect(await decideEvent(db, id, { id: 'fm', role: 'facility_manager' }, 'approve', null)).toMatchObject({
      ok: true,
      status: 'approved',
    });
    expect(await decideEvent(db, id, { id: 'de', role: 'duty_engineer' }, 'arm', null)).toMatchObject({
      ok: false,
      why: 'waiting for the medical superintendent',
    });
    expect(
      await decideEvent(db, id, { id: 'ms', role: 'medical_superintendent' }, 'sign', 'ICU unaffected'),
    ).toMatchObject({ ok: true, status: 'signed' });
    const armed = await decideEvent(db, id, { id: 'de', role: 'duty_engineer' }, 'arm', null);
    expect(armed).toMatchObject({ ok: true, status: 'armed' });
    const intents = await pendingIntents(db, 'globe-lko');
    const mine = intents.find((i) => i.eventId === id);
    expect(mine?.approvals).toMatchObject({ facilityManager: true, medicalSuperintendent: true, armedBy: 'de' });
    expect(mine?.actions.map((a) => a.assetId)).toEqual(['laundry', 'chiller']);
    // Approvals are append-only.
    await expect(sql`delete from approval where event_id = ${id}`).rejects.toThrow(/append-only/);
    await recordAcks(db, [{ id: mine!.id, result: 'accepted', detail: null }]);
    expect((await pendingIntents(db, 'globe-lko')).some((i) => i.id === mine!.id)).toBe(true);
    await recordAcks(db, [{ id: mine!.id, result: 'done', detail: null }]);
    expect((await pendingIntents(db, 'globe-lko')).some((i) => i.id === mine!.id)).toBe(false);
    expect((await listEvents(db, 'globe-lko')).find((e) => e.id === id)?.status).toBe('completed');
  });

  it('keeps an edge refusal aimed at a critical asset in the audit log, not the command table', async () => {
    const at = new Date().toISOString();
    await persistBatch(db, 'globe-lko', 'edge-test', {
      batchId: `b-${Date.now()}`,
      deviceId: 'edge-test',
      sentAt: at,
      health: { version: 't', uptimeS: 1, drivers: {}, bufferedBatches: 0 },
      readings: [],
      blocks: [],
      days: [],
      events: [
        {
          kind: 'command',
          id: `cmd-t-${Date.now()}`,
          assetId: 'icu',
          action: 'shed',
          params: {},
          reason: 'manual',
          intentId: null,
          sentAt: at,
          result: 'refused',
          detail: 'clinical exclusion: icu is critical',
        },
      ],
    } as never);
    const rows =
      await sql`select count(*)::int n from audit_log where action = 'command_refused' and entity_id = 'icu' and at = ${at}`;
    expect(rows[0]!.n).toBe(1);
  });
});
