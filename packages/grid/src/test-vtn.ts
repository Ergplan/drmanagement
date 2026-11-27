/**
 * A small local OpenADR 3.0 VTN for tests and demos: OAuth client-credentials token, /programs, /events (and
 * POST /events to add one). Run: pnpm --filter @drm/grid test-vtn  (port 8088).
 */
import { createServer, type Server } from 'node:http';
import type { OadrEvent } from './ven';

export function startTestVtn(
  port = 8088,
  events: OadrEvent[] = [],
): Promise<{ server: Server; url: string; events: OadrEvent[] }> {
  const programs = [{ id: 'prog-1', programName: 'MVVNL-DR-PILOT' }];
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    const send = (code: number, body: unknown) => {
      res.writeHead(code, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    let body = '';
    req.on('data', (c) => {
      body += c;
    });
    req.on('end', () => {
      if (req.method === 'POST' && url.pathname.endsWith('/auth/token')) {
        const p = new URLSearchParams(body);
        if (p.get('client_id') !== 'ven-globe' || p.get('client_secret') !== 'test-secret')
          return send(401, { error: 'invalid_client' });
        return send(200, { access_token: 'tok-1', token_type: 'Bearer', expires_in: 3600 });
      }
      if (req.headers.authorization !== 'Bearer tok-1') return send(401, { title: 'unauthorized' });
      if (req.method === 'GET' && url.pathname.endsWith('/programs')) return send(200, programs);
      if (req.method === 'GET' && url.pathname.endsWith('/events'))
        return send(
          200,
          events.filter((e) => !url.searchParams.get('programID') || e.programID === url.searchParams.get('programID')),
        );
      if (req.method === 'POST' && url.pathname.endsWith('/events')) {
        events.push(JSON.parse(body) as OadrEvent);
        return send(201, { ok: true });
      }
      send(404, { title: 'not found' });
    });
  });
  return new Promise((r) =>
    server.listen(port, '127.0.0.1', () => r({ server, url: `http://127.0.0.1:${port}`, events })),
  );
}

if (process.argv[1]?.endsWith('test-vtn.ts')) {
  const start = new Date(Date.now() + 3 * 3600000);
  start.setUTCMinutes(0, 0, 0);
  void startTestVtn(Number(process.env.PORT ?? 8088), [
    {
      id: 'evt-demo-1',
      programID: 'prog-1',
      eventName: 'Evening peak',
      modificationDateTime: new Date().toISOString(),
      intervalPeriod: { start: start.toISOString(), duration: 'PT2H' },
      intervals: [{ id: 0, payloads: [{ type: 'LOAD_DISPATCH', values: [-60] }] }],
    },
  ]).then((v) => console.log(`test VTN on ${v.url} · client ven-globe / test-secret`));
}
