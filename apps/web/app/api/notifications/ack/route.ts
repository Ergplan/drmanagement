import { getDb, schema } from '@drm/db';
import { z } from 'zod';
import { actionHandler, HttpError, SITE_ID } from '@/lib/api';

export const dynamic = 'force-dynamic';

/** Acknowledge a DR notice (stops the 10-minute escalation). Stored as a new append-only row. */
export const POST = actionHandler(async (req, user) => {
  const b = z.object({ eventId: z.string().min(3) }).safeParse(await req.json());
  if (!b.success) throw new HttpError(400, 'eventId is required');
  await getDb()
    .db.insert(schema.notification)
    .values({
      siteId: SITE_ID,
      channel: 'ack',
      to: user.id,
      template: 'ack',
      payload: { eventId: b.data.eventId, role: user.role },
      status: 'acknowledged',
    });
  return { ok: true };
});
