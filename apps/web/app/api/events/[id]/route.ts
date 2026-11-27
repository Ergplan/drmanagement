import { decideEvent, getDb } from '@drm/db';
import { z } from 'zod';
import { actionHandler, HttpError, SITE_ID } from '@/lib/api';
import { notifyRoles, ROUTING } from '@/lib/notify';

export const dynamic = 'force-dynamic';

const Body = z.object({
  decision: z.enum(['approve', 'sign', 'arm', 'reject', 'abort']),
  note: z.string().max(500).nullable().optional(),
});

/** One step of the approval chain. The role rules live in packages/control/workflow and are checked again here. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return actionHandler(async (r, user) => {
    const b = Body.safeParse(await r.json());
    if (!b.success) throw new HttpError(400, 'decision is required');
    const res = await decideEvent(getDb().db, id, user, b.data.decision, b.data.note ?? null);
    if (!res.ok) throw new HttpError(409, res.why);
    const roles = ROUTING[res.status];
    if (roles)
      await notifyRoles(SITE_ID, roles, {
        template: `dr_${res.status}`,
        subject: `DR event ${id}: ${res.status}`,
        text: `${user.name} (${user.role.replaceAll('_', ' ')}) chose ${b.data.decision}${b.data.note ? `: ${b.data.note}` : ''}.`,
        payload: { eventId: id },
      });
    return res;
  })(req);
}
