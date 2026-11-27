import { finishReport, getDb } from '@drm/db';
import { z } from 'zod';
import { edgeHandler } from '@/lib/edge-route';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const Body = z.object({
  id: z.string(),
  pdfBase64: z.string().max(6_000_000).optional(),
  error: z.string().max(2000).optional(),
});

/** The edge returns a rendered PDF (or the error). Kept in the VM database (default) or Vercel Blob when REPORTS_IN_BLOB=1. */
export const POST = edgeHandler(async (raw) => {
  const b = Body.parse(JSON.parse(raw));
  const db = getDb().db;
  if (b.error || !b.pdfBase64) {
    await finishReport(db, b.id, { error: b.error ?? 'empty pdf' });
    return { ok: true };
  }
  const pdf = Buffer.from(b.pdfBase64, 'base64');
  if (pdf.subarray(0, 4).toString() !== '%PDF') {
    await finishReport(db, b.id, { error: 'not a PDF' });
    return { ok: false };
  }
  if (process.env.BLOB_READ_WRITE_TOKEN && process.env.REPORTS_IN_BLOB === '1') {
    const { put } = await import('@vercel/blob');
    const blob = await put(`reports/${b.id}.pdf`, pdf, {
      access: 'public',
      contentType: 'application/pdf',
      addRandomSuffix: true,
    });
    await finishReport(db, b.id, { blobUrl: blob.url });
  } else await finishReport(db, b.id, { pdf });
  return { ok: true };
});
