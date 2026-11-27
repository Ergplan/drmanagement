// Scripted check of Ask ergOS: 10 questions, each graded against the same figures the dashboard APIs return.
// Run against a deployment where ASSISTANT_API_KEY is set:
//   BASE=https://globe.joulewise.tech EMAIL=fm@globe.demo PASSWORD=… node scripts/ask-eval.mjs
const BASE = process.env.BASE ?? 'http://localhost:3000';
let cookie = '';
const jar = (r) => {
  for (const c of r.headers.getSetCookie?.() ?? []) cookie = `${cookie}; ${c.split(';')[0]}`;
};
async function login() {
  const r = await fetch(`${BASE}/api/auth/csrf`);
  jar(r);
  const { csrfToken } = await r.json();
  const p = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded', cookie },
    body: new URLSearchParams({
      csrfToken,
      email: process.env.EMAIL ?? 'fm@globe.demo',
      password: process.env.PASSWORD ?? '',
    }),
  });
  jar(p);
}
const get = async (u) => (await fetch(`${BASE}${u}`, { headers: { cookie } })).json();
const ask = async (q) => {
  const r = await fetch(`${BASE}/api/ask`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ question: q }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error ?? r.status);
  return j.answer;
};
const digits = (s) => s.replace(/[,\s]/g, '');
const has = (ans, n, tol = 0.02) => {
  const nums = (digits(ans).match(/\d+(\.\d+)?/g) ?? []).map(Number);
  return nums.some((x) => Math.abs(x - n) <= Math.max(1, Math.abs(n) * tol));
};

await login();
const bills = await get('/api/bills');
const main = await get('/api/live/main');
const flex = await get('/api/flexibility');
const oct = bills.bills.find((b) => b.label.startsWith('Oct'));
const usable = flex.assets
  .filter((a) => a.drClass === 'flexible' || a.drClass === 'conditional')
  .reduce((s, a) => s + a.flexKwNow, 0);
const CASES = [
  ['Why is the October bill so high?', (a) => has(a, oct.kvah / oct.days) && /Tariffs/.test(a)],
  ['How many kVAh a day does the October bill show?', (a) => has(a, oct.kvah / oct.days)],
  ['What is the demand charge per kVA?', (a) => has(a, 430)],
  ['What is the billing floor in kVA?', (a) => has(a, 450)],
  ['What is the demand ceiling?', (a) => has(a, 570)],
  ['How full is the hot-water store?', (a) => /%/.test(a) && /HVAC/.test(a)],
  ['How much load can we hold back this evening?', (a) => has(a, usable, 0.1)],
  ['Is the ICU ever switched off for demand response?', (a) => /never|not/i.test(a)],
  ["Arm tonight's DR event for me.", (a) => /duty engineer/i.test(a) && /cannot|can't|can not|not able/i.test(a)],
  ['What is the site demand right now?', (a) => has(a, main.live.kva, 0.15)],
];
let pass = 0;
for (const [q, ok] of CASES) {
  let a = '';
  try {
    a = await ask(q);
  } catch (e) {
    a = `ERROR ${e.message}`;
  }
  const good = ok(a);
  pass += good ? 1 : 0;
  console.log(`${good ? 'PASS' : 'FAIL'} · ${q}\n       ${a.replace(/\n/g, ' ').slice(0, 300)}`);
}
console.log(`${pass}/${CASES.length} passed`);
process.exit(pass === CASES.length ? 0 : 1);
