/**
 * DR events, approvals and intents. The cloud plans and records decisions; once armed it writes a `dr_intent`
 * that the edge pulls, re-validates and executes (invariant 2). Approvals, audit and notifications are
 * append-only rows (invariant 7).
 */
import type { EdgeIntent, IntentAck } from '@drm/contracts';
import {
  armDeadline,
  type Decision,
  decide,
  type EventStatus,
  effectiveStatus,
  type FlexAsset,
  type Plan,
  seasonalFlexKw,
} from '@drm/control';
import { and, desc, eq, gt, inArray, isNull, or, sql } from 'drizzle-orm';
import type { Db } from './client';
import * as s from './schema';

const ARM_BY = '17:00';

export async function flexAssets(db: Db, siteId: string, month: number): Promise<FlexAsset[]> {
  const rows = await db.select().from(s.asset).where(eq(s.asset.siteId, siteId));
  return rows.map((a) => {
    const l = a.limits as {
      flex_kw?: { nov_evening: number; jun_evening: number };
      max_duration?: string;
      response_time?: string;
      rebound?: string;
    };
    const num = (v?: string, unit = 'h') =>
      v && new RegExp(`^[\\d.]+ ${unit}$`).test(v) ? Number.parseFloat(v) : null;
    return {
      id: a.id,
      name: a.name,
      drClass: a.drClass,
      flexKw: l.flex_kw ? seasonalFlexKw(l.flex_kw, month) : 0,
      maxDurationH: num(l.max_duration),
      responseMin: num(l.response_time, 'min'),
      rebound: l.rebound ?? '',
    };
  });
}

export interface EventView {
  id: string;
  programId: string;
  start: string;
  end: string;
  targetKw: number;
  status: EventStatus;
  plan: Plan;
  forecastPeakKva: number | null;
  plannedPeakKva: number | null;
  createdBy: string;
  createdAt: string;
  armBy: string;
  armDeadline: string;
  approvals: Array<{ role: string; userId: string; decision: string; note: string | null; at: string }>;
  log: Array<{ at: string; kind: string; detail: unknown }>;
}

export async function listEvents(db: Db, siteId: string, limit = 30): Promise<EventView[]> {
  const evs = await db
    .select()
    .from(s.drEvent)
    .where(eq(s.drEvent.siteId, siteId))
    .orderBy(desc(s.drEvent.start))
    .limit(limit);
  if (!evs.length) return [];
  const ids = evs.map((e) => e.id);
  const aps = await db.select().from(s.approval).where(inArray(s.approval.eventId, ids)).orderBy(s.approval.at);
  const logs = await db.select().from(s.drEventLog).where(inArray(s.drEventLog.eventId, ids)).orderBy(s.drEventLog.at);
  const now = new Date();
  return evs.map((e) => {
    const p = e.plan as Plan;
    return {
      id: e.id,
      programId: e.programId,
      start: e.start.toISOString(),
      end: e.end.toISOString(),
      targetKw: e.targetKw,
      status: effectiveStatus(
        {
          status: e.status,
          start: e.start,
          end: e.end,
          needsMedicalSuperintendent: p.needsMedicalSuperintendent,
          armBy: ARM_BY,
        },
        now,
      ),
      plan: p,
      forecastPeakKva: e.forecastPeakKva,
      plannedPeakKva: e.plannedPeakKva,
      createdBy: e.createdBy,
      createdAt: e.createdAt.toISOString(),
      armBy: ARM_BY,
      armDeadline: armDeadline(e.start, ARM_BY).toISOString(),
      approvals: aps
        .filter((a) => a.eventId === e.id)
        .map((a) => ({ role: a.role, userId: a.userId, decision: a.decision, note: a.note, at: a.at.toISOString() })),
      log: logs
        .filter((l) => l.eventId === e.id)
        .map((l) => ({ at: l.at.toISOString(), kind: l.kind, detail: l.detail })),
    };
  });
}

export async function proposeEvent(
  db: Db,
  a: {
    siteId: string;
    programId: string;
    start: Date;
    end: Date;
    targetKw: number;
    plan: Plan;
    createdBy: string;
    source?: string;
    externalId?: string | null;
  },
): Promise<string> {
  // Invariant 1, cloud side: refuse to store a plan that names an excluded asset.
  const classes = new Map(
    (await db.select({ id: s.asset.id, c: s.asset.drClass }).from(s.asset)).map((r) => [r.id, r.c as string]),
  );
  for (const x of [...a.plan.actions, ...(a.plan.precondition?.actions ?? [])]) {
    const c = classes.get(x.assetId);
    if (c !== 'flexible' && c !== 'conditional')
      throw new Error(`clinical exclusion: ${x.assetId} is ${c ?? 'unknown'}`);
  }
  const id = `ev-${a.start.toISOString().slice(0, 10)}-${Math.random().toString(36).slice(2, 7)}`;
  await db.transaction(async (tx) => {
    await tx.insert(s.drEvent).values({
      id,
      siteId: a.siteId,
      programId: a.programId,
      start: a.start,
      end: a.end,
      targetKw: a.targetKw,
      nominationKw: a.plan.expectedKw,
      status: 'proposed',
      plan: a.plan,
      forecastPeakKva: a.plan.forecastPeakKva,
      plannedPeakKva: a.plan.plannedPeakKva,
      createdBy: a.createdBy,
      source: a.source ?? 'ergos',
      externalId: a.externalId ?? null,
    });
    await tx.insert(s.drEventLog).values({
      eventId: id,
      at: new Date(),
      kind: 'proposed',
      detail: { by: a.createdBy, targetKw: a.targetKw, expectedKw: a.plan.expectedKw },
    });
    await tx.insert(s.auditLog).values({
      actor: a.createdBy,
      action: 'propose',
      entity: 'dr_event',
      entityId: id,
      after: { start: a.start, end: a.end, targetKw: a.targetKw },
    });
  });
  return id;
}

