import { IntentAck } from '@drm/contracts';
import { getDb, recordAcks } from '@drm/db';
import { z } from 'zod';
import { edgeHandler } from '@/lib/edge-route';

export const dynamic = 'force-dynamic';

const Body = z.object({ acks: z.array(IntentAck).max(200) });

/** What the edge did with each intent: accepted, rejected at re-validation, done, aborted. */
export const POST = edgeHandler(async (raw) => {
  const b = Body.parse(JSON.parse(raw));
  await recordAcks(getDb().db, b.acks);
  return { ok: true, n: b.acks.length };
});
