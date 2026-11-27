import { sql } from 'drizzle-orm';
import type { Db } from './client';

export interface LatestReading {
  pointId: string;
  ts: Date;
  value: number;
  source: string;
  quality: string;
}

/** Latest 1-minute value of every point seen in the last `minutes` (one row per point). */
export async function latestReadings(db: Db, minutes = 15): Promise<LatestReading[]> {
  const rows = await db.execute(sql`
    select distinct on (point_id) point_id, ts, value, source, quality
    from reading_1m where ts > now() - make_interval(mins => ${minutes})
    order by point_id, ts desc`);
  return (rows as unknown as Array<{ point_id: string; ts: Date; value: number; source: string; quality: string }>).map(
    (r) => ({
      pointId: r.point_id,
      ts: new Date(r.ts),
      value: Number(r.value),
      source: r.source,
      quality: r.quality,
    }),
  );
}

/** IST-day block series (avg kVA per block) for the last `days` days, for forecasting. */
export async function blockHistory(
  db: Db,
  siteId: string,
  fromUtc: Date,
): Promise<Array<{ blockStart: Date; avgKva: number }>> {
  const rows = await db.execute(sql`
    select block_start, avg_kva from block_15m where site_id = ${siteId} and block_start >= ${fromUtc.toISOString()}
    order by block_start`);
  return (rows as unknown as Array<{ block_start: Date; avg_kva: number }>).map((r) => ({
    blockStart: new Date(r.block_start),
    avgKva: Number(r.avg_kva),
  }));
}
