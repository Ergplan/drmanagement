import { SITE_ID } from '@/lib/api';
import { edgeHandler } from '@/lib/edge-route';
import { pollVtn } from '@/lib/grid';
import { escalate } from '@/lib/notify';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Called by the edge every 5 minutes (outbound, signed): poll the OpenADR VTN when enabled and escalate
 * unacknowledged notices. Keeps minute-level jobs off Vercel Cron.
 */
export const GET = edgeHandler(async () => {
  const grid = await pollVtn('openadr-ven').catch((e: Error) => ({ enabled: true, error: e.message, results: [] }));
  const escalated = await escalate(SITE_ID);
  return { ok: true, grid, escalated };
});
