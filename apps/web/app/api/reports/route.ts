import { createReport, getDb, listReports } from '@drm/db';
import { z } from 'zod';
import { actionHandler, getHandler, HttpError, SITE_ID } from '@/lib/api';

export const dynamic = 'force-dynamic';

export const GET = getHandler(async () => ({ reports: await listReports(getDb().db, SITE_ID) }));

const Body = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('monthly'), month: z.string().regex(/^\d{4}-\d{2}$/) }),
  z.object({ kind: z.literal('weekly'), to: z.iso.datetime().optional() }),
  z.object({ kind: z.literal('event'), eventId: z.string().min(3) }),
  z.object({ kind: z.literal('bill_audit') }),
]);

/** Queue a report. The edge's headless browser renders it to PDF within a minute. */
export const POST = actionHandler(
  async (req, user) => {
    const b = Body.safeParse(await req.json());
    if (!b.success) throw new HttpError(400, 'kind and its period are required');
    const d = b.data;
    const params =
      d.kind === 'monthly'
        ? { month: d.month }
        : d.kind === 'weekly'
          ? { to: d.to ?? new Date().toISOString() }
          : d.kind === 'event'
            ? { eventId: d.eventId }
            : {};
    const id = await createReport(getDb().db, {
      siteId: SITE_ID,
      kind: d.kind,
      periodFrom: d.kind === 'monthly' ? `${d.month}-01` : null,
      params,
      requestedBy: user.id,
    });
    return { ok: true, id };
  },
  ['facility_manager', 'medical_superintendent', 'duty_engineer', 'accounts', 'joulewise_ops'],
);
