// Performance check: chart endpoints with 90 days of 1-minute data in the table, and 20 concurrent viewers.
//   BASE=… PASSWORD=… node scripts/perf-check.mjs
const BASE = process.env.BASE ?? 'http://localhost:3000';
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
    body: new URLSearchParams({ csrfToken, email: 'fm@globe.demo', password: process.env.PASSWORD ?? '' }),
  }),
);
const time = async (u) => {
  const t0 = performance.now();
  const x = await fetch(`${BASE}${u}`, { headers: { cookie } });
  const b = await x.arrayBuffer();
  return { ms: performance.now() - t0, status: x.status, kb: b.byteLength / 1024 };
};
const pct = (xs, p) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor((p / 100) * xs.length))];
const cases = [
  ['day chart (blocks, today)', '/api/live/main'],
  ['day chart for a past day', '/api/day?date=2026-10-15'],
  ['point, 24 h of 1-minute data', '/api/points/chillers.kw/series?from=2026-10-15T00:00:00Z&to=2026-10-16T00:00:00Z'],
  [
    'point, 31 days of 1-minute data',
    '/api/points/chillers.kw/series?from=2026-09-28T00:00:00Z&to=2026-10-29T00:00:00Z',
  ],
  ['forecast (28 days of blocks)', '/api/forecast'],
];
for (const [name, u] of cases) {
  const runs = [];
  for (let i = 0; i < 5; i++) runs.push(await time(u));
  console.log(
    `${name}: median ${pct(
      runs.map((x) => x.ms),
      50,
    ).toFixed(
      0,
    )} ms, worst ${Math.max(...runs.map((x) => x.ms)).toFixed(0)} ms, ${runs[0].kb.toFixed(0)} kB, HTTP ${runs[0].status}`,
  );
}
// 20 viewers polling the live endpoints every 5 s for 30 s.
const lat = [];
let errors = 0;
const viewer = async () => {
  for (let k = 0; k < 6; k++) {
    for (const u of ['/api/live/main', '/api/live/points', '/api/control']) {
      const x = await time(u);
      lat.push(x.ms);
      if (x.status !== 200) errors += 1;
    }
    await new Promise((s) => setTimeout(s, 5000));
  }
};
await Promise.all(Array.from({ length: 20 }, viewer));
console.log(
  `20 viewers × 30 s: ${lat.length} requests, p50 ${pct(lat, 50).toFixed(0)} ms, p95 ${pct(lat, 95).toFixed(0)} ms, errors ${errors}`,
);
