import { getDb, schema } from '@drm/db';
import { and, asc, eq, gte, lt } from 'drizzle-orm';
import { auth } from '@/auth';

export const dynamic = 'force-dynamic';

/** 1-minute series for one point: /api/points/chillers.kw/series?from=ISO&to=ISO (default: last 24 h). */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await auth())?.user) return Response.json({ error: 'sign in required' }, { status: 401 });
  if (!process.env.DATABASE_URL) return Response.json({ error: 'database not configured' }, { status: 503 });
  const { id } = await ctx.params;
  const q = new URL(req.url).searchParams;
  const to = new Date(q.get('to') ?? Date.now());
  const from = new Date(q.get('from') ?? to.getTime() - 86400000);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to.getTime() - from.getTime() > 31 * 86400000)
    return Response.json({ error: 'from/to must be ISO times at most 31 days apart' }, { status: 400 });
  const { db } = getDb();
  const rows = await db
    .select({
      ts: schema.reading1m.ts,
      value: schema.reading1m.value,
      source: schema.reading1m.source,
      quality: schema.reading1m.quality,
    })
    .from(schema.reading1m)
    .where(and(eq(schema.reading1m.pointId, id), gte(schema.reading1m.ts, from), lt(schema.reading1m.ts, to)))
    .orderBy(asc(schema.reading1m.ts));
  return Response.json({ pointId: id, from, to, rows }, { headers: { 'cache-control': 'private, max-age=30' } });
}
