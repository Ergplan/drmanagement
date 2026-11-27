import { IngestBatch } from '@drm/contracts';
import { verifyEdge } from '@/lib/edge-auth';

export const dynamic = 'force-dynamic';

/** Edge uplink. Stage 0 accepts heartbeats and logs them; Stage 2 persists readings, blocks and events. */
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
  if (!parsed.success) return Response.json({ ok: false, error: 'invalid batch' }, { status: 422 });
  const b = parsed.data;
  console.log(JSON.stringify({ msg: 'edge heartbeat', deviceId: b.deviceId, batchId: b.batchId, health: b.health }));
  return Response.json({ ok: true, batchId: b.batchId, receivedAt: new Date().toISOString() });
}
