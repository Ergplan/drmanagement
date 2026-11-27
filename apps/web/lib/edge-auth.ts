import { createHmac, timingSafeEqual } from 'node:crypto';
import { EDGE_HEADERS, EDGE_MAX_SKEW_S } from '@drm/contracts';

/**
 * Verifies a signed edge request. Stage 0: one device, secret from EDGE_DEVICE_SECRET.
 * Stage 1 moves device secrets to the device table.
 */
export function verifyEdge(
  req: Request,
  rawBody: string,
): { ok: true; deviceId: string } | { ok: false; reason: string } {
  const deviceId = req.headers.get(EDGE_HEADERS.device) ?? '';
  const ts = req.headers.get(EDGE_HEADERS.timestamp) ?? '';
  const sig = req.headers.get(EDGE_HEADERS.signature) ?? '';
  const secret = process.env.EDGE_DEVICE_SECRET;
  const expectedDevice = process.env.EDGE_DEVICE_ID;
  if (!secret || !expectedDevice) return { ok: false, reason: 'edge auth not configured' };
  if (deviceId !== expectedDevice) return { ok: false, reason: 'unknown device' };
  const skew = Math.abs(Date.now() / 1000 - Number(ts));
  if (!Number.isFinite(skew) || skew > EDGE_MAX_SKEW_S) return { ok: false, reason: 'stale timestamp' };
  const mac = createHmac('sha256', secret).update(`${ts}.${rawBody}`).digest('hex');
  const a = Buffer.from(mac);
  const b = Buffer.from(sig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: 'bad signature' };
  return { ok: true, deviceId };
}
