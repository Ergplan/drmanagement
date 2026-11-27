import { getDb, pendingIntents } from '@drm/db';
import { SITE_ID } from '@/lib/api';
import { edgeHandler } from '@/lib/edge-route';

export const dynamic = 'force-dynamic';

/** The edge pulls approved, armed intents every 5 s (invariant 2: the cloud never actuates). */
export const GET = edgeHandler(async () => ({
  intents: await pendingIntents(getDb().db, SITE_ID),
  at: new Date().toISOString(),
}));
