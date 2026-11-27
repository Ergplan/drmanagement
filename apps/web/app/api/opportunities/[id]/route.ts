import { getDb, schema } from '@drm/db';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { actionHandler, HttpError } from '@/lib/api';

export const dynamic = 'force-dynamic';

/** Opportunity status workflow; every change is in the audit log. */
const STATUSES = ['found', 'to_approve', 'approved', 'running', 'verified', 'dropped'] as const;
const NEXT: Record<string, string[]> = {
  found: ['to_approve', 'dropped'],
  to_approve: ['approved', 'dropped'],
  approved: ['running', 'dropped'],
  running: ['verified', 'dropped'],
  verified: [],
  dropped: ['found'],
};
const Body = z.object({ status: z.enum(STATUSES), note: z.string().max(500).optional() });

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return actionHandler(
    async (r, user) => {
      const b = Body.safeParse(await r.json());
      if (!b.success) throw new HttpError(400, 'status is required');
      const { db } = getDb();
      const [o] = await db.select().from(schema.opportunity).where(eq(schema.opportunity.id, id));
      if (!o) throw new HttpError(404, 'no such opportunity');
      if (!(NEXT[o.status] ?? []).includes(b.data.status))
        throw new HttpError(409, `cannot move from ${o.status} to ${b.data.status}`);
      await db.update(schema.opportunity).set({ status: b.data.status }).where(eq(schema.opportunity.id, id));
      await db.insert(schema.auditLog).values({
        actor: user.id,
        action: 'opportunity_status',
        entity: 'opportunity',
        entityId: id,
        before: { status: o.status },
        after: { status: b.data.status, note: b.data.note ?? null },
      });
      return { ok: true, status: b.data.status, next: NEXT[b.data.status] };
    },
    ['facility_manager', 'accounts', 'joulewise_ops'],
  )(req);
}
