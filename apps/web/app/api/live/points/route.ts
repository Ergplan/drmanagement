import { getDb, latestReadings } from '@drm/db';
import { getHandler } from '@/lib/api';

export const dynamic = 'force-dynamic';

/** Latest 1-minute value of every point (Live energy feeders, Thermal, Solar backup, Street View panels). */
export const GET = getHandler(async () => {
  const rows = await latestReadings(getDb().db, 15);
  return {
    at: new Date().toISOString(),
    points: Object.fromEntries(rows.map((r) => [r.pointId, { v: r.value, t: r.ts, s: r.source, q: r.quality }])),
  };
});
