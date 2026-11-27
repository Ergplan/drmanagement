import { z } from 'zod';

/** Edge -> cloud. Stage 0 carries only health; Stage 2 adds readings, blocks, days and events. */
export const EdgeHealth = z.object({
  version: z.string(),
  uptimeS: z.number().nonnegative(),
  drivers: z.record(z.string(), z.enum(['ok', 'degraded', 'down'])),
  bufferedBatches: z.number().int().nonnegative(),
});
export type EdgeHealth = z.infer<typeof EdgeHealth>;

export const IngestBatch = z.object({
  batchId: z.string().min(8),
  deviceId: z.string().min(3),
  sentAt: z.iso.datetime(),
  health: EdgeHealth,
});
export type IngestBatch = z.infer<typeof IngestBatch>;

export const IngestAck = z.object({ ok: z.boolean(), batchId: z.string(), receivedAt: z.iso.datetime() });
export type IngestAck = z.infer<typeof IngestAck>;

/** Header names for the signed edge uplink. Body is HMAC-SHA256(secret, `${timestamp}.${rawBody}`), hex. */
export const EDGE_HEADERS = {
  device: 'x-drm-device',
  timestamp: 'x-drm-timestamp',
  signature: 'x-drm-signature',
} as const;
export const EDGE_MAX_SKEW_S = 300;
