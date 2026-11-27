import { createHmac, timingSafeEqual } from 'node:crypto';

/** Short-lived token so the edge's headless browser can open one report's print page without a user session. */
const key = () => process.env.AUTH_SECRET ?? '';

export function reportToken(id: string, ttlS = 900): string {
  const exp = Math.floor(Date.now() / 1000) + ttlS;
  return `${exp}.${createHmac('sha256', key()).update(`report:${id}:${exp}`).digest('hex')}`;
}

export function checkReportToken(id: string, token: string | undefined | null): boolean {
  if (!token || !key()) return false;
  const [exp, mac] = token.split('.');
  if (!exp || !mac || Number(exp) < Date.now() / 1000) return false;
  const want = Buffer.from(createHmac('sha256', key()).update(`report:${id}:${exp}`).digest('hex'));
  const got = Buffer.from(mac);
  return want.length === got.length && timingSafeEqual(want, got);
}
