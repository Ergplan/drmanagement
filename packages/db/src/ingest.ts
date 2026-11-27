import type { BlockRow, DayRow, EdgeEvent, LiveSnapshot, ReadingRow } from '@drm/contracts';
import { sql } from 'drizzle-orm';
import type { Db } from './client';
import * as s from './schema';

/**
 * Persists one edge batch. Idempotent: readings ignore duplicates, blocks/days upsert, events are insert-only
 * (append-only tables) and skip duplicates by id where they have one.
 */
export async function persistBatch(
  db: Db,
  siteId: string,
  deviceId: string,
  b: {
    health: unknown;
    live?: LiveSnapshot;
    readings: ReadingRow[];
    blocks: BlockRow[];
    days: DayRow[];
    events: EdgeEvent[];
  },
) {
  await db.transaction(async (tx) => {
    for (let i = 0; i < b.readings.length; i += 2000) {
      const chunk = b.readings
        .slice(i, i + 2000)
        .map((r) => ({ pointId: r.p, ts: new Date(r.t), value: r.v, source: r.s, quality: r.q }));
      if (chunk.length) await tx.insert(s.reading1m).values(chunk).onConflictDoNothing();
    }
    for (const x of b.blocks) {
      const row = {
        siteId,
        blockStart: new Date(x.blockStart),
        blockNo: x.blockNo,
        kwh: x.kwh,
        kvah: x.kvah,
        kvarh: x.kvarh,
        avgKva: x.avgKva,
        maxKva: x.maxKva,
        solarKwh: x.solarKwh,
        assetKwh: x.assetKwh,
        source: x.source,
        quality: x.quality,
      };
      await tx
        .insert(s.block15m)
        .values(row)
        .onConflictDoUpdate({ target: [s.block15m.siteId, s.block15m.blockStart], set: row });
    }
    for (const d of b.days) {
      const row = {
        siteId,
        day: d.day,
        kwh: d.kwh,
        kvah: d.kvah,
        mdKva: d.mdKva,
        solarKwh: d.solarKwh,
        costInr: d.costInr,
        assetKwh: d.assetKwh,
        source: d.source,
      };
      await tx
        .insert(s.day1d)
        .values(row)
        .onConflictDoUpdate({ target: [s.day1d.siteId, s.day1d.day], set: row });
    }
    for (const e of b.events) {
      if (e.kind === 'interlock')
        await tx
          .insert(s.interlockEvent)
          .values({ interlockId: e.interlockId, at: new Date(e.at), state: e.state, value: e.value });
      else if (e.kind === 'command' && e.result === 'refused' && e.detail?.startsWith('clinical exclusion'))
        // The command table's trigger refuses excluded assets outright; the edge's refusal is kept in the audit log.
        await tx.insert(s.auditLog).values({
          actor: `edge:${deviceId}`,
          action: 'command_refused',
          entity: 'asset',
          entityId: e.assetId,
          after: { ...e },
          at: new Date(e.sentAt),
        });
      else if (e.kind === 'command')
        await tx
          .insert(s.command)
          .values({
            id: e.id,
            siteId,
            assetId: e.assetId,
            action: e.action,
            params: e.params,
            reason: e.reason,
            intentId: e.intentId,
            sentAt: new Date(e.sentAt),
            result: e.result,
            detail: e.detail,
          })
          .onConflictDoNothing();
      else if (e.kind === 'ceiling')
        await tx.insert(s.ceilingAction).values({
          siteId,
          at: new Date(e.at),
          stage: e.stage,
          kind: e.action,
          assetId: e.assetId,
          projectedKva: e.projectedKva,
        });
      else if (e.kind === 'dr_log') {
        await tx
          .insert(s.drEventLog)
          .values({ eventId: e.eventId, at: new Date(e.at), kind: e.entry, detail: e.detail });
        const st = ({ event: 'running', done: 'completed', aborted: 'aborted', rejected: 'rejected' } as const)[
          e.entry as 'event'
        ];
        if (st) await tx.update(s.drEvent).set({ status: st }).where(sql`${s.drEvent.id} = ${e.eventId}`);
      }
    }
    if (b.live?.ceiling) {
      await tx
        .insert(s.ceilingState)
        .values({
          siteId,
          armed: b.live.ceiling.armed,
          stage: b.live.ceiling.stage,
          projectedKva: b.live.projectedKva,
          updatedAt: new Date(b.live.at),
        })
        .onConflictDoUpdate({
          target: s.ceilingState.siteId,
          set: {
            armed: b.live.ceiling.armed,
            stage: b.live.ceiling.stage,
            projectedKva: b.live.projectedKva,
            updatedAt: new Date(b.live.at),
          },
        });
    }
    await tx
      .update(s.device)
      .set({ lastSeen: sql`now()`, health: { ...(b.health as object), live: b.live ?? null } })
      .where(sql`${s.device.id} = ${deviceId}`);
  });
}
