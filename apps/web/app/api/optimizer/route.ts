import { auth } from '@/auth';
import { HttpError, SITE_ID } from '@/lib/api';
import { planFor } from '@/lib/planning';

export const dynamic = 'force-dynamic';

/** Preview a DR plan: forecast for the date, the loads ergOS would use, and the peak with and without them. */
export async function GET(req: Request) {
  if (!(await auth())?.user) return Response.json({ error: 'sign in required' }, { status: 401 });
  if (!process.env.DATABASE_URL) return Response.json({ error: 'database not configured' }, { status: 503 });
  const u = new URL(req.url).searchParams;
  try {
    const t = u.get('target');
    return Response.json(
      await planFor(SITE_ID, {
        date: u.get('date'),
        start: u.get('start'),
        end: u.get('end'),
        targetKw: t ? Number(t) : null,
      }),
    );
  } catch (e) {
    if (e instanceof HttpError) return Response.json({ error: e.message }, { status: e.status });
    console.error(e);
    return Response.json({ error: 'server error' }, { status: 500 });
  }
}
