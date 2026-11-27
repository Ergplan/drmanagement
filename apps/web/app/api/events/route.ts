import { getDb, listEvents, proposeEvent } from '@drm/db';
import { z } from 'zod';
import { actionHandler, getHandler, HttpError, SITE_ID } from '@/lib/api';
import { istWhen } from '@/lib/format';
import { notifyRoles, ROUTING } from '@/lib/notify';
import { planFor } from '@/lib/planning';

export const dynamic = 'force-dynamic';

export const GET = getHandler(async () => ({ events: await listEvents(getDb().db, SITE_ID) }));

const Body = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  start: z.string(),
  end: z.string(),
  targetKw: z.number(),
});

/** Propose a DR event. The plan is recomputed here from the forecast; the browser only chooses the window. */
export const POST = actionHandler(
  async (req, user) => {
    const b = Body.safeParse(await req.json());
    if (!b.success) throw new HttpError(400, 'date, start, end and targetKw are required');
    const p = await planFor(SITE_ID, b.data);
    if (!p.plan.actions.length) throw new HttpError(422, 'no non-clinical load can cover this window');
    if (p.startsAt.getTime() < Date.now()) throw new HttpError(422, 'the window has already started');
    const id = await proposeEvent(getDb().db, {
      siteId: SITE_ID,
      programId: 'internal-peak',
      start: p.startsAt,
      end: p.endsAt,
      targetKw: p.targetKw,
      plan: p.plan,
      createdBy: user.id,
    });
    await notifyRoles(SITE_ID, ROUTING.proposed ?? [], {
      template: 'dr_proposed',
      subject: `DR event proposed for ${istWhen(p.startsAt)}`,
      text: `${user.name} proposed a ${p.targetKw} kW event ${p.start}–${p.end} IST on ${p.date}. Loads: ${p.plan.actions.map((a) => a.assetId).join(', ')}. Approve by ${p.armBy}.`,
      payload: { eventId: id },
    });
    return { ok: true, id };
  },
  ['facility_manager', 'joulewise_ops'],
);
