import { createHmac } from 'node:crypto';
import { EDGE_HEADERS, type EdgeIntent, type IntentAck, IntentsResponse } from '@drm/contracts';
import type { UplinkConfig } from './uplink';

export function signedHeaders(cfg: UplinkConfig, body: string) {
  const ts = Math.floor(Date.now() / 1000).toString();
  return {
    'content-type': 'application/json',
    [EDGE_HEADERS.device]: cfg.deviceId,
    [EDGE_HEADERS.timestamp]: ts,
    [EDGE_HEADERS.signature]: createHmac('sha256', cfg.deviceSecret).update(`${ts}.${body}`).digest('hex'),
  };
}

/** GET approved, armed intents every 5 s (outbound only). The signature covers the timestamp and an empty body. */
export async function pullIntents(cfg: UplinkConfig): Promise<EdgeIntent[]> {
  const res = await fetch(new URL('/api/edge/intents', cfg.cloudUrl), {
    headers: signedHeaders(cfg, ''),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`intents ${res.status}`);
  return IntentsResponse.parse(await res.json()).intents;
}

/** Report what the edge did with each intent. */
export async function sendAcks(cfg: UplinkConfig, acks: IntentAck[]): Promise<void> {
  const body = JSON.stringify({ acks });
  const res = await fetch(new URL('/api/edge/intents/ack', cfg.cloudUrl), {
    method: 'POST',
    headers: signedHeaders(cfg, body),
    body,
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`ack ${res.status}`);
}
