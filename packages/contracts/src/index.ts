import { z } from 'zod';

/** Edge → cloud health and live snapshot (latest main-meter state, every batch). */
export const EdgeHealth = z.object({
  version: z.string(),
  uptimeS: z.number().nonnegative(),
  drivers: z.record(z.string(), z.enum(['ok', 'degraded', 'down'])),
  bufferedBatches: z.number().int().nonnegative(),
});
export type EdgeHealth = z.infer<typeof EdgeHealth>;

export const LiveSnapshot = z.object({
  at: z.iso.datetime(),
  kva: z.number(),
  kw: z.number(),
  kvar: z.number(),
  pf: z.number(),
  solarKw: z.number(),
  loadKw: z.number(),
  blockNo: z.number().int().min(1).max(96),
  blockElapsedMin: z.number(),
  blockKvah: z.number(),
  projectedKva: z.number(),
  monthMdKva: z.number(),
  todayKwh: z.number(),
  todayKvah: z.number(),
  todaySolarKwh: z.number(),
  todayCostInr: z.number(),
  hwSocPct: z.number().nullable(),
  source: z.string(),
  quality: z.enum(['good', 'estimated', 'stale', 'bad']),
  ceiling: z.object({ armed: z.boolean(), stage: z.number().int(), held: z.array(z.string()) }).optional(),
});
export type LiveSnapshot = z.infer<typeof LiveSnapshot>;

/** 1-minute average of one point. Compact keys keep batches small. */
export const ReadingRow = z.object({
  p: z.string(), // point id
  t: z.iso.datetime(), // minute start (UTC)
  v: z.number(),
  s: z.string(), // source
  q: z.enum(['good', 'estimated', 'stale', 'bad']),
});
export type ReadingRow = z.infer<typeof ReadingRow>;

export const BlockRow = z.object({
  blockStart: z.iso.datetime(),
  blockNo: z.number().int().min(1).max(96),
  kwh: z.number(),
  kvah: z.number(),
  kvarh: z.number(),
  avgKva: z.number(),
  maxKva: z.number(),
  solarKwh: z.number(),
  assetKwh: z.record(z.string(), z.number()),
  source: z.string(),
  quality: z.enum(['good', 'estimated', 'stale', 'bad']),
});
export type BlockRow = z.infer<typeof BlockRow>;

export const DayRow = z.object({
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  kwh: z.number(),
  kvah: z.number(),
  mdKva: z.number(),
  solarKwh: z.number(),
  costInr: z.number(),
  assetKwh: z.record(z.string(), z.number()),
  source: z.string(),
});
export type DayRow = z.infer<typeof DayRow>;

/** Append-only control records produced at the edge (Stage 4 fills these). */
export const EdgeEvent = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('interlock'),
    interlockId: z.string(),
    at: z.iso.datetime(),
    state: z.enum(['healthy', 'tripped', 'stale']),
    value: z.string().nullable(),
  }),
  z.object({
    kind: z.literal('command'),
    id: z.string(),
    assetId: z.string(),
    action: z.string(),
    params: z.record(z.string(), z.unknown()),
    reason: z.enum(['ceiling', 'dr', 'schedule', 'restore', 'manual']),
    intentId: z.string().nullable(),
    sentAt: z.iso.datetime(),
    result: z.enum(['ok', 'refused', 'failed']),
    detail: z.string().nullable(),
  }),
  z.object({
    kind: z.literal('ceiling'),
    at: z.iso.datetime(),
    stage: z.number().int(),
    action: z.enum(['shed', 'restore', 'page']),
    assetId: z.string().nullable(),
    projectedKva: z.number(),
  }),
  z.object({
    kind: z.literal('dr_log'),
    eventId: z.string(),
    at: z.iso.datetime(),
    entry: z.string(),
    detail: z.record(z.string(), z.unknown()),
  }),
]);
export type EdgeEvent = z.infer<typeof EdgeEvent>;

export const IngestBatch = z.object({
  batchId: z.string().min(8),
  deviceId: z.string().min(3),
  sentAt: z.iso.datetime(),
  health: EdgeHealth,
  live: LiveSnapshot.optional(),
  readings: z.array(ReadingRow).max(20000).default([]),
  blocks: z.array(BlockRow).max(500).default([]),
  days: z.array(DayRow).max(60).default([]),
  events: z.array(EdgeEvent).max(2000).default([]),
});
export type IngestBatch = z.input<typeof IngestBatch>;

export const IngestAck = z.object({ ok: z.boolean(), batchId: z.string(), receivedAt: z.iso.datetime() });
export type IngestAck = z.infer<typeof IngestAck>;

/** Header names for the signed edge uplink. Signature is HMAC-SHA256(secret, `${timestamp}.${rawBody}`), hex. */
export const EDGE_HEADERS = {
  device: 'x-drm-device',
  timestamp: 'x-drm-timestamp',
  signature: 'x-drm-signature',
} as const;
export const EDGE_MAX_SKEW_S = 300;
