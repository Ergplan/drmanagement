import { getDb, getReport } from '@drm/db';
import { notFound } from 'next/navigation';
import { auth } from '@/auth';
import { BillAuditReport, EventReport, MonthlyReport, WeeklyReport } from '@/components/print/Reports';
import { billAuditData, eventData, monthlyData, weeklyData } from '@/lib/report-data';
import { checkReportToken } from '@/lib/report-token';

export const dynamic = 'force-dynamic';

/** Printable report. Opened by a signed-in user, or by the edge's headless browser with a short-lived token. */
export default async function PrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { id } = await params;
  const { t } = await searchParams;
  if (!checkReportToken(id, t) && !(await auth())?.user) notFound();
  const r = await getReport(getDb().db, id);
  if (!r) notFound();
  const generated = new Date().toISOString();
  const p = r.params as { month?: string; eventId?: string; to?: string };
  let body: React.ReactNode;
  if (r.kind === 'monthly')
    body = <MonthlyReport d={await monthlyData(r.siteId, p.month ?? '')} generated={generated} />;
  else if (r.kind === 'weekly')
    body = <WeeklyReport d={await weeklyData(r.siteId, p.to ?? r.createdAt.toISOString())} generated={generated} />;
  else if (r.kind === 'event')
    body = <EventReport d={await eventData(r.siteId, p.eventId ?? '')} generated={generated} />;
  else if (r.kind === 'bill_audit') body = <BillAuditReport d={await billAuditData(r.siteId)} generated={generated} />;
  else notFound();
  return (
    <main className="rp" data-report-ready="true">
      {body}
    </main>
  );
}
