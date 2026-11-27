import { getDb, schema } from '@drm/db';
import { istDate, istMidnightUTC } from '@drm/domain';
import { and, asc, eq, gte, lt } from 'drizzle-orm';
import { auth } from '@/auth';
import { SITE_ID } from '@/lib/api';

export const dynamic = 'force-dynamic';

/** One IST day of 15-minute blocks: /api/day?date=YYYY-MM-DD (defaults to today). */
export async function GET(req: Request) {
  if (!(await auth())?.user) return Response.json({ error: 'sign in required' }, { status: 401 });
  if (!process.env.DATABASE_URL) return Response.json({ error: 'database not configured' }, { status: 503 });
  const date = new URL(req.url).searchParams.get('date') ?? istDate(new Date());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return Response.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 });
  const start = istMidnightUTC(date);
  const end = new Date(start.getTime() + 86400000);
  const { db } = getDb();
  const blocks = await db
    .select()
    .from(schema.block15m)
    .where(
      and(
        eq(schema.block15m.siteId, SITE_ID),
        gte(schema.block15m.blockStart, start),
        lt(schema.block15m.blockStart, end),
      ),
    )
    .orderBy(asc(schema.block15m.blockStart));
  const [day] = await db
    .select()
    .from(schema.day1d)
    .where(and(eq(schema.day1d.siteId, SITE_ID), eq(schema.day1d.day, date)));
  return Response.json({ date, blocks, day: day ?? null }, { headers: { 'cache-control': 'private, max-age=10' } });
}
