/**
 * Fills history by running the same driver + collector the live edge uses, minute by minute, from BACKFILL_FROM
 * (default 2025-12-01 IST) to now. Blocks and days are kept for the whole period; 1-minute readings only for the
 * last BACKFILL_READING_DAYS (default 7). Writes straight to the database (DATABASE_URL).
 * Run on the VM before starting the edge: pnpm --filter @drm/edge backfill
 */
import type { BlockRow, DayRow, ReadingRow } from '@drm/contracts';
import { getDb, persistBatch } from '@drm/db';
import { SimDriver } from '@drm/drivers/sim';
import { Collector } from './collector';

const SITE = 'globe-lko';
const DEVICE = process.env.DEVICE_ID ?? 'edge-globe-lko-01';
const from = new Date(process.env.BACKFILL_FROM ?? '2025-12-01T00:00:00+05:30');
const to = new Date(process.env.BACKFILL_TO ?? Date.now());
const readingDays = Number(process.env.BACKFILL_READING_DAYS ?? 7);
const readingsFrom = to.getTime() - readingDays * 86400000;

const { db, sql } = getDb();
const driver = new SimDriver({ seed: Number(process.env.SIM_SEED ?? 42) });
let readings: ReadingRow[] = [];
let blocks: BlockRow[] = [];
let days: DayRow[] = [];
let written = { readings: 0, blocks: 0, days: 0 };

async function flush(force = false) {
  if (!force && readings.length < 20000 && blocks.length < 400) return;
  for (let i = 0; i < Math.max(readings.length, 1); i += 20000) {
    const r = readings.slice(i, i + 20000);
    const b = i === 0 ? blocks : [];
    const d = i === 0 ? days : [];
    for (let j = 0; j < Math.max(b.length, 1); j += 400) {
      await persistBatch(db, SITE, DEVICE, {
        health: { backfill: true },
        readings: j === 0 ? r : [],
        blocks: b.slice(j, j + 400),
        days: j === 0 ? d : [],
        events: [],
      });
    }
  }
  written = {
    readings: written.readings + readings.length,
    blocks: written.blocks + blocks.length,
    days: written.days + days.length,
  };
  readings = [];
  blocks = [];
  days = [];
}

const collector = new Collector({
  readings: (rows) => {
    if (rows.length && new Date(rows[0]!.t).getTime() >= readingsFrom) readings.push(...rows);
  },
  block: (b) => blocks.push(b),
  day: (d) => days.push(d),
});

const t0 = Date.now();
let lastLog = t0;
for (let t = from.getTime(); t <= to.getTime(); t += 60000) {
  const now = new Date(t);
  collector.tick(now, driver.read(now));
  if (readings.length >= 20000 || blocks.length >= 400) await flush();
  if (Date.now() - lastLog > 15000) {
    lastLog = Date.now();
    console.log(`backfill at ${now.toISOString()} · written ${JSON.stringify(written)}`);
  }
}
await flush(true);
console.log(`backfill done in ${Math.round((Date.now() - t0) / 1000)} s · ${JSON.stringify(written)}`);
await sql.end();
