/** Report jobs: requested in the cloud, rendered to PDF by the edge's Playwright, stored in Blob or here. */
import { and, desc, eq, inArray, lt, or, sql } from 'drizzle-orm';
import type { Db } from './client';
import * as s from './schema';

export type ReportKind = 'monthly' | 'weekly' | 'event' | 'bill_audit';

export async function createReport(
  db: Db,
  a: {
    siteId: string;
    kind: ReportKind;
    periodFrom?: string | null;
    periodTo?: string | null;
    params?: Record<string, unknown>;
    requestedBy: string;
  },
): Promise<string> {
  const id = `rp-${a.kind}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  await db.insert(s.report).values({
    id,
    siteId: a.siteId,
    kind: a.kind,
    periodFrom: a.periodFrom ?? null,
    periodTo: a.periodTo ?? null,
    params: a.params ?? {},
    requestedBy: a.requestedBy,
    status: 'pending',
  });
  await db.insert(s.auditLog).values({
    actor: a.requestedBy,
    action: 'report_requested',
    entity: 'report',
    entityId: id,
    after: { kind: a.kind, periodFrom: a.periodFrom, periodTo: a.periodTo, params: a.params },
  });
  return id;
}

export async function listReports(db: Db, siteId: string, limit = 50) {
  return db
    .select({
      id: s.report.id,
      kind: s.report.kind,
      periodFrom: s.report.periodFrom,
      periodTo: s.report.periodTo,
      params: s.report.params,
      status: s.report.status,
      error: s.report.error,
      blobUrl: s.report.blobUrl,
      requestedBy: s.report.requestedBy,
      readyAt: s.report.readyAt,
      createdAt: s.report.createdAt,
      hasPdf: sql<boolean>`${s.report.pdf} is not null`,
    })
    .from(s.report)
    .where(eq(s.report.siteId, siteId))
    .orderBy(desc(s.report.createdAt))
    .limit(limit);
}

/** Jobs for the renderer: pending ones, plus any stuck in `rendering` for over 10 minutes. Claims them. */
export async function claimReports(db: Db, siteId: string, max = 3) {
  const stale = sql`now() - interval '10 minutes'`;
  const rows = await db
    .select({ id: s.report.id, kind: s.report.kind })
    .from(s.report)
    .where(
      and(
        eq(s.report.siteId, siteId),
        or(eq(s.report.status, 'pending'), and(eq(s.report.status, 'rendering'), lt(s.report.createdAt, stale))),
      ),
    )
    .orderBy(s.report.createdAt)
    .limit(max);
  if (rows.length)
    await db
      .update(s.report)
      .set({ status: 'rendering' })
      .where(
        inArray(
          s.report.id,
          rows.map((r) => r.id),
        ),
      );
  return rows;
}

export async function finishReport(db: Db, id: string, r: { pdf?: Buffer; blobUrl?: string; error?: string }) {
  await db
    .update(s.report)
    .set(
      r.error
        ? { status: 'failed', error: r.error }
        : { status: 'ready', pdf: r.pdf ?? null, blobUrl: r.blobUrl ?? null, readyAt: new Date(), error: null },
    )
    .where(eq(s.report.id, id));
}

export async function reportPdf(db: Db, id: string) {
  const [r] = await db
    .select({
      pdf: s.report.pdf,
      blobUrl: s.report.blobUrl,
      kind: s.report.kind,
      siteId: s.report.siteId,
      periodFrom: s.report.periodFrom,
    })
    .from(s.report)
    .where(eq(s.report.id, id));
  return r ?? null;
}

export async function getReport(db: Db, id: string) {
  const [r] = await db
    .select({
      id: s.report.id,
      siteId: s.report.siteId,
      kind: s.report.kind,
      periodFrom: s.report.periodFrom,
      periodTo: s.report.periodTo,
      params: s.report.params,
      createdAt: s.report.createdAt,
    })
    .from(s.report)
    .where(eq(s.report.id, id));
  return r ?? null;
}
