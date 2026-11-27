import { getDb, schema } from '@drm/db';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { actionHandler, HttpError } from '@/lib/api';

export const dynamic = 'force-dynamic';

const Body = z.object({
  sourceDriver: z.string().regex(/^[a-z0-9-]{2,40}$/),
  deviceRef: z.string().max(120).nullable().optional(),
});

/** Record which driver a point should come from. Takes effect when the same line is in edge.config.yaml. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return actionHandler(
    async (r, user) => {
      const b = Body.safeParse(await r.json());
      if (!b.success) throw new HttpError(400, 'sourceDriver is a short id such as sim or lt-panels');
      const { db } = getDb();
      const [p] = await db.select().from(schema.point).where(eq(schema.point.id, id));
      if (!p) throw new HttpError(404, 'no such point');
      await db
        .update(schema.point)
        .set({ sourceDriver: b.data.sourceDriver, deviceRef: b.data.deviceRef ?? null })
        .where(eq(schema.point.id, id));
      await db.insert(schema.auditLog).values({
        actor: user.id,
        action: 'point_mapping',
        entity: 'point',
        entityId: id,
        before: { sourceDriver: p.sourceDriver, deviceRef: p.deviceRef },
        after: b.data,
      });
      return { ok: true };
    },
    ['joulewise_ops', 'facility_manager'],
  )(req);
}
