import { claimReports, getDb } from '@drm/db';
import { SITE_ID } from '@/lib/api';
import { edgeHandler } from '@/lib/edge-route';
import { reportToken } from '@/lib/report-token';

export const dynamic = 'force-dynamic';

/** Report jobs for the edge renderer, each with a 15-minute print URL. */
export const GET = edgeHandler(async () => {
  const base =
    process.env.PUBLIC_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : 'http://localhost:3000');
  const jobs = await claimReports(getDb().db, SITE_ID);
  return { jobs: jobs.map((j) => ({ id: j.id, kind: j.kind, url: `${base}/print/${j.id}?t=${reportToken(j.id)}` })) };
});