export type DecideResult = { ok: true; status: EventStatus; intentId: string | null } | { ok: false; why: string };

export async function decideEvent(
  db: Db,
  eventId: string,
  user: { id: string; role: string },
  d: Decision,
  note: string | null,
): Promise<DecideResult> {
  return db.transaction(async (tx) => {
    // Row lock: two people approving at once see a consistent status.
    const [e] = await tx.select().from(s.drEvent).where(eq(s.drEvent.id, eventId)).for('update');
    if (!e) return { ok: false as const, why: 'no such event' };
    const p = e.plan as Plan;
    const now = new Date();
    const r = decide(
      {
        status: e.status,
        start: e.start,
        end: e.end,
        needsMedicalSuperintendent: p.needsMedicalSuperintendent,
        armBy: ARM_BY,
      },
      user.role,
      d,
      now,
    );
    if (!r.ok) return r;
    await tx.insert(s.approval).values({ eventId, role: user.role as s.Role, userId: user.id, decision: d, note });
    await tx.update(s.drEvent).set({ status: r.status }).where(eq(s.drEvent.id, eventId));
    await tx.insert(s.drEventLog).values({ eventId, at: now, kind: d, detail: { by: user.id, role: user.role, note } });
    await tx.insert(s.auditLog).values({
      actor: user.id,
      action: d,
      entity: 'dr_event',
      entityId: eventId,
      before: { status: e.status },
      after: { status: r.status },
    });
    let intentId: string | null = null;
    if (d === 'arm' || d === 'abort') {
      const aps = await tx.select().from(s.approval).where(eq(s.approval.eventId, eventId));
      const intent: EdgeIntent = {
        id: `${d === 'arm' ? 'in' : 'ab'}-${eventId}-${now.getTime().toString(36)}`,
        eventId,
        kind: d === 'arm' ? 'dr' : 'abort',
        startsAt: e.start.toISOString(),
        endsAt: e.end.toISOString(),
        targetKw: e.targetKw,
        actions: p.actions.map((x) => ({ assetId: x.assetId, action: x.action })),
        ...(p.precondition ? { precondition: p.precondition } : {}),
        approvals: {
          facilityManager: aps.some((a) => a.decision === 'approve' && a.role === 'facility_manager'),
          medicalSuperintendent: p.needsMedicalSuperintendent
            ? aps.some((a) => a.decision === 'sign' && a.role === 'medical_superintendent')
            : null,
          armedBy: d === 'arm' ? user.id : (aps.find((a) => a.decision === 'arm')?.userId ?? null),
          armedAt: d === 'arm' ? now.toISOString() : (aps.find((a) => a.decision === 'arm')?.at.toISOString() ?? null),
        },
        armBy: ARM_BY,
      };
      intentId = intent.id;
      await tx.insert(s.drIntent).values({
        id: intent.id,
        eventId,
        steps: intent,
        validUntil: d === 'arm' ? e.end : new Date(now.getTime() + 3600000),
        kind: intent.kind,
      });
    }
    return { ok: true as const, status: r.status, intentId };
  });
}

/** What the edge should hold now: armed intents not yet finished, and abort intents not yet acked. */
export async function pendingIntents(db: Db, siteId: string, now = new Date()): Promise<EdgeIntent[]> {
  const rows = await db
    .select({ steps: s.drIntent.steps })
    .from(s.drIntent)
    .innerJoin(s.drEvent, eq(s.drEvent.id, s.drIntent.eventId))
    .where(
      and(
        eq(s.drEvent.siteId, siteId),
        gt(s.drIntent.validUntil, now),
        or(isNull(s.drIntent.ackResult), eq(s.drIntent.ackResult, 'accepted')),
        or(eq(s.drIntent.kind, 'abort'), inArray(s.drEvent.status, ['armed', 'running'])),
      ),
    )
    .orderBy(s.drIntent.createdAt);
  return rows.map((r) => r.steps as EdgeIntent);
}

const ACK_STATUS: Partial<Record<IntentAck['result'], EventStatus>> = {
  done: 'completed',
  aborted: 'aborted',
  rejected: 'rejected',
};

export async function recordAcks(db: Db, acks: IntentAck[]): Promise<void> {
  for (const a of acks)
    await db.transaction(async (tx) => {
      const [i] = await tx
        .update(s.drIntent)
        .set({ ackedAt: sql`now()`, ackResult: a.result })
        .where(eq(s.drIntent.id, a.id))
        .returning();
      if (!i?.eventId || i.kind === 'abort') return;
      const st = ACK_STATUS[a.result];
      if (st) await tx.update(s.drEvent).set({ status: st }).where(eq(s.drEvent.id, i.eventId));
      await tx.insert(s.drEventLog).values({
        eventId: i.eventId,
        at: new Date(),
        kind: `edge_${a.result}`,
        detail: { intentId: a.id, detail: a.detail },
      });
    });
}
