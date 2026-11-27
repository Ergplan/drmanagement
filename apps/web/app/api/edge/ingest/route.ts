import { IngestBatch } from '@drm/contracts';
import { getDb, persistBatch } from '@drm/db';
import { verifyEdge } from '@/lib/edge-auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const SITE_ID = 'globe-lko';

/** Edge uplink: signed batches of readings, blocks, days and control events. Idempotent per batch. */
export async function POST(req: Request) {
  const raw = await req.text();
  const v = verifyEdge(req, raw);
  if (!v.ok) return Response.json({ ok: false, error: v.reason }, { status: 401 });
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return Response.json({ ok: false, error: 'invalid json' }, { status: 400 });
  }
  const parsed = IngestBatch.safeParse(body);
  if (!parsed.success)
    return Response.json(
      { ok: false, error: 'invalid batch', issues: parsed.error.issues.slice(0, 5) },
      { status: 422 },
    );
  const b = parsed.data;
  if (!process.env.DATABASE_URL) {
    console.log(
      JSON.stringify({ msg: 'edge batch (no database configured)', deviceId: b.deviceId, readings: b.readings.length }),
    );
    return Response.json({ ok: true, batchId: b.batchId, receivedAt: new Date().toISOString() });
  }
  try {
    await persistBatch(getDb().db, SITE_ID, v.deviceId, b);
  } catch (e) {
    console.error('ingest failed', e);
    return Response.json({ ok: false, error: 'storage failed' }, { status: 503 });
  }
  return Response.json({ ok: true, batchId: b.batchId, receivedAt: new Date().toISOString() });
}
