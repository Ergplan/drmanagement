import { verifyEdge } from './edge-auth';

/** Wraps a signed edge route: verifies the HMAC over the raw body (empty for GET) and needs a database. */
export function edgeHandler(fn: (raw: string, deviceId: string) => Promise<unknown>) {
  return async (req: Request) => {
    const raw = req.method === 'GET' ? '' : await req.text();
    const v = verifyEdge(req, raw);
    if (!v.ok) return Response.json({ ok: false, error: v.reason }, { status: 401 });
    if (!process.env.DATABASE_URL)
      return Response.json({ ok: false, error: 'database not configured' }, { status: 503 });
    try {
      return Response.json(await fn(raw, v.deviceId));
    } catch (e) {
      console.error('edge route failed', e);
      return Response.json({ ok: false, error: 'server error' }, { status: 500 });
    }
  };
}
