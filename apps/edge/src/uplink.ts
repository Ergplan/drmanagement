import { createHmac, randomUUID } from 'node:crypto';
import { EDGE_HEADERS, IngestAck, type IngestBatch } from '@drm/contracts';

export interface UplinkConfig {
  cloudUrl: string;
  deviceId: string;
  deviceSecret: string;
}

/** Signs and posts one batch. Outbound HTTPS only (no inbound ports at the hospital). */
export async function sendBatch(
  cfg: UplinkConfig,
  batch: Omit<IngestBatch, 'batchId' | 'deviceId' | 'sentAt'>,
): Promise<IngestAck> {
  const full: IngestBatch = {
    batchId: randomUUID(),
    deviceId: cfg.deviceId,
    sentAt: new Date().toISOString(),
    ...batch,
  };
  const body = JSON.stringify(full);
  const ts = Math.floor(Date.now() / 1000).toString();
  const sig = createHmac('sha256', cfg.deviceSecret).update(`${ts}.${body}`).digest('hex');
  const res = await fetch(new URL('/api/edge/ingest', cfg.cloudUrl), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      [EDGE_HEADERS.device]: cfg.deviceId,
      [EDGE_HEADERS.timestamp]: ts,
      [EDGE_HEADERS.signature]: sig,
    },
    body,
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`ingest ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return IngestAck.parse(await res.json());
}
