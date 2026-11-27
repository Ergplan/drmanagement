import { createReport, getDb, listEvents, listReports } from '@drm/db';
import { istDate } from '@drm/domain';
import { SITE_ID } from '@/lib/api';
import { eventSettlement } from '@/lib/report-data';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Vercel Cron, daily 01:00 IST: settle ended events, queue the monthly report on the 1st (previous month) and the
 * weekly duty report on Mondays. Idempotent: skips reports already queued for the period.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`)
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!process.env.DATABASE_URL) return Response.json({ error: 'database not configured' }, { status: 503 });
  const db = getDb().db;
  const out: Record<string, unknown> = {};
  const events = (await listEvents(db, SITE_ID, 100)).filter((e) => e.status === 'completed' || e.status === 'aborted');
  const settled: string[] = [];
  for (const e of events) {
    const s = await eventSettlement(SITE_ID, e.id);
    if (s.ready) settled.push(e.id);
  }
  out.settled = settled;
  const today = istDate(new Date());
  const existing = await listReports(db, SITE_ID, 200);
  if (today.endsWith('-01')) {
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() - 1);
    const month = d.toISOString().slice(0, 7);
    if (!existing.some((r) => r.kind === 'monthly' && (r.params as { month?: string }).month === month))
      out.monthly = await createReport(db, {
        siteId: SITE_ID,
        kind: 'monthly',
        periodFrom: `${month}-01`,
        params: { month },
        requestedBy: 'cron',
      });
  }
  if (
    new Date(`${today}T00:00:00Z`).getUTCDay() === 1 &&
    !existing.some(
      (r) => r.kind === 'weekly' && r.createdAt.toISOString().slice(0, 10) === new Date().toISOString().slice(0, 10),
    )
  )
    out.weekly = await createReport(db, {
      siteId: SITE_ID,
      kind: 'weekly',
      params: { to: new Date().toISOString() },
      requestedBy: 'cron',
    });
  return Response.json({ ok: true, ...out });
}
