import { createHmac, randomUUID } from 'node:crypto';
import { EDGE_HEADERS, type EdgeHealth, IngestAck, type IngestBatch } from '@drm/contracts';

export interface UplinkConfig {
  cloudUrl: string;
  deviceId: string;
  deviceSecret: string;
}

/** Signs and sends one batch to the cloud. Outbound HTTPS only (no inbound ports at the hospital). */
export async function sendBatch(cfg: UplinkConfig, health: EdgeHealth): Promise<IngestAck> {
  const batch: IngestBatch = {
    batchId: randomUUID(),
    deviceId: cfg.deviceId,
    sentAt: new Date().toISOString(),
    health,
  };
  const body = JSON.stringify(batch);
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
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`ingest ${res.status}: ${await res.text()}`);
  return IngestAck.parse(await res.json());
}
