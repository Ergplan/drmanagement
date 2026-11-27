import { getDb, proposeEvent, schema } from '@drm/db';
import { istDate } from '@drm/domain';
import { type GridSignal, Ven } from '@drm/grid';
import { desc, eq } from 'drizzle-orm';
import { HttpError, SITE_ID } from './api';
import { notifyRoles, ROUTING } from './notify';
import { planFor } from './planning';
import { siteControl } from './site';

const hhmm = (d: Date, up: boolean) => {
  // Snap to the 15-minute block grid (start down, end up) in IST.
  const ist = new Date(d.getTime() + 330 * 60000);
  let m = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  m = up ? Math.ceil(m / 15) * 15 : Math.floor(m / 15) * 15;
  if (m >= 1440) m = 1440;
  return m === 1440 ? '24:00' : `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

/**
 * A grid signal (OpenADR, DISCOM email, manual) becomes a *proposed* DR event with ergOS's plan. It still needs the
 * facility manager, the medical superintendent for HVAC and the duty engineer, like any other event.
 */
export async function ingestSignal(
  s: GridSignal,
  by: string,
): Promise<{ status: string; eventId: string | null; note: string | null }> {
  const { db } = getDb();
  const existing = await db.select().from(schema.gridSignal).where(eq(schema.gridSignal.externalId, s.externalId));
  if (existing.some((x) => x.source === s.source))
    return { status: 'duplicate', eventId: existing[0]?.eventId ?? null, note: null };
  let eventId: string | null = null;
  let status = 'proposed';
  let note: string | null = null;
  try {
    const ctl = await siteControl(SITE_ID);
    const end = hhmm(s.end, true);
    const p = await planFor(SITE_ID, {
      date: istDate(s.start),
      start: hhmm(s.start, false),
      end: end === '24:00' ? '23:45' : end,
      targetKw: s.targetKw ?? ctl.drWindow.targetKw,
    });
    if (!p.plan.actions.length) throw new HttpError(422, 'no non-clinical load can cover this window');
    eventId = await proposeEvent(db, {
      siteId: SITE_ID,
      programId: 'discom',
      start: p.startsAt,
      end: p.endsAt,
      targetKw: p.targetKw,
      plan: p.plan,
      createdBy: by,
      source: s.source,
      externalId: s.externalId,
    });
    if (s.importLimitKw !== null) note = `VTN import limit ${s.importLimitKw} kW; the ceiling still applies`;
    await notifyRoles(SITE_ID, ROUTING.proposed ?? [], {
      template: 'dr_proposed',
      subject: `Grid event received (${s.source}): ${p.date} ${p.start}–${p.end}`,
      text: `${s.source === 'openadr' ? 'The DISCOM VTN' : 'A DISCOM notice'} asks for ${p.targetKw} kW from ${p.start} to ${p.end} IST on ${p.date}. ergOS planned ${p.plan.expectedKw} kW. It needs approval like any event.`,
      payload: { eventId, source: s.source, externalId: s.externalId },
    });
  } catch (e) {
    status = 'rejected';
    note = e instanceof HttpError ? e.message : (e as Error).message;
  }
  await db
    .insert(schema.gridSignal)
    .values({
      siteId: SITE_ID,
      source: s.source,
      externalId: s.externalId,
      start: s.start,
      end: s.end,
      targetKw: s.targetKw,
      payload: s.raw as object,
      eventId,
      status,
      note,
    })
    .onConflictDoNothing();
  return { status, eventId, note };
}

/** Poll the VTN if OpenADR is switched on (feature flag: OPENADR_VTN_URL). */
export async function pollVtn(by: string) {
  const url = process.env.OPENADR_VTN_URL;
  if (!url) return { enabled: false as const, results: [] };
  const ven = new Ven({
    vtnUrl: url,
    clientId: process.env.OPENADR_CLIENT_ID,
    clientSecret: process.env.OPENADR_CLIENT_SECRET,
    venName: process.env.OPENADR_VEN_NAME ?? 'globe-lko',
    programs: (process.env.OPENADR_PROGRAMS ?? '').split(',').filter(Boolean),
  });
  const signals = await ven.poll();
  const results = [];
  for (const s of signals) results.push({ externalId: s.externalId, ...(await ingestSignal(s, by)) });
  return { enabled: true as const, results };
}

export async function listSignals(limit = 50) {
  return getDb()
    .db.select()
    .from(schema.gridSignal)
    .where(eq(schema.gridSignal.siteId, SITE_ID))
    .orderBy(desc(schema.gridSignal.receivedAt))
    .limit(limit);
}
