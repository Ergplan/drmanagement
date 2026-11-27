// API check for every endpoint: auth required, role rules, signed edge routes, response shapes.
//   BASE=https://globe.joulewise.tech PASSWORD=… node scripts/api-check.mjs
const BASE = process.env.BASE ?? 'http://localhost:3000';
const PASSWORD = process.env.PASSWORD ?? '';
async function session(email) {
  let cookie = '';
  const jar = (r) => {
    for (const c of r.headers.getSetCookie?.() ?? []) cookie = `${cookie}; ${c.split(';')[0]}`;
  };
  const r = await fetch(`${BASE}/api/auth/csrf`);
  jar(r);
  const { csrfToken } = await r.json();
  jar(
    await fetch(`${BASE}/api/auth/callback/credentials`, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'content-type': 'application/x-www-form-urlencoded', cookie },
      body: new URLSearchParams({ csrfToken, email, password: PASSWORD }),
    }),
  );
  return cookie;
}
let fails = 0;
const check = (name, ok, extra = '') => {
  if (!ok) fails += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'} · ${name}${extra ? ` · ${extra}` : ''}`);
};
const GETS = {
  '/api/health': (j) => j && typeof j === 'object',
  '/api/site': (j) => !!j,
  '/api/assets': (j) => Array.isArray(j) || !!j,
  '/api/nodes': (j) => Array.isArray(j) && j.length === 26,
  '/api/bills': (j) => Array.isArray(j.bills) && j.bills.length >= 3,
  '/api/tariff': (j) => !!j,
  '/api/live/main': (j) => 'live' in j && 'ladder' in j,
  '/api/live/points': (j) => Object.keys(j.points ?? {}).length > 50,
  '/api/overview': (j) => !!j.ladder,
  '/api/forecast': (j) => Array.isArray(j.blocks) && j.blocks.length >= 96,
  '/api/solar': (j) => Array.isArray(j.days),
  '/api/control': (j) => Array.isArray(j.interlocks) && j.interlocks.length === 9,
  '/api/flexibility': (j) => Array.isArray(j.assets),
  '/api/optimizer': (j) => !!j.plan && Array.isArray(j.plan.excluded),
  '/api/events': (j) => Array.isArray(j.events),
  '/api/me': (j) => !!j.role,
  '/api/mv': (j) => typeof j.days === 'number',
  '/api/opportunities': (j) => Array.isArray(j.opportunities),
  '/api/reports': (j) => Array.isArray(j.reports),
  '/api/street': (j) => j.nodes?.length === 26,
  '/api/grid/signals': (j) => Array.isArray(j.signals),
  '/api/commissioning': (j) => Array.isArray(j.points) && j.points.length >= 80,
  '/api/points/ht-meter.kva/series': (j) => Array.isArray(j.rows),
};
// Unauthenticated: every data route refuses.
for (const u of Object.keys(GETS).filter((u) => u !== '/api/health')) {
  const r = await fetch(`${BASE}${u}`);
  check(`no session ${u}`, r.status === 401, String(r.status));
}
for (const u of ['/api/edge/intents', '/api/edge/reports', '/api/edge/housekeeping']) {
  const r = await fetch(`${BASE}${u}`);
  check(`unsigned ${u}`, r.status === 401, String(r.status));
}
const r0 = await fetch(`${BASE}/api/edge/ingest`, {
  method: 'POST',
  body: '{}',
  headers: {
    'x-drm-device': 'edge-globe-lko-01',
    'x-drm-timestamp': String(Math.floor(Date.now() / 1000)),
    'x-drm-signature': 'bad',
  },
});
check('bad signature /api/edge/ingest', r0.status === 401, String(r0.status));
const cron = await fetch(`${BASE}/api/cron/daily`);
check('cron without secret', cron.status === 401, String(cron.status));
// Signed in: every GET answers with the expected shape.
const fm = await session('fm@globe.demo');
for (const [u, ok] of Object.entries(GETS)) {
  const t0 = Date.now();
  const r = await fetch(`${BASE}${u}`, { headers: { cookie: fm } });
  const j = await r.json().catch(() => null);
  check(`GET ${u}`, r.status === 200 && ok(j), `${r.status} · ${Date.now() - t0} ms`);
}
// Role rules on writes.
const viewer = await session('viewer@globe.demo');
const post = (cookie, u, b) =>
  fetch(`${BASE}${u}`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify(b),
  });
check(
  'viewer cannot propose',
  (await post(viewer, '/api/events', { date: '2026-01-01', start: '17:30', end: '20:00', targetKw: 60 })).status ===
    403,
);
check('viewer cannot queue a report', (await post(viewer, '/api/reports', { kind: 'bill_audit' })).status === 403);
check(
  'viewer cannot map a point',
  (await post(viewer, '/api/points/lt-main.kw/mapping', { sourceDriver: 'x1' })).status === 403,
);
check(
  'viewer cannot move an opportunity',
  (await post(viewer, '/api/opportunities/pf-retune', { status: 'to_approve' })).status === 403,
);
const de = await session('de@globe.demo');
check('duty engineer cannot approve', (await post(de, '/api/events/none', { decision: 'approve' })).status >= 400);
check('bad report kind refused', (await post(fm, '/api/reports', { kind: 'nope' })).status === 400);
check(
  'optimizer rejects an off-grid time',
  (await fetch(`${BASE}/api/optimizer?start=17:10`, { headers: { cookie: fm } })).status === 400,
);
console.log(fails ? `${fails} failed` : 'all passed');
process.exit(fails ? 1 : 0);
