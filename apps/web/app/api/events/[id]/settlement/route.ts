import { auth } from '@/auth';
import { SITE_ID } from '@/lib/api';
import { eventSettlement } from '@/lib/report-data';

export const dynamic = 'force-dynamic';

/** Settlement for one event; ?recompute=1 recalculates from the metered blocks. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await auth())?.user) return Response.json({ error: 'sign in required' }, { status: 401 });
  if (!process.env.DATABASE_URL) return Response.json({ error: 'database not configured' }, { status: 503 });
  const { id } = await ctx.params;
  const recompute = new URL(req.url).searchParams.get('recompute') === '1';
  try {
    return Response.json(await eventSettlement(SITE_ID, id, recompute));
  } catch (e) {
    console.error(e);
    return Response.json({ error: 'server error' }, { status: 500 });
  }
}
